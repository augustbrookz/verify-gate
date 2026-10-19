/**
 * Regression: a claim extracted as a fragment of an answer clause must not be
 * flagged for dropping a condition that the answer clause itself states.
 * Found by the production smoke check on 2026-10-18 (the /verify demo case):
 * the extractor returned "Approved refunds are returned to the original
 * payment method." beside the full sentence "… within 5–10 business days.",
 * and code flagged the fragment as dropping the time window the answer kept.
 */
import { describe, expect, it } from 'vitest';
import { runEngine, type Extractor } from '../src/index';

const cost = { provider: 'fake', model: 'fake', calls: 1, input_tokens: 0, output_tokens: 0, cost_cents: 0 };
const extractorOf = (cands: { text: string; answer_quote: string }[]): Extractor => async () => ({ ok: true, candidates: cands, cost: [cost], model: 'fake', prompt_version: 't' });

const SOURCES = [
  { id: 'kb-refunds', title: 'Refund policy', text: 'Annual plans purchased on or after March 1, 2026 can be refunded in full within 30 days of purchase, provided fewer than 1,000 API calls have been made on the account. Monthly plans are not refundable. Approved refunds are returned to the original payment method within 5–10 business days.' },
];
const ANSWER = 'Yes. You can get a full refund within 30 days of purchase. Approved refunds are returned to the original payment method within 5–10 business days.';

describe('a fragment claim and the answer clause it came from', () => {
  it('the production case: the fragment is not flagged for the time window its answer clause states', async () => {
    const r = await runEngine(
      { question: 'Can I get a refund?', answer: ANSWER, sources: SOURCES },
      {
        extract: extractorOf([
          { text: 'A full refund can be obtained within 30 days of purchase.', answer_quote: 'You can get a full refund within 30 days of purchase' },
          { text: 'Approved refunds are returned to the original payment method.', answer_quote: 'Approved refunds are returned to the original payment method' },
          { text: 'Approved refunds are returned to the original payment method within 5–10 business days.', answer_quote: 'Approved refunds are returned to the original payment method within 5–10 business days' },
        ]),
      },
    );
    const fragment = r.claims.find((c) => c.text === 'Approved refunds are returned to the original payment method.')!;
    expect(fragment.failure_reason).not.toBe('qualifier_loss');
    expect(fragment.verdict).toBe('supported');
    expect(fragment.provenance.rule_id).toMatch(/^R-ANSWER-CLAUSE:/);
    // The full sentence stays supported, and the genuinely dropped condition is still caught by the model path elsewhere.
    expect(r.claims.find((c) => c.text.endsWith('within 5–10 business days.'))!.verdict).toBe('supported');
  });

  it('control: a condition stated in ANOTHER clause of the answer does not rescue the fragment', async () => {
    const sources = [{ id: 'S1', text: 'Refunds are issued within 5 days for annual plans only. Shipping is free for annual plans only.' }];
    const answer = 'Refunds are issued within 5 days, and shipping is free for annual plans only.';
    const r = await runEngine({ question: 'q', answer, sources }, { extract: extractorOf([{ text: 'Refunds are issued within 5 days.', answer_quote: 'Refunds are issued within 5 days' }]) });
    expect(r.claims[0]).toMatchObject({ verdict: 'unsupported', failure_reason: 'qualifier_loss' });
  });

  it('control: a real dropped condition (absent from the whole answer) is still flagged', async () => {
    const answer = 'Approved refunds are returned to the original payment method.';
    const r = await runEngine({ question: 'q', answer, sources: SOURCES }, {});
    expect(r.claims[0]).toMatchObject({ verdict: 'unsupported', failure_reason: 'qualifier_loss' });
  });
});
