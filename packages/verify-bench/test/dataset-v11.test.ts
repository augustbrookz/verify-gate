import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locateQuote } from '@xyntherium/verify-core';
import { loadDevV11, loadManifestV11, loadReviewQueueV11 } from '../src/dataset-v11';
import { MIN_PUBLISHED_CATEGORY_N, reportCategory } from '../src/score';
import type { BenchItem } from '../src/types';

const ROOT = new URL('../../..', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const dev = loadDevV11();
const heldout = read('packages/verify-bench/data/verify-bench-v1.1.heldout.json') as BenchItem[];
const queued = read('packages/verify-bench/data/review-queue-items-v1.1.json') as BenchItem[];
const all = [...dev, ...heldout];
const alphaDev = read('packages/verify-bench/data/verify-bench-v1.dev.json') as BenchItem[];
const alphaHeld = read('packages/verify-bench/data/verify-bench-v1.heldout.json') as BenchItem[];
const ecfr = read('packages/verify-bench/data/public-sources/ecfr-2026-10-01.json') as { license: string; sections: { citation: string; paragraphs: string[] }[] };

describe('verify-bench v1.1 dataset', () => {
  it('has at least 500 held-out items and at least 80 per reporting category', () => {
    expect(heldout.length).toBeGreaterThanOrEqual(500);
    const counts: Record<string, number> = {};
    for (const it of heldout) counts[reportCategory(it)] = (counts[reportCategory(it)] ?? 0) + 1;
    for (const c of ['supported', 'contradicted', 'unsupported', 'qualifier_loss', 'numeric']) {
      expect(counts[c] ?? 0, c).toBeGreaterThanOrEqual(MIN_PUBLISHED_CATEGORY_N);
    }
  });

  it('reports the review queue honestly and never publishes a queued item', () => {
    const m = loadManifestV11();
    expect(m.version).toBe('verify-bench-v1.1');
    expect(m.counts.published).toBe(all.length);
    expect(m.counts.in_review_queue).toBe(new Set(loadReviewQueueV11().map((q) => q.item_id)).size);
    expect(queued.length).toBe(m.counts.in_review_queue);
    const published = new Set(all.map((i) => i.id));
    for (const q of queued) expect(published.has(q.id), q.id).toBe(false);
  });

  it('every gold span exists verbatim in its source, and code can locate it', () => {
    for (const it of all) {
      for (const span of it.gold.gold_spans) {
        const src = it.sources.find((s) => s.id === span.source_id);
        expect(src, `${it.id} cites ${span.source_id}`).toBeDefined();
        expect(src!.text.includes(span.quote), `${it.id} span verbatim`).toBe(true);
        expect(locateQuote(src!.text, span.quote).ok || span.quote.length < 8, `${it.id} span locatable`).toBe(true);
      }
    }
  });

  it('records planted changes and dropped qualifiers consistently', () => {
    for (const it of all) {
      const text = it.sources.map((s) => s.text).join('\n');
      if (it.category === 'numeric') {
        const pc = it.gold.planted_change!;
        expect(it.gold.gold_spans.some((s) => s.quote.includes(pc.from)), it.id).toBe(true);
        expect(it.answer.includes(pc.to), it.id).toBe(true);
        expect(text.includes(pc.to), `${it.id}: planted value must not be in the passages`).toBe(false);
      }
      if (it.category === 'qualifier_loss') {
        const q = it.gold.dropped_qualifier!;
        expect(text.includes(q), it.id).toBe(true);
        expect(it.answer.toLowerCase().includes(q.toLowerCase()), it.id).toBe(false);
      }
    }
  });

  it('splits by family: no family in both splits, roughly 60/40', () => {
    const devFamilies = new Set(dev.map((i) => i.family_id));
    for (const it of heldout) expect(devFamilies.has(it.family_id), it.family_id).toBe(false);
    const share = dev.length / all.length;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
  });

  it('is rebuilt deterministically (file hashes match the manifest)', () => {
    const m = loadManifestV11();
    const h = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
    expect(h('packages/verify-bench/data/verify-bench-v1.1.dev.json')).toBe(m.sha256.dev);
    expect(h('packages/verify-bench/data/verify-bench-v1.1.heldout.json')).toBe(m.sha256.heldout);
    expect(h('packages/verify-bench/data/public-sources/ecfr-2026-10-01.json')).toBe(m.public_sources![0].sha256);
  });

  it('keeps every v1-alpha published item unchanged, in the same split', () => {
    const v11 = new Map(all.map((i) => [i.id, i]));
    for (const a of [...alphaDev, ...alphaHeld]) {
      expect(v11.get(a.id), a.id).toEqual(a);
    }
  });

  it('every public item names its public-domain source, and its passages are that source text', () => {
    const paragraphs = new Set(ecfr.sections.flatMap((s) => s.paragraphs));
    const citations = new Set(ecfr.sections.map((s) => s.citation));
    expect(ecfr.license).toMatch(/public domain/i);
    const pub = all.filter((i) => i.id.startsWith('pub-'));
    expect(pub.length).toBeGreaterThan(1000);
    for (const it of pub) {
      expect(it.provenance?.license, it.id).toBe('public-domain-us-government');
      for (const c of it.provenance!.citations) expect(citations.has(c), `${it.id} ${c}`).toBe(true);
      for (const s of it.sources) {
        for (const p of s.text.split('\n\n')) {
          const ok = paragraphs.has(p) || (p.endsWith('…') && [...paragraphs].some((q) => q.startsWith(p.slice(0, -1).trimEnd().split(' ').slice(0, 20).join(' '))));
          expect(ok, `${it.id} ${s.id}: passage paragraph not in the eCFR text`).toBe(true);
        }
      }
    }
  });
});

describe('the /verify/benchmark/method facts', () => {
  it('match the held-out split, its manifest and its registration', async () => {
    const { HELDOUT_V11_FACTS: f } = await import('../src/method-facts');
    const gold = (v: string) => heldout.filter((i) => i.gold.verdict === v);
    const reason = (v: string, r: string) => gold(v).filter((i) => i.gold.failure_reason === r).length;
    const prereg = read('packages/verify-bench/preregistration-v1.1.json');
    const manifest = loadManifestV11();
    expect({
      items: heldout.length,
      families: new Set(heldout.map((i) => i.family_id)).size,
      from_regulations: heldout.filter((i) => i.id.startsWith('pub-')).length,
      supported: gold('supported').length,
      flawed: heldout.length - gold('supported').length,
      contradicted: { total: gold('contradicted').length, number: reason('contradicted', 'number_mismatch'), negation: reason('contradicted', 'negation'), date: reason('contradicted', 'date_mismatch') },
      dropped_condition: reason('unsupported', 'qualifier_loss'),
      not_said: { total: gold('unsupported').length - reason('unsupported', 'qualifier_loss'), never_addressed: reason('unsupported', 'no_support') },
      cannot_settle: gold('unverifiable').length,
      dev_items: dev.length,
      review_queue: manifest.counts.in_review_queue,
      heldout_sha256: manifest.sha256.heldout,
      methodology_sha256: prereg.methodology_sha256,
      methodology_commit: prereg.methodology_commit,
      registered_at: prereg.committed_at,
    }).toEqual({
      items: f.items,
      families: f.families,
      from_regulations: f.from_regulations,
      supported: f.supported,
      flawed: f.flawed,
      contradicted: { total: f.contradicted.total, number: f.contradicted.number, negation: f.contradicted.negation, date: f.contradicted.date },
      dropped_condition: f.dropped_condition,
      not_said: { total: f.not_said.total, never_addressed: f.not_said.never_addressed },
      cannot_settle: f.cannot_settle,
      dev_items: f.dev_items,
      review_queue: f.review_queue,
      heldout_sha256: f.heldout_sha256,
      methodology_sha256: f.methodology_sha256,
      methodology_commit: f.methodology_commit,
      registered_at: f.registered_at,
    });
    expect(f.handwritten).toBe(f.items - f.from_regulations);
    expect(f.contradicted.other).toBe(f.contradicted.total - f.contradicted.number - f.contradicted.negation - f.contradicted.date);
    expect(f.not_said.other).toBe(f.not_said.total - f.not_said.never_addressed);
    expect(f.flawed).toBe(f.contradicted.total + f.dropped_condition + f.not_said.total + f.cannot_settle);
  });
});
