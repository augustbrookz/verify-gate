#!/usr/bin/env node
/**
 * Compact summary of every verify-bench v1.1 results file, for the public
 * benchmark page: per rules version, the held-out headline metrics and the
 * per-category metrics with their published / preliminary status (a
 * category is published at n >= 80). Derived only from the results files;
 * tests/verify/bench-summary.test.ts fails if it drifts from them.
 *
 *   node packages/verify-bench/scripts/summary-v11.mjs [--check]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
const OUT = join(RESULTS, 'summary-v1.1.json');
const HEADLINE = ['false_supported_rate', 'unsupported_release_rate', 'supported_recall', 'qualifier_loss_detection', 'qualifier_loss_named', 'contradiction_detection', 'abstention_rate', 'exact_verdict_accuracy'];
const r4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10_000) / 10_000);
const rate = (r) => (r ? { k: r.k, n: r.n, p: r4(r.p), lo: r4(r.lo), hi: r4(r.hi) } : null);
const pick = (m) => Object.fromEntries(HEADLINE.map((k) => [k, rate(m[k])]));
const cmp = (a, b) => a.split('.').map(Number).reduce((d, x, i) => d || x - Number(b.split('.')[i]), 0);

export function summarise() {
  const files = readdirSync(RESULTS).filter((f) => /^\d{4}-\d{2}-\d{2}-v1\.1-code-only-rules-\d+\.\d+\.\d+\.json$/.test(f));
  const runs = files
    .map((f) => {
      const r = JSON.parse(readFileSync(join(RESULTS, f), 'utf8'));
      return {
        file: `packages/verify-bench/results/${f}`,
        rules_version: r.rules_version,
        method: r.method,
        run_at: r.run_at,
        preregistration_sha256: r.preregistration_sha256,
        dataset_sha256: r.dataset_sha256,
        heldout: { n: r.report.by_split.heldout.n, ...pick(r.report.by_split.heldout) },
        heldout_by_category: Object.fromEntries(Object.entries(r.by_report_category.heldout).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => [c, { status: v.status, n: v.metrics.n, ...pick(v.metrics) }])),
      };
    })
    .sort((a, b) => cmp(a.rules_version, b.rules_version));
  return { version: 'verify-bench-v1.1', split: 'heldout', min_published_category_n: 80, interval: '95% Wilson', runs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = `${JSON.stringify(summarise(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== text) {
      console.error('summary-v1.1.json is out of date: run node packages/verify-bench/scripts/summary-v11.mjs');
      process.exit(1);
    }
  } else writeFileSync(OUT, text);
  console.log(`${OUT}: ${summarise().runs.length} runs`);
}
