/**
 * Canonical forms for parity comparison.
 *
 *   exact      a value is reduced to a canonical form and compared for equality:
 *              numbers and amounts by value and unit, dates as ISO days, citations
 *              in one notation, conditions by class and canonical wording
 *   tolerance  text is reduced to tokens with formatting removed (Unicode
 *              compatibility forms, quotes, dashes, whitespace, line breaks,
 *              hyphenation, case, punctuation) and a short list of drafting
 *              equivalences ("shall" / "must", "e-mail" / "email", spelled
 *              numbers with their numeral, "per cent" / "%"). Spelling is not
 *              tolerated: a one-letter edit can be a real one ("employer" /
 *              "employee", "lessor" / "lessee"), so a typo fix is a wording change
 *   excluded   not compared (metadata)
 *
 * Pure functions: every input is a parameter; nothing reads the clock, the
 * environment or shared state.
 */
import { extractDates, extractQuantities, normalize } from '@xyntherium/verify-core';

const SPELLED = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand';
/** "thirty (30) days" → "30 days": the drafting convention of a spelled number followed by its numeral. */
const SPELLED_WITH_NUMERAL = new RegExp(`\\b(?:(?:${SPELLED})[\\s-]*)+\\((\\d[\\d,.]*)\\)`, 'gi');

/** Word-level drafting equivalences, applied to tolerance tokens. */
const EQUIVALENT: Record<string, string> = {
  shall: 'must',
  'e-mail': 'email',
  'e-mails': 'emails',
  'on-line': 'online',
  percent: '%',
  sections: '§§',
  section: '§',
  utilize: 'use',
  utilizes: 'uses',
  utilized: 'used',
  thru: 'through',
};

/**
 * Text with drafting conventions folded: spelled number + numeral, a word hyphenated across
 * a line break (or the space a copy left of one: "telecommunica- tions"), "per cent", and dash punctuation in one form (a dash between figures is a range,
 * "825.202–825.205" or "825.202 -- 825.205"; elsewhere "—", "--" and a spaced hyphen are
 * the same spaced dash).
 */
export function foldDrafting(s: string): string {
  return s
    .replace(/(\p{L})-\s+(\p{Ll})/gu, '$1$2')
    .replace(/(\d)(?:\s*(?:-{2,3}|[‒-―−])\s*|\s+-\s+)(?=\d)/g, '$1-')
    .replace(/\s*(?:-{2,3}|[–-―])\s*|\s+-\s+/g, ' — ')
    .replace(SPELLED_WITH_NUMERAL, '$1')
    .replace(/\bper\s+cent\b/gi, 'percent');
}

/** Tolerance tokens: what remains of a text once formatting is removed. */
export function toleranceTokens(s: string): string[] {
  const t = normalize(foldDrafting(s)).toLowerCase();
  return t
    .replace(/(\d),(\d{3})\b/g, '$1$2') // 1,000 → 1000
    .replace(/§\s*/g, '§ ')
    .split(/[^\p{L}\p{N}%$§'.-]+/u)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter(Boolean)
    .map((w) => EQUIVALENT[w] ?? EQUIVALENT[w.replace(/-/g, '')] ?? w.replace(/(\p{L})-(\p{L})/gu, '$1$2'));
}

export function toleranceText(s: string): string {
  return toleranceTokens(s).join(' ');
}

/** Similarity of two token sequences in [0, 1] (1 = equivalent), for alignment only. */
export function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const B = new Set(b);
  const A = new Set(a);
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / Math.max(A.size, B.size);
}

/** A value found in a text: its canonical form and the words it was written as. */
export interface FoundValue {
  canon: string;
  raw: string;
}

/** Amounts and durations in order: dimension, value in the base unit, and bound; with the text. */
export function quantityValues(s: string): FoundValue[] {
  return extractQuantities(foldDrafting(s))
    .filter((q) => q.dimension !== 'plain' || q.written >= 10)
    .map((q) => ({ canon: `${q.dimension}:${Math.round(q.value * 1000) / 1000}:${q.bound}${q.rate ? `:${q.rate}` : ''}`, raw: q.raw.trim() }));
}

/** Canonical amounts and durations, sorted. */
export function canonicalQuantities(s: string): string[] {
  return quantityValues(s)
    .map((q) => q.canon)
    .sort();
}

/** Dates in order (ISO day, or year-month, or year), with the text. */
export function dateValues(s: string): FoundValue[] {
  return extractDates(s).map((d) => ({ canon: [d.year ?? '????', d.month ? String(d.month).padStart(2, '0') : null, d.day ? String(d.day).padStart(2, '0') : null].filter((x) => x !== null).join('-'), raw: d.raw.trim() }));
}

/** Canonical dates, sorted. */
export function canonicalDates(s: string): string[] {
  return dateValues(s)
    .map((d) => d.canon)
    .sort();
}

const CITATION_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/§§?\s*(\d+[\w.-]*(?:\([\w]+\))*)/g, (m) => `§${m[1].replace(/[.]$/, '')}`],
  [/\bsections?\s+(\d+[\w.-]*(?:\([\w]+\))*)/gi, (m) => `§${m[1].replace(/[.]$/, '')}`],
  [/\b(\d+)\s+(?:CFR|C\.\s?F\.\s?R\.)\s+(?:parts?\s+)?(\d+[\w.-]*(?:\([\w]+\))*)/gi, (m) => `${m[1]} cfr ${m[2].replace(/[.]$/, '')}`],
  [/\b(\d+)\s+U\.?\s?S\.?\s?C\.?\s+(\d+[\w-]*(?:\([\w]+\))*)/gi, (m) => `${m[1]} usc ${m[2]}`],
  [/\bparagraphs?\s+((?:\([\w]+\))+)/gi, (m) => `para ${m[1].toLowerCase()}`],
  [/\bchapter\s+(\d+)\b/gi, (m) => `chapter ${m[1]}`],
  [/\b(?:heading|subheading)s?\s+(\d{4}(?:\.\d{2}){0,3})\b/gi, (m) => `heading ${m[1]}`],
  [/\b(?:Pub\.\s*L\.|Public Law)\s+(\d+-\d+)/gi, (m) => `pl ${m[1]}`],
];

export interface CitationMatch {
  start: number;
  end: number;
  canon: string;
}

/** Citations in `s` with their spans (in `s` as given; patterns run on the text as is). */
export function citationMatches(s: string): CitationMatch[] {
  const out: CitationMatch[] = [];
  for (const [re, f] of CITATION_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (!out.some((o) => start < o.end && end > o.start)) out.push({ start, end, canon: f(m) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Canonical citations (sections, CFR and U.S.C. references, paragraph cross-references,
 * chapters, HTS headings), sorted, each occurrence counted: one of two references to
 * § 668.13 becoming § 668.14 is a change.
 */
export function canonicalCitations(s: string): string[] {
  return citationMatches(normalize(s))
    .map((m) => m.canon)
    .sort();
}

const MODALS = /\b(?:shall not|must not|may not|cannot|can not|shall|must|may|can|should|will|is required to|are required to)\b/g;

/** The modal class of every modal verb in `s`, sorted (lower-case only: "May" is usually the month). */
export function modalsOf(s: string): string[] {
  return [...s.matchAll(MODALS)].map((m) => modalClass(m[0])).sort();
}

/** The modal class of a modality phrase, so drafting variants compare equal ("shall" and "must"). */
export function modalClass(word: string): 'obligation' | 'permission' | 'recommendation' | 'future' | 'prohibition' {
  const w = word.trim().toLowerCase();
  if (/^(?:shall not|must not|may not|cannot|can not)$/.test(w)) return 'prohibition';
  if (/^(?:shall|must|required|is required to|are required to|need to|needs to)$/.test(w)) return 'obligation';
  if (/^(?:may|can)$/.test(w)) return 'permission';
  if (/^should$/.test(w)) return 'recommendation';
  return 'future';
}

/** One paragraph designator: "(a)", "(aa)", "(1)", "(ii)", "(A)". */
export const DESIGNATOR = '\\((?:[a-z]{1,3}|[A-Z]{1,2}|[0-9]{1,3}|[ivxlc]{1,6})\\)';

/** Leading paragraph designators ("(a)", "(1)(ii)", "(A)", "1.") are layout, not content. */
export function stripDesignator(s: string): { designator: string | null; text: string } {
  const m = new RegExp(`^\\s*((?:${DESIGNATOR}\\s*)+|\\d{1,3}\\.\\s+(?=\\p{Lu}))`, 'u').exec(s);
  return m ? { designator: m[1].trim(), text: s.slice(m[0].length) } : { designator: null, text: s };
}
