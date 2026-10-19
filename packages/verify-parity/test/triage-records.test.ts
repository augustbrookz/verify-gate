import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@xyntherium/verify-core';
import { detectSourceChange, PARITY_VERSION, sourceChangeRecord, triageDisagreement, triageRecord, type VerifierRun } from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const run = (run_id: string, outcome: string, sources: Record<string, string>): VerifierRun => ({ run_id, outcome, sources });

describe('triageDisagreement', () => {
  it('runs that agree need nothing', () => {
    expect(triageDisagreement([run('r1', 'supported', { refunds: A }), run('r2', 'supported', { refunds: B })])).toMatchObject({ kind: 'agreement', route: 'NONE' });
  });

  it('a disagreement on different snapshots is an infrastructure fault: REEVAL on one snapshot', () => {
    const t = triageDisagreement([run('r1', 'supported', { refunds: A }), run('r2', 'contradicted', { refunds: B })]);
    expect(t).toMatchObject({ kind: 'infrastructure_fault', route: 'REEVAL', outcomes: ['contradicted', 'supported'] });
    expect(t.mismatched_sources).toEqual([{ source_id: 'refunds', hashes: { r1: A, r2: B } }]);
  });

  it('a source one run lacks is a mismatch', () => {
    const t = triageDisagreement([run('r1', 'supported', { refunds: A, terms: B }), run('r2', 'unsupported', { refunds: A })]);
    expect(t.kind).toBe('infrastructure_fault');
    expect(t.mismatched_sources.map((m) => m.source_id)).toEqual(['terms']);
  });

  it('a disagreement on identical snapshots is genuine: routed per policy', () => {
    const runs = [run('r1', 'supported', { refunds: A }), run('r2', 'contradicted', { refunds: A })];
    expect(triageDisagreement(runs)).toMatchObject({ kind: 'genuine_disagreement', route: 'human_review' });
    expect(triageDisagreement(runs, { genuine_disagreement: 'block' })).toMatchObject({ kind: 'genuine_disagreement', route: 'block' });
  });

  it('needs two runs', () => {
    expect(() => triageDisagreement([run('r1', 'supported', {})])).toThrow(/at least two/);
  });
});

describe('ledger records', () => {
  const before = 'Refunds within 30 days of purchase.';
  const after = 'Refunds within 14 days of purchase.';
  const change = detectSourceChange({ before, after, captured_at: '2026-10-18T00:00:00.000Z', include_text: true });

  it('a source change record references texts by SHA-256 unless text is included', () => {
    const r = sourceChangeRecord(change, { source_id: 'refunds', path: 'kb/refunds.md', include_text: false });
    expect(r).toMatchObject({ record_type: 'source_change', parity_version: PARITY_VERSION, schema: 'source-document@1', kind: 'real', before_text_sha256: sha256Hex(before), after_text_sha256: sha256Hex(after) });
    expect(r.changes[0]).toEqual({ type: 'condition_changed', class: 'deadline', before_sha256: sha256Hex('within 30 days of purchase'), after_sha256: sha256Hex('within 14 days of purchase') });
    expect(JSON.stringify(r)).not.toMatch(/30 days|14 days/);
    expect(sourceChangeRecord(change, { source_id: 'refunds', path: 'kb/refunds.md', include_text: true }).changes[0]).toMatchObject({ before: 'within 30 days of purchase', after: 'within 14 days of purchase' });
  });

  it('a triage record carries the runs, the route and the mismatched sources', () => {
    const runs = [run('r1', 'supported', { refunds: A }), run('r2', 'contradicted', { refunds: B })];
    expect(triageRecord('annual-refund-window', runs, triageDisagreement(runs))).toMatchObject({ record_type: 'disagreement_triage', subject: 'annual-refund-window', kind: 'infrastructure_fault', route: 'REEVAL', mismatched_sources: ['refunds'] });
  });
});
