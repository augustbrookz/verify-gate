import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFreshness, FRESHNESS_BANNED_WORDS, runEngine, type DatedSource } from '../src/index';

async function check(answer: string, sources: DatedSource[], opts: { require_dated_sources?: boolean } = {}) {
  const r = await runEngine({ question: 'q', answer, sources });
  return { r, f: computeFreshness(r.claims, sources, opts) };
}

describe('source freshness v0 fixtures', () => {
  it('stale but quoted: a newer source that supersedes the cited one changes 30 days to 14 → conflicted, human_review', async () => {
    const sources: DatedSource[] = [
      { id: 'returns-2025', text: 'Returns are accepted within 30 days of delivery for unworn items.', effective_date: '2025-01-01' },
      { id: 'returns-2026', text: 'Returns are accepted within 14 days of delivery for unworn items.', effective_date: '2026-03-01', supersedes: ['returns-2025'] },
    ];
    const { f } = await check('Returns are accepted within 30 days of delivery for unworn items.', sources);
    expect(f).toMatchObject({ status: 'conflicted_by_newer_source', cited_source_id: 'returns-2025', newer_source_id: 'returns-2026', conflict_type: 'number', recommended_release: 'human_review' });
  });

  it('undated sources → unknown, reported only (no release effect)', async () => {
    const { r, f } = await check('Returns are accepted within 30 days of delivery for unworn items.', [{ id: 'returns', text: 'Returns are accepted within 30 days of delivery for unworn items.' }]);
    expect(r.claims[0].verdict).toBe('supported');
    expect(f).toMatchObject({ status: 'unknown', recommended_release: null });
    expect(f.explanation).toMatch(/no effective date, publication date or version/);
  });

  it('undated sources with require_dated_sources → human_review', async () => {
    const { f } = await check('Returns are accepted within 30 days of delivery for unworn items.', [{ id: 'returns', text: 'Returns are accepted within 30 days of delivery for unworn items.' }], { require_dated_sources: true });
    expect(f.recommended_release).toBe('human_review');
  });

  it('a newer source WITHOUT supersedes is not presumed controlling → unknown, not conflicted', async () => {
    const sources: DatedSource[] = [
      { id: 'faq', text: 'Returns are accepted within 30 days of delivery for unworn items.', effective_date: '2025-01-01' },
      { id: 'blog', text: 'Returns are accepted within 14 days of delivery for unworn items.', published_at: '2026-05-01' },
    ];
    const { f } = await check('Returns are accepted within 30 days of delivery for unworn items.', sources);
    expect(f.status).toBe('unknown');
    expect(f.newer_source_id).toBe('blog');
    expect(f.recommended_release).toBeNull();
  });

  it('explicit supersedes conflict → conflicted', async () => {
    const sources: DatedSource[] = [
      { id: 'v1', text: 'Members may bring two guests per visit to the main pool.', version: '1.0' },
      { id: 'v2', text: 'Members may bring one guest per visit to the main pool.', version: '2.0', supersedes: ['v1'] },
    ];
    const { f } = await check('Members may bring two guests per visit to the main pool.', sources);
    expect(f.status).toBe('conflicted_by_newer_source');
  });

  it('authority_rank: a newer primary source controls an older secondary one; never the reverse', async () => {
    const primaryNewer: DatedSource[] = [
      { id: 'help', text: 'Shipping is free on orders over $50 within the United States.', effective_date: '2025-06-01', authority_rank: 'secondary' },
      { id: 'terms', text: 'Shipping is free on orders over $75 within the United States.', effective_date: '2026-01-01', authority_rank: 'primary' },
    ];
    expect((await check('Shipping is free on orders over $50 within the United States.', primaryNewer)).f.status).toBe('conflicted_by_newer_source');
    const secondaryNewer: DatedSource[] = [
      { id: 'terms', text: 'Shipping is free on orders over $50 within the United States.', effective_date: '2025-06-01', authority_rank: 'primary' },
      { id: 'help', text: 'Shipping is free on orders over $75 within the United States.', effective_date: '2026-01-01', authority_rank: 'secondary' },
    ];
    expect((await check('Shipping is free on orders over $50 within the United States.', secondaryNewer)).f.status).toBe('unknown');
  });

  it('a dated source with no controlling conflict → established', async () => {
    const { f } = await check('Returns are accepted within 30 days of delivery for unworn items.', [{ id: 'returns', text: 'Returns are accepted within 30 days of delivery for unworn items.', effective_date: '2026-02-01' }]);
    expect(f.status).toBe('established');
  });

  it('never uses the words current, valid or authoritative', async () => {
    const sources: DatedSource[] = [
      { id: 'a', text: 'Returns are accepted within 30 days of delivery for unworn items.', effective_date: '2025-01-01' },
      { id: 'b', text: 'Returns are accepted within 14 days of delivery for unworn items.', effective_date: '2026-01-01', supersedes: ['a'] },
    ];
    const outputs = [await check('Returns are accepted within 30 days of delivery for unworn items.', sources), await check('Returns are accepted within 30 days of delivery for unworn items.', [{ id: 'x', text: 'Returns are accepted within 30 days of delivery for unworn items.' }])];
    const code = readFileSync(new URL('../src/freshness.ts', import.meta.url), 'utf8').replace(/FRESHNESS_BANNED_WORDS[^\n]*\n/, '');
    const strings = [...code.matchAll(/(['`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
    for (const w of FRESHNESS_BANNED_WORDS) {
      const re = new RegExp(`\\b${w}\\b`, 'i');
      for (const o of outputs) expect(JSON.stringify(o.f)).not.toMatch(re);
      for (const s of strings) expect(s, s).not.toMatch(re);
    }
  });
});
