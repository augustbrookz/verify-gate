/**
 * KNOWN LIMITATION, pinned: a short sentence (under five tokens) that flips the
 * polarity of its source — "Monthly plans are refundable." against "Monthly
 * plans are not refundable." — is below the template rule's minimum length, so
 * code does not decide it.
 *
 *   local mode   must come back unverifiable (Gate: warn), NEVER supported
 *   hosted mode  must NEVER be supported, whatever the model says: an honest
 *                model's contradiction is reported (model-dependent, so warn by
 *                default); a model that wrongly calls it supported is refused,
 *                because a model cannot confirm support across a polarity
 *                difference code found
 *
 * Listed in docs/verify-gate-architecture.md ("Known limitations") and on the
 * published benchmark and docs pages.
 */
import { describe, expect, it } from 'vitest';
import { runEngine, scoreSentences, type Adjudicator } from '@xyntherium/verify-core';
import { evaluateAnswer, evaluateCase, resolvePolicy } from '../src/index';

const SOURCES = [{ id: 'plans', text: 'Monthly plans are not refundable. Annual plans can be cancelled for a full refund within 30 days of purchase.' }];
const ANSWER = 'Monthly plans are refundable.';
const policy = resolvePolicy({ enforcement: 'enforce' }).policy;

const cost = { provider: 'fake', model: 'fake', calls: 1, input_tokens: 0, output_tokens: 0, cost_cents: 0 };
/** A model that calls everything supported and quotes the closest real sentence. */
const credulous: Adjudicator = async ({ claim, sources }) => {
  const best = scoreSentences(claim, sources)[0];
  return { ok: true, model: 'credulous', prompt_version: 't', cost, adjudication: { verdict: 'supported', reason: '', evidence: best ? [{ source_id: best.source_id, quote: best.range.text, role: 'supports' }] : [], source_qualifiers: [], conflict_type: 'none', unverifiable_reason: 'none', arithmetic: null } };
};
/** A model that gets it right: contradicted, quoting the negated sentence. */
const honest: Adjudicator = async () => ({
  ok: true,
  model: 'honest',
  prompt_version: 't',
  cost,
  adjudication: { verdict: 'contradicted', reason: 'the source says monthly plans are not refundable', evidence: [{ source_id: 'plans', quote: 'Monthly plans are not refundable.', role: 'conflicts' }], source_qualifiers: [], conflict_type: 'negation', unverifiable_reason: 'none', arithmetic: null },
});

describe('short-sentence negation (known limitation, pinned)', () => {
  it('engine, code only: unverifiable (not adjudicated), never supported', async () => {
    const r = await runEngine({ question: 'Are monthly plans refundable?', answer: ANSWER, sources: SOURCES });
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0].verdict).toBe('unverifiable');
    expect(r.claims[0].failure_reason).toBe('not_adjudicated');
  });

  it('Gate local mode: warn, never pass, never supported', async () => {
    const ev = await evaluateAnswer({ question: 'Are monthly plans refundable?', answer: ANSWER, sources: SOURCES, expected: [], policy });
    const d = evaluateCase({ claims: ev.claims, integrity: [], policy, mode: 'local' });
    expect(ev.claims.every((c) => c.verdict !== 'supported')).toBe(true);
    expect(d.decision).toBe('warn');
    expect(d.findings[0]).toMatchObject({ rule: 'XYN-005', kind: 'not_adjudicated' });
  });

  for (const [name, adjudicate, allowStrong] of [
    ['a credulous model, strong tier available', credulous, true],
    ['a credulous model, no strong tier', credulous, false],
    ['an honest model', honest, true],
  ] as const) {
    it(`hosted mode with ${name}: never supported`, async () => {
      const r = await runEngine({ question: 'Are monthly plans refundable?', answer: ANSWER, sources: SOURCES }, { adjudicate, allowStrong });
      expect(r.claims[0].verdict).not.toBe('supported');
      expect(r.release_recommendation).not.toBe('allow');
      const ev = await evaluateAnswer({ question: 'Are monthly plans refundable?', answer: ANSWER, sources: SOURCES, expected: [], policy, engine: { adjudicate, allowStrong } });
      const d = evaluateCase({ claims: ev.claims, integrity: [], policy, mode: 'hosted' });
      expect(ev.claims.every((c) => c.verdict !== 'supported')).toBe(true);
      expect(d.decision).not.toBe('pass');
    });
  }

  it('hosted mode with an honest model: contradicted; model-dependent, so it warns by default and blocks with model_findings: block', async () => {
    const ev = await evaluateAnswer({ question: 'q', answer: ANSWER, sources: SOURCES, expected: [], policy, engine: { adjudicate: honest } });
    expect(ev.claims[0]).toMatchObject({ verdict: 'contradicted', resolved_by: 'model', deterministic: false });
    expect(evaluateCase({ claims: ev.claims, integrity: [], policy, mode: 'hosted' }).decision).toBe('warn');
    const strict = resolvePolicy({ enforcement: 'enforce', model_findings: 'block' }).policy;
    expect(evaluateCase({ claims: ev.claims, integrity: [], policy: strict, mode: 'hosted' }).decision).toBe('block');
  });
});
