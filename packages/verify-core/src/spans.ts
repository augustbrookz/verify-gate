/**
 * Span matching: does this quote exist in this source, and exactly where?
 *
 * A model may PROPOSE a quote; only this code decides whether it exists. Tiers,
 * tried in order, each stricter than the next is lenient:
 *
 *   exact                 indexOf on the original text.
 *   normalized            whitespace, quote style, dash style, ellipsis (see
 *                         normalize.ts), plus a different case on the quote's
 *                         FIRST letter only (sentence-initial capitalisation).
 *   punctuation_tolerant  additionally ignores punctuation, never a separator
 *                         between two digits, subject to a hard edit-distance
 *                         cap measured on the normalised strings.
 *
 * Whatever tier matches, the returned offsets index the ORIGINAL source text
 * and `quote` is exactly source.slice(start, end), never the model's string.
 */
import type { MatchType } from './contract';
import { normalizeWithMap, stripPunctuation, type NormalizedText } from './normalize';

export const MIN_QUOTE_CHARS = 8;
export const MIN_QUOTE_WORDS = 2;
export const MAX_QUOTE_CHARS = 2_000;

export interface LocatedSpan {
  start: number;
  end: number;
  quote: string;
  match_type: MatchType;
  edit_distance: number;
  /** Number of places the quote occurs; the first is returned. */
  occurrences: number;
}

export type LocateFailure = 'empty' | 'too_short' | 'too_long' | 'not_found' | 'over_edit_cap';

export type LocateResult = { ok: true; span: LocatedSpan } | { ok: false; reason: LocateFailure };

/** The edit-distance cap for a normalised quote of length n. */
export function editCap(n: number): number {
  return Math.min(6, Math.max(2, Math.floor(n * 0.04)));
}

/** Levenshtein distance, O(n*m) with a single row. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + 1);
  }
  return n;
}

/** Map a [from, to) range in normalised text back to original offsets. */
function toOriginal(norm: NormalizedText, from: number, to: number): { start: number; end: number } {
  return { start: norm.map[from], end: norm.ends[to - 1] };
}

function swapFirstCase(s: string): string | null {
  const first = s[0];
  const lower = first.toLowerCase();
  const upper = first.toUpperCase();
  if (lower === upper) return null;
  return (first === lower ? upper : lower) + s.slice(1);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function locateQuote(source: string, rawQuote: string): LocateResult {
  const quote = (rawQuote ?? '').trim();
  if (!quote) return { ok: false, reason: 'empty' };
  if (quote.length > MAX_QUOTE_CHARS) return { ok: false, reason: 'too_long' };
  if (quote.length < MIN_QUOTE_CHARS || wordCount(quote) < MIN_QUOTE_WORDS) return { ok: false, reason: 'too_short' };

  // Tier 1: exact.
  const exactAt = source.indexOf(quote);
  if (exactAt >= 0) {
    return {
      ok: true,
      span: {
        start: exactAt,
        end: exactAt + quote.length,
        quote,
        match_type: 'exact',
        edit_distance: 0,
        occurrences: countOccurrences(source, quote),
      },
    };
  }

  // Tier 2: normalised (whitespace, quotes, dashes, ellipsis; first-letter case).
  const ns = normalizeWithMap(source);
  const nq = normalizeWithMap(quote);
  if (!nq.text) return { ok: false, reason: 'empty' };
  const candidates = [nq.text, swapFirstCase(nq.text)].filter((c): c is string => c !== null);
  for (const cand of candidates) {
    const at = ns.text.indexOf(cand);
    if (at >= 0) {
      const { start, end } = toOriginal(ns, at, at + cand.length);
      return {
        ok: true,
        span: {
          start,
          end,
          quote: source.slice(start, end),
          match_type: 'normalized',
          edit_distance: cand === nq.text ? 0 : 1,
          occurrences: countOccurrences(ns.text, cand),
        },
      };
    }
  }

  // Tier 3: punctuation-tolerant, capped.
  const ps = stripPunctuation(ns);
  for (const cand of candidates) {
    const pq = stripPunctuation(normalizeWithMap(cand));
    if (pq.text.length < MIN_QUOTE_CHARS) continue;
    const at = ps.text.indexOf(pq.text);
    if (at < 0) continue;
    const { start, end } = toOriginal(ps, at, at + pq.text.length);
    // Measure the edit distance on the normalised forms of what actually matched,
    // so the cap counts every punctuation difference between quote and source.
    const matchedNorm = normalizeWithMap(source.slice(start, end)).text;
    const quoteNorm = normalizeWithMap(cand).text.replace(/[.,;:!?'")\]]+$/, '');
    const distance = editDistance(quoteNorm, matchedNorm) + (cand === nq.text ? 0 : 1);
    if (distance > editCap(quoteNorm.length)) return { ok: false, reason: 'over_edit_cap' };
    return {
      ok: true,
      span: {
        start,
        end,
        quote: source.slice(start, end),
        match_type: 'punctuation_tolerant',
        edit_distance: distance,
        occurrences: countOccurrences(ps.text, pq.text),
      },
    };
  }

  return { ok: false, reason: 'not_found' };
}

/**
 * Independent re-check that a span really is in the source: the stored quote
 * must equal source.slice(start, end). Used before anything is published or
 * written to the ledger.
 */
export function spanIsExact(source: string, span: { start: number; end: number; quote: string }): boolean {
  return (
    Number.isInteger(span.start) &&
    Number.isInteger(span.end) &&
    span.start >= 0 &&
    span.end <= source.length &&
    span.start < span.end &&
    source.slice(span.start, span.end) === span.quote
  );
}
