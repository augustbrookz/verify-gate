import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locateQuote } from '@xyntherium/verify-core';
import { loadDev, loadManifest, loadReviewQueue, type BenchItem } from '@xyntherium/verify-bench';

const ROOT = new URL('../../..', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const dev = loadDev();
const heldout = read('packages/verify-bench/data/verify-bench-v1.heldout.json') as BenchItem[];
const queued = read('packages/verify-bench/data/review-queue-items.json') as BenchItem[];
const all = [...dev, ...heldout];

describe('verify-bench dataset', () => {
  it('has 400+ constructed items and reports the review queue honestly', () => {
    const m = loadManifest();
    expect(m.counts.total).toBeGreaterThanOrEqual(400);
    expect(m.counts.published).toBe(all.length);
    expect(m.counts.in_review_queue).toBe(new Set(loadReviewQueue().map((q) => q.item_id)).size);
    expect(queued.length).toBe(m.counts.in_review_queue);
    for (const q of queued) expect(all.find((i) => i.id === q.id)).toBeUndefined();
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

  it('splits by family: no family appears in both splits, roughly 60/40', () => {
    const devFamilies = new Set(dev.map((i) => i.family_id));
    for (const it of heldout) expect(devFamilies.has(it.family_id), it.family_id).toBe(false);
    const share = dev.length / all.length;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
    expect(dev.every((i) => i.split === 'dev') && heldout.every((i) => i.split === 'heldout')).toBe(true);
  });

  it('is rebuilt deterministically from the raw shards', () => {
    const m = loadManifest();
    const h = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
    expect(h('packages/verify-bench/data/verify-bench-v1.dev.json')).toBe(m.sha256.dev);
    expect(h('packages/verify-bench/data/verify-bench-v1.heldout.json')).toBe(m.sha256.heldout);
  });

  it('labels only with the published vocabulary', () => {
    for (const it of all) {
      expect(['supported', 'contradicted', 'unsupported', 'unverifiable']).toContain(it.gold.verdict);
      expect(['allow', 'cite_required', 'revise', 'human_review']).toContain(it.gold.expected_release);
    }
  });
});

describe('held-out enforcement', () => {
  it('only allowlisted modules import the held-out loader or file', () => {
    const allowed = new Set([
      'packages/verify-bench/src/heldout.ts',
      'packages/verify-bench/src/heldout-v11.ts',
      'packages/verify-bench/test/dataset-v11.test.ts',
      'scripts/verify-bench-local-v11.ts', // final evaluation of the deterministic layer, after registration
      'packages/verify-bench/src/reproduce.ts', // re-runs frozen, published rule versions for anyone to check; tunes nothing
      'tests/verify/freshness-nonregression.test.ts', // asserts responses are unchanged; runs no method and tunes nothing
      'packages/verify-bench/scripts/build.mjs', // writes the split; runs no method on it
      'packages/verify-bench/test/dataset.test.ts',
      'packages/verify-bench/test/heldout.test.ts',
      'lib/verify/bench/evaluate.ts',
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (['node_modules', '.next', '.git', 'dist', 'raw'].includes(name)) continue;
        const rel = `${dir}/${name}`.replace(/^\.\//, '');
        const st = statSync(join(ROOT, rel));
        if (st.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mts|mjs|js)$/.test(name) && !allowed.has(rel)) {
          const src = readFileSync(join(ROOT, rel), 'utf8');
          if (/verify-bench-v1(?:\.\d+)?\.heldout|from ['"][^'"]*\/heldout(?:-v\d+)?['"]|loadHeldout\w*ForFinalEvaluation/.test(src)) offenders.push(rel);
        }
      }
    };
    // (The public verify-gate repository has only packages/ and scripts/.)
    for (const d of ['app', 'lib', 'packages', 'scripts', 'tests', 'components']) if (existsSync(join(ROOT, d))) walk(d);
    expect(offenders).toEqual([]);
  });
});
