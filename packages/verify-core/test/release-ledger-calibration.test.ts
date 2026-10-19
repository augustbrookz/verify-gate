import { describe, expect, it } from 'vitest';
import {
  BANNED_VERDICT_WORDS,
  FAILURE_REASONS,
  OVERALL_STATUSES,
  RELEASE_RECOMMENDATIONS,
  VERDICTS,
  buildBins,
  calibratedConfidence,
  decideRelease,
  entryHash,
  payloadHash,
  verifyChain,
  wilson,
  type LedgerEntry,
} from '@xyntherium/verify-core';

type C = Parameters<typeof decideRelease>[0]['claims'][number];
const claim = (verdict: C['verdict'], extra: Partial<C> = {}): C => ({
  index: 0,
  verdict,
  failure_reason: null,
  material: true,
  citation: { cited: [], status: 'not_required' },
  ...extra,
});

describe('decideRelease', () => {
  it('allows when every material claim is supported', () => {
    const r = decideRelease({ claims: [claim('supported'), claim('supported')], partial: false, requireCitations: false });
    expect(r.release_recommendation).toBe('allow');
    expect(r.overall_status).toBe('all_supported');
  });

  it('revises on any contradiction or qualifier loss, even when partial', () => {
    expect(decideRelease({ claims: [claim('supported'), claim('contradicted')], partial: false, requireCitations: false }).release_recommendation).toBe('revise');
    const ql = decideRelease({ claims: [claim('unsupported', { failure_reason: 'qualifier_loss' })], partial: true, requireCitations: false });
    expect(ql.release_recommendation).toBe('revise');
    expect(ql.qualifier_loss_detected).toBe(true);
    expect(ql.overall_status).toBe('partial');
  });

  it('sends unverifiable or partial results to human review', () => {
    expect(decideRelease({ claims: [claim('supported'), claim('unverifiable')], partial: false, requireCitations: false }).release_recommendation).toBe('human_review');
    expect(decideRelease({ claims: [claim('supported')], partial: true, requireCitations: false }).release_recommendation).toBe('human_review');
  });

  it('requires citations when asked and one is missing', () => {
    const r = decideRelease({
      claims: [claim('supported', { citation: { cited: ['S1'], status: 'ok' } }), claim('supported', { citation: { cited: [], status: 'missing' } })],
      partial: false,
      requireCitations: true,
    });
    expect(r.release_recommendation).toBe('cite_required');
  });

  it('honours thresholds for unsupported and unverifiable claims', () => {
    const r = decideRelease({
      claims: [claim('supported'), claim('unsupported', { failure_reason: 'no_supporting_span' }), claim('unverifiable')],
      partial: false,
      requireCitations: false,
      thresholds: { max_unsupported: 1, max_unverifiable: 1 },
    });
    expect(r.release_recommendation).toBe('allow');
    expect(r.release_reasons[0]).toMatch(/within thresholds/);
  });

  it('reports insufficient sources when nothing could be matched', () => {
    const r = decideRelease({ claims: [claim('unsupported', { failure_reason: 'no_supporting_span' })], partial: false, requireCitations: false });
    expect(r.overall_status).toBe('insufficient_sources');
  });

  it('never allows non-material-only answers silently', () => {
    expect(decideRelease({ claims: [], partial: false, requireCitations: false }).release_recommendation).toBe('human_review');
  });
});

describe('verdict vocabulary', () => {
  it('uses no word that implies real-world truth', () => {
    const values = [...VERDICTS, ...FAILURE_REASONS, ...RELEASE_RECOMMENDATIONS, ...OVERALL_STATUSES];
    for (const v of values) {
      for (const banned of BANNED_VERDICT_WORDS) {
        expect(v.replace(/_/g, ' ').toLowerCase().split(' ')).not.toContain(banned);
        expect(v.replace(/_/g, ' ').toLowerCase()).not.toBe(banned);
      }
    }
  });
});

function chain(n: number): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  let prev: string | null = null;
  for (let seq = 1; seq <= n; seq++) {
    const payload = { request_id: `r${seq}`, verdicts: ['supported'], seq };
    const ph = payloadHash(payload);
    const eh = entryHash(prev, ph, seq, `r${seq}`);
    out.push({ seq, request_id: `r${seq}`, payload, payload_hash: ph, prev_hash: prev, entry_hash: eh });
    prev = eh;
  }
  return out;
}

describe('evidence ledger', () => {
  it('verifies an intact chain', () => {
    expect(verifyChain(chain(5))).toEqual({ ok: true, checked: 5, problems: [] });
  });

  it('detects a tampered payload, a broken link, and a gap', () => {
    const tampered = chain(4);
    (tampered[1].payload as { verdicts: string[] }).verdicts = ['contradicted'];
    expect(verifyChain(tampered).problems[0]).toMatch(/seq 2: payload_hash/);

    const relinked = chain(4);
    relinked[2] = { ...relinked[2], prev_hash: 'f'.repeat(64) };
    expect(verifyChain(relinked).ok).toBe(false);

    const gap = chain(4);
    gap.splice(1, 1);
    expect(verifyChain(gap).problems.some((p) => p.includes('gap'))).toBe(true);
  });

  it('matches the SQL formula: sha256(prev|payload|seq|request)', () => {
    expect(entryHash(null, 'abc', 1, 'r1')).toBe(entryHash('GENESIS', 'abc', 1, 'r1'));
  });
});

describe('calibration', () => {
  it('computes Wilson intervals', () => {
    const w = wilson(81, 263);
    expect(w.p).toBeCloseTo(0.308, 3);
    expect(w.lo).toBeCloseTo(0.2553, 3);
    expect(w.hi).toBeCloseTo(0.3662, 3);
    expect(wilson(0, 0).p).toBeNull();
  });

  it('returns null until a validated table with enough held-out items exists', () => {
    const obs = (n: number, correct: number, score: number) =>
      Array.from({ length: n }, (_, i) => ({ verdict: 'supported' as const, internal_score: score, correct: i < correct }));
    const bins = buildBins(obs(40, 36, 0.97), obs(20, 18, 0.97));
    expect(calibratedConfidence(null, 'supported', 0.97)).toBeNull();
    expect(calibratedConfidence({ version: 'v1', bins, validated: false }, 'supported', 0.97)).toBeNull();
    const c = calibratedConfidence({ version: 'v1', bins, validated: true }, 'supported', 0.97);
    expect(c).toEqual({ value: 0.9, label: 'calibrated on benchmark v1' });
    expect(calibratedConfidence({ version: 'v1', bins, validated: true }, 'supported', 0.65)).toBeNull();
  });
});
