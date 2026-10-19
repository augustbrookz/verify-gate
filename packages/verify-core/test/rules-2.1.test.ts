/**
 * Rules 2.1.0 (rules-next RN-002): an exception written after the thing it limits is a
 * condition. An answer that stops before it drops it, and is not released.
 *   "X excluded", "X not included", "X are not eligible" (trailing, in the same clause, a
 *   following clause of the same sentence, or parentheses), "other than X", "with the
 *   exception of X", "does not apply to X" (also as a following sentence that limits this one).
 * Controls: the answer that keeps the exception is not flagged; an unrelated sentence is not
 * pulled in.
 */
import { describe, expect, it } from 'vitest';
import { runEngine } from '../src/index';

const ANSWER = 'Unused items can be returned for a full refund within 30 days of delivery.';
const BASE = 'Unused items can be returned for a full refund within 30 days of delivery';
const one = async (source: string, answer = ANSWER) => {
  const r = await runEngine({ question: 'Can I return my order?', answer, sources: [{ id: 'returns', text: source }] });
  return { release: r.release_recommendation, claim: r.claims[0]!, dropped: r.claims.flatMap((c) => c.provenance.qualifiers.filter((q) => q.status === 'dropped').map((q) => q.source_text)) };
};

describe('rules 2.1.0: trailing exceptions are conditions', () => {
  it('the production case: "final-sale items excluded" dropped by the answer is caught', async () => {
    const r = await one(`${BASE}, final-sale items excluded.`);
    expect(r.release).toBe('revise');
    expect(r.claim).toMatchObject({ verdict: 'unsupported', failure_reason: 'qualifier_loss', provenance: { rule_id: 'R-VERBATIM-QUALIFIER-LOSS' } });
    expect(r.dropped).toEqual(['final-sale items excluded']);
  });

  for (const [tail, named] of [
    [' (final-sale items excluded)', 'final-sale items excluded'],
    [', gift cards not included', 'gift cards not included'],
    [', clearance items are not eligible', 'clearance items are not eligible'],
    ['; clearance items are not eligible', 'clearance items are not eligible'],
    [', other than final-sale items', 'other than final-sale items'],
    [', with the exception of final-sale items', 'with the exception of final-sale items'],
    ['. This does not apply to final-sale items', 'does not apply to final-sale items'],
  ] as const) {
    it(`"…${tail}" is a condition the answer drops`, async () => {
      const r = await one(`${BASE}${tail}.`);
      expect(r.release).toBe('revise');
      expect(r.dropped).toContain(named);
    });
  }

  it('the forward forms were already caught and still are', async () => {
    expect((await one(`${BASE}, except final-sale items.`)).dropped).toEqual(['except final-sale items']);
    expect((await one(`${BASE}, excluding final-sale items.`)).release).toBe('revise');
  });

  it('control: an answer that restates the exception is not flagged for dropping it', async () => {
    const same = await one(`${BASE}, final-sale items excluded.`, `${BASE}, final-sale items excluded.`);
    expect(same).toMatchObject({ release: 'allow', claim: { verdict: 'supported' } });
    const reworded = await one(`${BASE}, final-sale items excluded.`, `${BASE}, except final-sale items.`);
    expect(reworded.dropped).toEqual([]);
    expect(reworded.claim.verdict).not.toBe('supported'); // wording differs: code abstains, never releases
  });

  it('control: a sentence that does not limit this one is not pulled in', async () => {
    const r = await one(`${BASE}. Gift cards are sold in amounts from $10 to $500.`);
    expect(r).toMatchObject({ release: 'allow', claim: { verdict: 'supported' } });
  });

  it('control: a long clause before "excluded" is not taken as the exception', async () => {
    const r = await one(`${BASE}. Items that were bought during the annual clearance sale in December and opened are excluded.`);
    expect(r.dropped.some((d) => d?.startsWith('Items that were bought during the annual clearance sale'))).toBe(false);
  });
});
