/**
 * Source change detection on real amendment history: consecutive versions of 43 sections
 * of six CFR parts (eCFR point-in-time API), hand-labelled from a neutral diff (see
 * fixtures/build/labels.json), cosmetic-only pairs derived from those amendments, and
 * labelled synthetic edits of the same texts (fixtures/synthetic.ts).
 *
 * fixtures/report.json is the scored result; this test recomputes it and fails if it is
 * stale (rebuild: npx tsx packages/verify-parity/test/fixtures/build/04-report.ts).
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, REPORT_PATH, type Report } from './fixtures/evaluate';

describe('eCFR amendment fixtures', () => {
  let report: Report;
  it('scores the fixture (and matches the committed report)', { timeout: 180_000 }, () => {
    report = evaluate();
    expect(JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it('identical text is never a change', () => {
    expect(report.history.labels.none).toBeGreaterThan(0);
    expect(report.history.identical_text_not_none).toEqual([]);
  });

  it('every real amendment is detected, and what a reviewer needs is named', () => {
    expect(report.history.confusion.fn).toBe(0);
    expect(report.history.recall.p).toBe(1);
    expect(report.history.naming.failures).toEqual([]);
  });

  it('false flags are only the labelled renames (a different word for the same thing cannot be told from a different thing)', () => {
    expect(report.history.false_flags.every((f) => f.label === 'cosmetic' && /rename/.test(f.cosmetic_kind ?? '') && f.named.every((n) => n === 'wording_changed' || n === 'condition_changed'))).toBe(true);
    expect(report.history.precision.p).toBeGreaterThanOrEqual(0.9);
  });

  it('cosmetic-only edits do NOT flag: from real amendments, and every synthetic formatting / drafting edit', () => {
    expect(report.derived_cosmetic.pairs).toBeGreaterThan(0);
    expect(report.derived_cosmetic.flagged_ids).toEqual([]);
    expect(report.synthetic.cosmetic.cases).toBeGreaterThan(300);
    expect(report.synthetic.cosmetic.flagged).toBe(0);
  });

  it('every synthetic real edit flags, with the change named', () => {
    expect(report.synthetic.real.flagged).toBe(report.synthetic.real.cases);
    expect(report.synthetic.real.named).toBe(report.synthetic.real.cases);
  });

  it('a typo fix is reported as a wording change (spelling is not tolerated)', () => {
    expect(report.synthetic.conservative.flagged).toBe(report.synthetic.conservative.cases);
  });
});
