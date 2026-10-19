/**
 * Regression tests for RULES_VERSION 1.3.0 (see rules-changelog.json). Found by
 * the Verify Gate regression corpus (tests/fixtures/gate-corpus): a correct
 * stated total was blocked as a contradiction, and invisible characters in an
 * answer changed its sentences and its numbers. Every fix is pinned with a
 * control that must not change.
 */
import { describe, expect, it } from 'vitest';
import { claimComputation, decideByCode, decideWithModel, extractQuantities, foldSpaces, hashSources, splitClauses, splitSentences, type Adjudication } from '../src/index';

const PTO = 'Full-time employees receive 15 days of paid vacation and 5 days of paid sick leave each calendar year.';
const QUOTA = 'The Hobby plan includes 10,000 requests per month, and the Business plan includes 250,000 requests per month.';
const PRICE = 'The Pro plan costs $49 per month.';

const supported = (source_id: string, quote: string, arithmetic: Adjudication['arithmetic'] = null): Adjudication => ({
  verdict: 'supported',
  reason: '',
  evidence: [{ source_id, quote, role: 'supports' }],
  source_qualifiers: [],
  conflict_type: 'none',
  unverifiable_reason: 'none',
  arithmetic,
});

describe('invisible characters are whitespace (segmentation and numbers)', () => {
  it('splits ". \\u200bThe" like ". The", and trims zero-width characters off a sentence', () => {
    const plain = splitSentences('Refunds take 5 days. Shipping is free.');
    const noisy = splitSentences('Refunds take 5 days. ​Shipping is free.​');
    expect(noisy.map((s) => s.text)).toEqual(plain.map((s) => s.text));
    expect(splitSentences('Refunds take 5 days.​Shipping is free.')).toHaveLength(2);
  });

  it('breaks clauses at ", \\u200band" like ", and"', () => {
    const t = 'Refunds take 5 days, ​and shipping is free.';
    expect(splitClauses({ start: 0, end: t.length, text: t })).toHaveLength(2);
  });

  it('reads a unit across a no-break or zero-width space, with offsets unchanged', () => {
    for (const t of ['within 5 business days', 'within 5 ​business days', 'within 5 business days']) {
      const [q] = extractQuantities(t);
      expect([q.written, q.unit, q.dimension]).toEqual([5, 'business_day', 'business_days']);
      expect(t.slice(q.start, q.end).replace(/[\s​]+/g, ' ')).toBe('5 business days');
    }
    expect(foldSpaces('a b​c')).toHaveLength('a b​c'.length);
  });
});

describe('claimComputation: totals, differences and a monthly price over a year', () => {
  it.each([
    ['15 days of vacation and 5 days of sick leave, for a total of 20 days of paid time off', 'pass', 20],
    ['15 days of vacation and 5 days of sick leave, for a total of 25 days of paid time off', 'fail', 25],
    ['10,000 requests per month and 250,000 requests per month, so the Business plan includes 240,000 more requests each month', 'pass', 240000],
    ['10,000 requests per month and 250,000 requests per month, so the Business plan includes 225,000 more requests each month', 'fail', 225000],
    ['The plan costs $49 per month, so a full year of the plan costs $588', 'pass', 588],
    ['The plan costs $49 per month, so a full​ year of the plan costs $568', 'fail', 568],
  ])('%s → %s', (claim, result, value) => {
    const c = claimComputation(claim);
    expect(c?.check.result).toBe(result);
    expect(c?.result).toBe(value);
  });

  it.each([
    ['figures joined by "or"', 'Plans include 5 GB or 10 GB of storage, for a total of 20 GB'],
    ['no total cue right before the figure', 'Basic includes 5 users, Pro includes 10 users, and Business includes 50 users in total'],
    ['different units', '15 days of vacation and 5 weeks of leave, for a total of 20 days'],
    ['a difference without a consequence word', 'Hobby has 10,000 requests per month and Business has 250,000 requests per month and 225,000 more requests'],
    ['an annual discount', 'The plan costs $49 per month, so a full year with the annual billing discount costs $470'],
    ['a monthly price and a yearly price', 'The plan costs $49 per month, or $470 per year'],
  ])('recognises no computation with %s', (_name, claim) => {
    expect(claimComputation(claim)).toBeNull();
  });
});

describe('a stated total is derived, not contradicted', () => {
  const sources = hashSources([{ id: 'S1', text: `${PTO} Unused sick days do not carry over.` }]);

  it('code: a wrong stated total is contradicted by code', () => {
    const d = decideByCode('Full-time employees receive 15 days of paid vacation and 5 days of paid sick leave each calendar year, for a total of 25 days of paid time off.', sources);
    expect(d).toMatchObject({ verdict: 'contradicted', failure_reason: 'arithmetic_error', resolved_by: 'code' });
  });

  it('a supported quote plus a correct stated total is supported (no number_mismatch on the total)', () => {
    const claim = 'Full-time employees receive 15 days of paid vacation and 5 days of paid sick leave each calendar year, for a total of 20 days of paid time off.';
    const d = decideWithModel(claim, sources, supported('S1', PTO), 'strong');
    expect(d.verdict).toBe('supported');
    expect(d.checks.some((c) => c.kind === 'arithmetic' && c.result === 'pass')).toBe(true);
  });

  it("the model's arithmetic establishes a difference the claim states", () => {
    const src = hashSources([{ id: 'S1', text: QUOTA }]);
    const claim = 'The Business plan includes 250,000 requests per month, so the Business plan includes 240,000 more requests each month.';
    const d = decideWithModel(claim, src, supported('S1', QUOTA, { operation: 'difference', operands: [250000, 10000], result: 240000 }), 'strong');
    expect(d.verdict).toBe('supported');
  });

  it('a monthly price over a year needs no stated 12 in the source', () => {
    const src = hashSources([{ id: 'S1', text: PRICE }]);
    expect(decideWithModel('The Pro plan costs $49 per month, so a full year of the plan costs $588.', src, supported('S1', PRICE), 'strong').verdict).toBe('supported');
    expect(decideByCode('The Pro plan costs $49 per month, so a full year of the plan costs $568.', src)).toMatchObject({ verdict: 'contradicted', failure_reason: 'arithmetic_error' });
  });

  it('control: arithmetic cannot explain away a different value when the claim states no computation', () => {
    const src = hashSources([{ id: 'S1', text: 'Annual plans can be refunded within 30 days of purchase.' }]);
    const d = decideWithModel('Annual plans can be refunded within 60 days of purchase.', src, supported('S1', 'Annual plans can be refunded within 30 days of purchase.', { operation: 'sum', operands: [30, 30], result: 60 }), 'strong');
    expect(d.verdict).not.toBe('supported');
  });
});
