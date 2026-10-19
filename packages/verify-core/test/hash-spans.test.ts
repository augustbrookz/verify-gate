import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, editCap, hashCanonical, locateQuote, normalizeWithMap, sha256Hex, spanIsExact } from '@xyntherium/verify-core';

describe('sha256Hex', () => {
  it.each(['', 'abc', 'The refund window is 30 days.', 'unicode: café — “quotes” 🚀', 'x'.repeat(10_000)])(
    'matches node:crypto for %#',
    (s) => {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    },
  );

  it('matches across block boundaries (55, 56, 63, 64, 65 bytes)', () => {
    for (const n of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const s = 'a'.repeat(n);
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
  });
  it('hashes structurally equal values identically', () => {
    expect(hashCanonical({ a: 1, b: [1, 2] })).toBe(hashCanonical({ b: [1, 2], a: 1 }));
  });
  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe('normalizeWithMap', () => {
  it('collapses whitespace, straightens quotes and dashes, keeps letters and case', () => {
    const n = normalizeWithMap('  The  “Pro” plan — 30–day trial… ');
    expect(n.text).toBe('The "Pro" plan - 30-day trial...');
    expect(n.map.length).toBe(n.text.length);
  });
});

const SOURCE =
  'Refund policy. Customers on annual plans can request a full refund within 30 days of purchase. ' +
  'Monthly plans are not eligible for refunds. Usage of 3.5 GB counts as one unit.';

describe('locateQuote', () => {
  it('finds an exact quote and returns original offsets', () => {
    const r = locateQuote(SOURCE, 'can request a full refund within 30 days of purchase');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.match_type).toBe('exact');
    expect(SOURCE.slice(r.span.start, r.span.end)).toBe(r.span.quote);
  });

  it('matches through curly quotes, extra spaces, en dashes and a capitalised first letter', () => {
    const src = 'Your plan’s data is kept for 90–12 months after cancellation.';
    const r = locateQuote(src, "Plan's   data is kept for 90-12 months after cancellation");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.match_type).toBe('normalized');
    expect(r.span.quote).toBe('plan’s data is kept for 90–12 months after cancellation');
    expect(spanIsExact(src, r.span)).toBe(true);
  });

  it('tolerates punctuation differences within the edit cap', () => {
    const r = locateQuote(SOURCE, 'Customers on annual plans can request a full refund, within 30 days of purchase');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.match_type).toBe('punctuation_tolerant');
    expect(r.span.edit_distance).toBeLessThanOrEqual(editCap(r.span.quote.length));
    expect(spanIsExact(SOURCE, r.span)).toBe(true);
  });

  it('never merges digits across a separator (3.5 GB is not 35 GB)', () => {
    expect(locateQuote(SOURCE, 'Usage of 35 GB counts as one unit').ok).toBe(false);
  });

  it('rejects a quote whose words differ', () => {
    const r = locateQuote(SOURCE, 'can request a full refund within 60 days of purchase');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects trivially short quotes', () => {
    expect(locateQuote(SOURCE, '30 days')).toEqual({ ok: false, reason: 'too_short' });
    expect(locateQuote(SOURCE, '   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects punctuation-only matches that exceed the hard cap', () => {
    const src = 'a, b, c, d, e, f, g, h, i, j, k are all valid option letters here';
    const r = locateQuote(src, 'a b c d e f g h i j k are all valid option letters here');
    expect(r.ok).toBe(false);
  });
});

describe('spanIsExact', () => {
  it('is false when the quote does not equal the slice', () => {
    expect(spanIsExact('hello world', { start: 0, end: 5, quote: 'hellx' })).toBe(false);
    expect(spanIsExact('hello world', { start: 0, end: 50, quote: 'hello world' })).toBe(false);
  });
});
