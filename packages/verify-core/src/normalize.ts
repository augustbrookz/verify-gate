/**
 * The normalisation layer used by span matching.
 *
 * It changes ONLY: Unicode compatibility forms (NFKC: ligatures, full-width
 * letters and digits, compatibility spaces — see the exclusions below),
 * whitespace (runs collapse to one space, ends trimmed, zero-width characters
 * and soft hyphens removed), quote style (curly and typographic quotes become
 * ' and "), dash style (en/em/minus/non-breaking hyphens become -), and the
 * ellipsis character (becomes ...). It never changes letters, digits, or
 * their case beyond what NFKC defines as the same character.
 *
 * NFKC is applied per grapheme (a base character with its combining marks),
 * so composition stays local and offsets stay exact. Compatibility characters
 * whose NFKC form would change a number are NOT folded: superscripts and
 * subscripts (10² is not 102), vulgar fractions (½ is not 12) and enclosed or
 * circled numbers (① is not 1). They match only themselves.
 *
 * Every normalised character keeps the range [map[i], ends[i]) of the original
 * characters it came from, so a match found in normalised text maps back to
 * exact offsets in the original source. Offsets returned to callers are ALWAYS
 * original offsets.
 */

export interface NormalizedText {
  text: string;
  /** map[i] = index in the original string where normalised character i starts. */
  map: number[];
  /** ends[i] = exclusive end, in the original string, of the characters normalised character i came from. */
  ends: number[];
}

const SINGLE_QUOTES = new Set(['‘', '’', '‚', '‛', '′', '`', '´']);
const DOUBLE_QUOTES = new Set(['“', '”', '„', '‟', '″', '«', '»']);
const DASHES = new Set(['‐', '‑', '‒', '–', '—', '―', '−', '﹘', '﹣', '－']);
const REMOVED = new Set(['​', '‌', '‍', '⁠', '﻿', '­']);

/** Compatibility characters whose NFKC form would change a numeric value. */
function keepUnfolded(cp: number): boolean {
  return (
    cp === 0x00b2 || cp === 0x00b3 || cp === 0x00b9 || // superscript two, three, one
    (cp >= 0x00bc && cp <= 0x00be) || // vulgar fractions ¼ ½ ¾
    (cp >= 0x2070 && cp <= 0x209f) || // superscripts and subscripts
    (cp >= 0x2150 && cp <= 0x218b) || // number forms (fractions, roman numerals)
    cp === 0x2044 || // fraction slash
    (cp >= 0x2460 && cp <= 0x24ff) || // enclosed alphanumerics (①, ⑴, ⒈ …)
    (cp >= 0x2776 && cp <= 0x2793) || // dingbat circled digits
    (cp >= 0x3251 && cp <= 0x325f) || (cp >= 0x32b1 && cp <= 0x32bf) || // circled numbers 21–50
    (cp >= 0x1f100 && cp <= 0x1f10c) // digit full stop / comma forms
  );
}

const COMBINING = /\p{M}/u;

function isSpace(ch: string): boolean {
  return /\s/.test(ch) || ch === ' ' || ch === ' ' || ch === ' ';
}

/** Split into graphemes: a base code point plus any combining marks after it, with original offsets. */
function graphemes(input: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < input.length) {
    const start = i;
    const cp = input.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    while (i < input.length) {
      const next = input.codePointAt(i)!;
      const ch = String.fromCodePoint(next);
      if (!COMBINING.test(ch)) break;
      i += next > 0xffff ? 2 : 1;
    }
    out.push({ text: input.slice(start, i), start, end: i });
  }
  return out;
}

function fold(g: string): string {
  const cp = g.codePointAt(0)!;
  if (keepUnfolded(cp)) return g;
  const n = g.normalize('NFKC');
  return n;
}

export function normalizeWithMap(input: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  const ends: number[] = [];
  let pendingSpace = -1;
  let pendingEnd = -1;
  const push = (ch: string, start: number, end: number) => {
    out.push(ch);
    map.push(start);
    ends.push(end);
  };
  for (const g of graphemes(input)) {
    const folded = fold(g.text);
    // A folded grapheme may expand (ligatures) or turn into a space (compatibility spaces).
    for (const ch of folded.length ? [...folded] : []) {
      if (REMOVED.has(ch)) continue;
      if (isSpace(ch)) {
        if (pendingSpace < 0) pendingSpace = g.start;
        pendingEnd = g.end;
        continue;
      }
      if (pendingSpace >= 0) {
        if (out.length > 0) push(' ', pendingSpace, pendingEnd);
        pendingSpace = -1;
      }
      if (SINGLE_QUOTES.has(ch)) push("'", g.start, g.end);
      else if (DOUBLE_QUOTES.has(ch)) push('"', g.start, g.end);
      else if (DASHES.has(ch)) push('-', g.start, g.end);
      else if (ch === '…') {
        push('.', g.start, g.end);
        push('.', g.start, g.end);
        push('.', g.start, g.end);
      } else push(ch, g.start, g.end);
    }
  }
  return { text: out.join(''), map, ends };
}

export function normalize(input: string): string {
  return normalizeWithMap(input).text;
}

/**
 * Punctuation characters the tolerant tier may ignore. Currency, percent and
 * comparison signs are NOT here: they carry meaning ($5 vs 5, 5% vs 5).
 */
const STRIPPABLE = new Set([',', '.', ';', ':', '!', '?', "'", '"', '(', ')', '[', ']', '{', '}', '-', '/', '*', '_']);

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/**
 * Remove punctuation from already-normalised text, keeping the map. A
 * separator BETWEEN TWO DIGITS is kept ("3.5", "1,000", "10-20"), because
 * deleting it would merge two numbers into a different one.
 */
export function stripPunctuation(norm: NormalizedText): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  const ends: number[] = [];
  const t = norm.text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (STRIPPABLE.has(ch) && !(isDigit(t[i - 1]) && isDigit(t[i + 1]))) continue;
    if (ch === ' ' && (out.length === 0 || out[out.length - 1] === ' ')) continue;
    out.push(ch);
    map.push(norm.map[i]);
    ends.push(norm.ends[i]);
  }
  while (out.length > 0 && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
    ends.pop();
  }
  return { text: out.join(''), map, ends };
}
