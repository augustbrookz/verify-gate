import { describe, expect, it, vi } from 'vitest';
import {
  coverageNet,
  runEngine,
  stage2,
  type Adjudication,
  type Adjudicator,
  type CostLine,
  type Extractor,
  type VerifyRequestBody,
} from '@xyntherium/verify-core';

const SUPPORT_POLICY =
  'Refund policy. Annual-plan customers who cancel within 30 days of purchase receive a full refund. ' +
  'Refunds are not available for monthly plans. Refunds are processed within 10 business days.';

const REQUEST: VerifyRequestBody = {
  question: 'Can I get a refund?',
  answer: 'You can get a full refund if you cancel within 30 days of purchase. Refunds are processed within 10 business days.',
  sources: [{ id: 'kb-12', title: 'Refund policy', text: SUPPORT_POLICY }],
};

const cost = (model: string, cents: number): CostLine => ({ provider: 'anthropic', model, calls: 1, input_tokens: 1000, output_tokens: 200, cost_cents: cents });

const extractor: Extractor = async ({ answer }) => ({
  ok: true,
  candidates: answer.split(/(?<=\.)\s+/).map((s) => ({ text: s, answer_quote: s })),
  cost: [cost('claude-haiku-5-5', 0.05)],
  model: 'claude-haiku-5-5',
  prompt_version: 'test-extract-v1',
});

function adjudicatorFrom(fn: (claim: string, tier: 'fast' | 'strong') => Partial<Adjudication> | 'fail'): Adjudicator {
  return async ({ claim, tier }) => {
    const out = fn(claim, tier);
    const model = tier === 'fast' ? 'claude-haiku-5-5' : 'claude-sonnet-5-5';
    if (out === 'fail') return { ok: false, error: 'provider_error', cost: null, model };
    return {
      ok: true,
      model,
      prompt_version: 'test-adjudicate-v1',
      cost: cost(model, tier === 'fast' ? 0.05 : 1.2),
      adjudication: {
        verdict: 'unsupported',
        reason: '',
        evidence: [],
        source_qualifiers: [],
        conflict_type: 'none',
        unverifiable_reason: 'none',
        arithmetic: null,
        ...out,
      },
    };
  };
}

describe('stage 2 and coverage', () => {
  it('rejects non-checkable text and splits compounds with reasons', () => {
    const r = stage2('ignored', [
      { text: 'Hope this helps!' },
      { text: 'Is that right?' },
      { text: 'The Pro plan costs $20 per month and includes 50 GB of storage.' },
      { text: 'The Pro plan costs $20 per month.' },
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['not_checkable', 'question', 'duplicate']);
    expect(r.accepted.map((a) => a.text)).toEqual(['The Pro plan costs $20 per month.', 'The Pro plan includes 50 GB of storage.']);
    expect(r.splits).toBe(1);
  });

  it('adds a claim for any checkable answer sentence the extractor skipped', () => {
    const answer = 'Refunds take 10 business days. The Basic plan does not include phone support.';
    const accepted = stage2(answer, [{ text: 'Refunds take 10 business days.', answer_quote: 'Refunds take 10 business days.' }]).accepted;
    const added = coverageNet(answer, accepted);
    expect(added.map((a) => a.text)).toEqual(['The Basic plan does not include phone support.']);
  });
});

describe('runEngine', () => {
  it('catches a dropped qualifier and resolves verbatim support in code', async () => {
    const adjudicate = vi.fn(
      adjudicatorFrom(() => ({
        verdict: 'supported',
        evidence: [{ source_id: 'kb-12', quote: 'Annual-plan customers who cancel within 30 days of purchase receive a full refund', role: 'supports' }],
      })),
    );
    const r = await runEngine(REQUEST, { extract: extractor, adjudicate });
    const [first, second] = r.claims;
    expect(second.verdict).toBe('supported');
    expect(second.resolved_by).toBe('code');
    expect(second.provenance.model_used).toBe(false);
    expect(first.verdict).toBe('unsupported');
    expect(first.failure_reason).toBe('qualifier_loss');
    expect(r.release_recommendation).toBe('revise');
    expect(r.qualifier_loss_detected).toBe(true);
    expect(r.counts.resolved_by_code).toBe(1);
    expect(r.partial).toBe(false);
    // The code-resolved claim never reached a model.
    expect(adjudicate.mock.calls.every(([req]) => !req.claim.startsWith('Refunds are processed'))).toBe(true);
  });

  it('allows an answer whose claims are all supported', async () => {
    const r = await runEngine(
      { ...REQUEST, answer: 'Refunds are processed within 10 business days.' },
      { extract: extractor, adjudicate: adjudicatorFrom(() => 'fail') },
    );
    expect(r.release_recommendation).toBe('allow');
    expect(r.overall_status).toBe('all_supported');
  });

  it('escalates to the strong tier when code cannot confirm the fast verdict', async () => {
    const calls: string[] = [];
    const r = await runEngine(
      { ...REQUEST, answer: 'Annual customers are refunded in full when they cancel in the first 30 days after buying.' },
      {
        extract: extractor,
        adjudicate: adjudicatorFrom((_, tier) => {
          calls.push(tier);
          return tier === 'fast'
            ? { verdict: 'supported', evidence: [{ source_id: 'kb-12', quote: 'customers who cancel within 30 days of purchase receive a refund', role: 'supports' }] }
            : { verdict: 'supported', evidence: [{ source_id: 'kb-12', quote: 'Annual-plan customers who cancel within 30 days of purchase receive a full refund', role: 'supports' }] };
        }),
      },
    );
    expect(calls).toEqual(['fast', 'strong']);
    expect(r.claims[0].verdict).toBe('supported');
    expect(r.telemetry.escalations).toBe(1);
    expect(r.claims[0].provenance.discarded_quotes).toBe(0);
  });

  it('stops at the cost ceiling: remaining claims unverifiable, result partial', async () => {
    const r = await runEngine(
      { ...REQUEST, answer: 'Annual customers can cancel and get money back. Support answers fast. Plans renew yearly.' },
      { extract: extractor, adjudicate: adjudicatorFrom(() => ({ verdict: 'unsupported' })), costCeilingCents: 0.1, estimates: { extract: 0.05, fast: 0.15, strong: 1.6, deliberate: 10 } },
    );
    expect(r.partial).toBe(true);
    expect(r.claims.every((c) => c.verdict === 'unverifiable' && c.failure_reason === 'cost_ceiling')).toBe(true);
    expect(r.overall_status).toBe('partial');
    expect(r.cost_cents).toBeLessThanOrEqual(0.1);
  });

  it('degrades to sentence-level claims when extraction fails, and says so', async () => {
    const r = await runEngine(REQUEST, {
      extract: async () => ({ ok: false, error: 'timeout', cost: [] }),
      adjudicate: adjudicatorFrom(() => ({ verdict: 'unsupported' })),
    });
    expect(r.partial).toBe(true);
    expect(r.partial_reasons[0]).toMatch(/extraction/);
    expect(r.claims.length).toBe(2);
  });

  it('marks claims unverifiable when every provider fails', async () => {
    const r = await runEngine(
      { ...REQUEST, answer: 'Annual customers get money back when they leave early.' },
      { extract: extractor, adjudicate: adjudicatorFrom(() => 'fail') },
    );
    expect(r.claims[0].verdict).toBe('unverifiable');
    expect(r.claims[0].failure_reason).toBe('provider_error');
    expect(r.release_recommendation).toBe('human_review');
  });

  it('honours the deadline', async () => {
    let t = 1_000_000;
    const r = await runEngine(
      { ...REQUEST, answer: 'Annual customers get money back when they leave early.' },
      { extract: extractor, adjudicate: adjudicatorFrom(() => ({ verdict: 'unsupported' })), now: () => t, deadlineAt: t + 2_500 },
    );
    t += 1;
    expect(r.claims[0].failure_reason).toBe('deadline');
    expect(r.partial).toBe(true);
  });

  it('lets deliberation downgrade to unverifiable but never upgrade', async () => {
    const answer = 'Annual customers are refunded in full when they cancel in the first 30 days after buying.';
    const supportingAdj = adjudicatorFrom(() => ({
      verdict: 'supported',
      evidence: [{ source_id: 'kb-12', quote: 'Annual-plan customers who cancel within 30 days of purchase receive a full refund', role: 'supports' }],
    }));
    const disagree = await runEngine(
      { ...REQUEST, answer },
      {
        extract: extractor,
        adjudicate: supportingAdj,
        deliberation: 'all',
        deliberate: async () => ({ ok: true, verdict: 'unsupported', agreement: 0.67, votes: [{ provider: 'openai', verdict: 'unsupported' }], cost: [cost('panel', 3)], model: 'panel' }),
      },
    );
    expect(disagree.claims[0].verdict).toBe('unverifiable');
    expect(disagree.claims[0].failure_reason).toBe('deliberation_disagreement');
    expect(disagree.claims[0].resolved_by).toBe('deliberation');

    const upgrade = await runEngine(
      { ...REQUEST, answer: 'Annual customers can also pause their plan for 3 months.' },
      {
        extract: extractor,
        adjudicate: adjudicatorFrom(() => ({ verdict: 'unsupported' })),
        deliberation: 'all',
        deliberate: async () => ({ ok: true, verdict: 'supported', agreement: 1, votes: [], cost: [], model: 'panel' }),
      },
    );
    expect(upgrade.claims[0].verdict).toBe('unsupported');
  });

  it('runs code-only (no adjudicator) and labels what it could not decide', async () => {
    const r = await runEngine(REQUEST, {});
    expect(r.claims.find((c) => c.text.startsWith('Refunds are processed'))?.verdict).toBe('supported');
    // A paraphrase needs a located span; without an adjudicator code says so rather than guess.
    expect(r.claims.find((c) => c.text.startsWith('You can get'))?.failure_reason).toBe('not_adjudicated');
  });

  it('flags a missing or misdirected citation only when citations are required', async () => {
    const sources = [
      { id: 'S1', text: 'Refunds are processed within 10 business days.' },
      { id: 'S2', text: 'Our office is closed on public holidays.' },
    ];
    const r = await runEngine({ question: 'q', answer: 'Refunds are processed within 10 business days [S2].', sources, options: { require_citations: true } }, {});
    expect(r.claims[0].verdict).toBe('supported');
    expect(r.claims[0].citation).toEqual({ cited: ['S2'], status: 'mismatch' });
    expect(r.release_recommendation).toBe('cite_required');
  });

  it('treats an answer with no sources as insufficient', async () => {
    const r = await runEngine({ question: 'q', answer: 'Refunds are processed within 10 business days.', sources: [] }, {});
    expect(r.overall_status).toBe('insufficient_sources');
    expect(r.claims[0].verdict).toBe('unsupported');
  });
});
