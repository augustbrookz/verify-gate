import { describe, expect, it } from 'vitest';
import {
  clauseContext,
  compareDates,
  compareQuantities,
  extractDates,
  extractQuantities,
  splitClauses,
  splitSentences,
} from '@xyntherium/verify-core';

const q = (text: string) => extractQuantities(text);

describe('extractQuantities', () => {
  it('reads currency, percents, durations and counts', () => {
    const out = q('The Pro plan costs $1,200 per year, includes 5 users, a 14-day trial and 20% off for nonprofits.');
    expect(out.map((x) => [x.dimension, x.written, x.unit])).toEqual([
      ['currency', 1200, 'USD'],
      ['count', 5, 'user'],
      ['duration_fixed', 14, 'day'],
      ['percent', 20, '%'],
    ]);
    expect(out[0].rate).toBe('per year');
  });

  it('converts exactly: 2 weeks equals 14 days, 1 year equals 12 months', () => {
    const [a] = q('within 2 weeks');
    const [b] = q('within 14 days');
    expect(compareQuantities(a, b)).toBe('equal');
    const [y] = q('for 1 year');
    const [m] = q('for 12 months');
    expect(compareQuantities(y, m)).toBe('equal');
  });

  it('refuses inexact conversions: a month is not 30 days, 1 GB is not 1000 MB', () => {
    expect(compareQuantities(q('1 month')[0], q('30 days')[0])).toBe('incomparable');
    expect(compareQuantities(q('1 GB')[0], q('1000 MB')[0])).toBe('incomparable');
  });

  it('keeps business days apart from calendar days', () => {
    expect(compareQuantities(q('5 business days')[0], q('5 days')[0])).toBe('incomparable');
  });

  it('reads spelled numbers only before a unit', () => {
    expect(q('within thirty days')[0].written).toBe(30);
    expect(q('one of the plans').length).toBe(0);
    expect(q('a user can invite others').length).toBe(0);
  });

  it('records bounds', () => {
    expect(q('up to $500 in credits')[0].bound).toBe('max');
    expect(q('at least 3 seats')[0].bound).toBe('min');
    expect(q('about 40%')[0].bound).toBe('approx');
    expect(q('within 30 days')[0].bound).toBe('max');
  });

  it('reads ranges as two bounded values', () => {
    const out = q('Delivery takes 3-5 business days.');
    expect(out.map((x) => [x.bound, x.written])).toEqual([
      ['range_low', 3],
      ['range_high', 5],
    ]);
  });

  it('does not read date digits as quantities', () => {
    expect(q('Effective March 1, 2026, prices change.').length).toBe(0);
  });
});

describe('extractDates / compareDates', () => {
  it('parses common formats', () => {
    const ds = extractDates('On 2026-03-01, from March 5, 2026 and 7 April 2026, in Q3 2026, since 2024, and on 13/02/2026.');
    expect(ds.map((d) => [d.year, d.month, d.day, d.precision])).toEqual([
      [2026, 3, 1, 'day'],
      [2026, 3, 5, 'day'],
      [2026, 4, 7, 'day'],
      [2026, null, null, 'quarter'],
      [2024, null, null, 'year'],
      [2026, 2, 13, 'day'],
    ]);
  });

  it('flags ambiguous numeric dates', () => {
    expect(extractDates('on 03/04/2026')[0].ambiguousOrder).toBe(true);
  });

  it('compares precision', () => {
    const [day] = extractDates('March 5, 2026');
    const [month] = extractDates('March 2026');
    const [other] = extractDates('April 5, 2026');
    expect(compareDates(month, day)).toBe('claim_less_precise');
    expect(compareDates(day, month)).toBe('claim_more_precise');
    expect(compareDates(day, other)).toBe('conflict');
  });
});

describe('sentences and clauses', () => {
  it('does not split on abbreviations, decimals or initials', () => {
    const s = splitSentences('Prices start at $3.50 per user, e.g. for Teams. Contact J. Smith at Acme Inc. for details. Done!');
    expect(s.map((x) => x.text)).toEqual([
      'Prices start at $3.50 per user, e.g. for Teams.',
      'Contact J. Smith at Acme Inc. for details.',
      'Done!',
    ]);
  });

  it('splits list items and paragraphs', () => {
    const s = splitSentences('Plans include:\n- Basic: 5 GB\n- Pro: 50 GB\n\nAll plans renew monthly');
    expect(s.map((x) => x.text)).toEqual(['Plans include:', '- Basic: 5 GB', '- Pro: 50 GB', 'All plans renew monthly']);
  });

  it('splits independent clauses but keeps a leading condition with its clause', () => {
    const text = 'If you cancel within 14 days, you get a full refund, and shipping is free for orders over $50.';
    const [sentence] = splitSentences(text);
    expect(splitClauses(sentence).map((c) => c.text)).toEqual([
      'If you cancel within 14 days, you get a full refund',
      'shipping is free for orders over $50.',
    ]);
    const at = text.indexOf('full refund');
    expect(clauseContext(text, at, at + 11).text).toBe('If you cancel within 14 days, you get a full refund');
  });

  it('attaches a following sentence that limits this one', () => {
    const text = 'Members get free express shipping. This applies only to orders placed in the US. Returns are free.';
    const at = text.indexOf('free express');
    expect(clauseContext(text, at, at + 12).text).toBe('Members get free express shipping. This applies only to orders placed in the US.');
  });
});
