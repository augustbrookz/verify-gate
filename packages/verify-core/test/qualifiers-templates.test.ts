import { describe, expect, it } from 'vitest';
import { compareQualifiers, templateMatches } from '@xyntherium/verify-core';

const statuses = (claim: string, ctx: string) =>
  compareQualifiers(claim, ctx).rows.map((r) => [r.type, r.status, r.source_text ?? r.claim_text]);

describe('compareQualifiers', () => {
  it('marks a dropped eligibility condition', () => {
    const cmp = compareQualifiers(
      'Members get a 20% discount on renewals.',
      'Members who enrolled before January 1, 2025 get a 20% discount on renewals.',
    );
    expect(cmp.dropped.map((d) => d.type)).toContain('condition');
  });

  it('keeps a restated condition preserved', () => {
    const cmp = compareQualifiers(
      'Members who enrolled before Jan 1, 2025 receive 20% off renewals.',
      'Members who enrolled before January 1, 2025 get a 20% discount on renewals.',
    );
    expect(cmp.dropped).toEqual([]);
    expect(cmp.contradicted).toEqual([]);
  });

  it('marks a dropped plan scope ("for annual plans")', () => {
    const cmp = compareQualifiers('Refunds are available within 30 days.', 'Refunds are available within 30 days for annual plans.');
    expect(cmp.dropped.map((d) => d.source_text)).toContain('for annual plans');
  });

  it('marks a different value inside the window as contradicted', () => {
    const cmp = compareQualifiers('Refunds are available within 60 days.', 'Refunds are available within 30 days.');
    expect(cmp.contradicted.length).toBeGreaterThan(0);
  });

  it('marks a dropped per-user rate', () => {
    const cmp = compareQualifiers('The Team plan costs $12 per month.', 'The Team plan costs $12 per user per month.');
    expect(cmp.dropped.map((d) => d.source_text)).toContain('per user');
  });

  it('marks a dropped "up to" on an amount, but not "within" on a period', () => {
    expect(compareQualifiers('You receive $500 in credits.', 'You receive up to $500 in credits.').dropped.length).toBe(1);
    expect(compareQualifiers('Returns are accepted for 30 days.', 'Returns are accepted within 30 days.').dropped.length).toBe(0);
  });

  it('marks a hedging quantifier in the source that the claim drops', () => {
    expect(statuses('Orders ship the same day.', 'Most orders ship the same day.')).toContainEqual(['scope', 'dropped', 'Most']);
  });

  it('flags a value the claim states that the context does not', () => {
    const cmp = compareQualifiers('Support replies within 4 hours.', 'Support replies to every ticket by email.');
    expect(cmp.unmatchedValues).toBe(1);
    expect(cmp.ambiguous.map((a) => a.type)).toContain('quantity');
  });

  it('accepts a model-proposed qualifier only if it exists verbatim in the context', () => {
    const ctx = 'Free shipping applies to orders shipped within the contiguous United States.';
    const claim = 'Free shipping applies to orders.';
    expect(compareQualifiers(claim, ctx, [{ type: 'scope', text: 'within the contiguous United States' }]).dropped.length).toBeGreaterThan(0);
    expect(compareQualifiers(claim, ctx, [{ type: 'scope', text: 'only in Alaska' }]).rows.some((r) => r.source_text === 'only in Alaska')).toBe(false);
  });
});

const src = (id: string, text: string) => ({ id, text });

describe('templateMatches', () => {
  it('finds a one-number contradiction', () => {
    const [m] = templateMatches('Annual plans can be refunded within 60 days of purchase.', [
      src('S1', 'Annual plans can be refunded within 30 days of purchase. Monthly plans cannot.'),
    ]);
    expect(m.conflicts.map((c) => c.kind)).toEqual(['number']);
  });

  it('finds a one-date contradiction', () => {
    const [m] = templateMatches('The legacy API will be retired on June 30, 2026.', [src('S1', 'The legacy API will be retired on March 31, 2026.')]);
    expect(m.conflicts.map((c) => c.kind)).toEqual(['date']);
  });

  it('finds a negation flip, including do-support', () => {
    const [a] = templateMatches('The Basic plan includes priority phone support.', [src('S1', 'The Basic plan does not include priority phone support.')]);
    expect(a.conflicts.map((c) => c.kind)).toEqual(['negation']);
    const [b] = templateMatches('Gift cards are not refundable for any reason.', [src('S1', 'Gift cards are refundable for any reason.')]);
    expect(b.conflicts.map((c) => c.kind)).toEqual(['negation']);
  });

  it('reports an exact match with no conflicts', () => {
    const [m] = templateMatches('Exports are limited to 10,000 rows per file.', [src('S1', 'Note: exports are limited to 10,000 rows per file.')]);
    expect(m.conflicts).toEqual([]);
  });

  it('does not align a claim to a sentence about something else', () => {
    expect(templateMatches('Refunds are processed within 10 business days.', [src('S1', 'Exchanges are processed within 5 business days.')])).toEqual([]);
  });
});
