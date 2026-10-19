/**
 * Deterministic number, quantity and date extraction.
 *
 * Numbers and dates are where a confident model is most often wrong in a way
 * a reader cannot see, so they are compared in code. Conversions are applied
 * only where they are exact (2 weeks = 14 days, 1 year = 12 months, 1 day = 24
 * hours). Months are NOT converted to days and storage units are NOT converted
 * across sizes: those comparisons are reported as inconclusive rather than
 * guessed.
 */

export type Dimension =
  | 'currency'
  | 'percent'
  | 'duration_fixed' // seconds..weeks; base unit: second
  | 'duration_calendar' // months..decades; base unit: month
  | 'business_days'
  | 'data'
  | 'count'
  | 'clock'
  | 'plain';

export type Bound = 'exact' | 'max' | 'min' | 'approx' | 'range_low' | 'range_high';

export interface Quantity {
  raw: string;
  start: number;
  end: number;
  /** Value in the dimension's base unit (seconds, months, minutes since midnight, …). */
  value: number;
  /** The number as written, before unit conversion. */
  written: number;
  dimension: Dimension;
  /** Canonical unit for display/comparison: 'USD', '%', 'day', 'month', 'GB', 'user', … */
  unit: string | null;
  bound: Bound;
  /** "per month", "per user" … normalised, or null. */
  rate: string | null;
}

export interface DateValue {
  raw: string;
  start: number;
  end: number;
  year: number | null;
  month: number | null;
  day: number | null;
  quarter: number | null;
  precision: 'day' | 'month' | 'quarter' | 'year';
  /** A numeric date like 03/04/2026 that could be either order. */
  ambiguousOrder: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH_RE =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, a: 1, an: 1, single: 1, dozen: 12, couple: 2,
};
const SPELLED_RE =
  '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a|an|single|a dozen|a couple of)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?(?:\\s+hundred)?';

// Counts never read "a"/"an" as a number: "a user can…" is not a quantity.
const SPELLED_COUNT_RE = SPELLED_RE.replace('|a|an|single', '');

function spelledValue(raw: string): number | null {
  const s = raw.toLowerCase().replace(/^a couple of$/, 'couple').replace(/^a dozen$/, 'dozen');
  let total = 0;
  let any = false;
  for (const part of s.split(/[- ]+/)) {
    if (part === 'hundred') {
      total = (total || 1) * 100;
      any = true;
    } else if (part in SMALL) {
      total += SMALL[part];
      any = true;
    } else if (part !== 'of') {
      return null;
    }
  }
  return any ? total : null;
}

interface UnitDef {
  dimension: Dimension;
  unit: string;
  /** Multiplier into the dimension's base unit. */
  factor: number;
}

const UNIT_TABLE: Array<[RegExp, UnitDef]> = [
  [/^(?:business|working)[- ]days?$/i, { dimension: 'business_days', unit: 'business_day', factor: 1 }],
  [/^(?:business|working)[- ]weeks?$/i, { dimension: 'business_days', unit: 'business_day', factor: 5 }],
  [/^(?:seconds?|secs?)$/i, { dimension: 'duration_fixed', unit: 'second', factor: 1 }],
  [/^(?:minutes?|mins?)$/i, { dimension: 'duration_fixed', unit: 'minute', factor: 60 }],
  [/^(?:hours?|hrs?)$/i, { dimension: 'duration_fixed', unit: 'hour', factor: 3600 }],
  [/^(?:calendar[- ])?days?$/i, { dimension: 'duration_fixed', unit: 'day', factor: 86400 }],
  [/^weeks?$/i, { dimension: 'duration_fixed', unit: 'week', factor: 604800 }],
  [/^fortnights?$/i, { dimension: 'duration_fixed', unit: 'fortnight', factor: 1209600 }],
  [/^months?$/i, { dimension: 'duration_calendar', unit: 'month', factor: 1 }],
  [/^quarters?$/i, { dimension: 'duration_calendar', unit: 'quarter', factor: 3 }],
  [/^(?:years?|yrs?)$/i, { dimension: 'duration_calendar', unit: 'year', factor: 12 }],
  [/^decades?$/i, { dimension: 'duration_calendar', unit: 'decade', factor: 120 }],
  [/^(?:kb|kilobytes?)$/i, { dimension: 'data', unit: 'KB', factor: 1 }],
  [/^(?:mb|megabytes?)$/i, { dimension: 'data', unit: 'MB', factor: 1 }],
  [/^(?:gb|gigabytes?)$/i, { dimension: 'data', unit: 'GB', factor: 1 }],
  [/^(?:tb|terabytes?)$/i, { dimension: 'data', unit: 'TB', factor: 1 }],
];

const COUNT_NOUNS =
  'users?|seats?|members?|licen[cs]es?|devices?|accounts?|projects?|workspaces?|requests?|calls?|messages?|emails?|items?|orders?|days? off|employees?|dependents?|visits?|sessions?|attempts?|transfers?|withdrawals?|transactions?|bags?|pieces?|checks?|credits?|points?|minutes? of|tickets?|times|x|people|persons?|children|adults?|pets?|vehicles?|locations?|stores?|admins?|guests?|invites?|domains?|api keys?|keys?|tokens?|records?|files?|photos?|videos?|cameras?|sensors?|hubs?|rooms?|lines?|numbers?|cards?|payments?|installments?|refills?|prescriptions?|appointments?|copies|copy|reports?|exports?|integrations?|seats? per|webhooks?|endpoints?|regions?|zones?';

function singular(noun: string): string {
  const n = noun.toLowerCase().trim();
  if (n === 'people' || n === 'persons') return 'person';
  if (n === 'children') return 'child';
  if (n === 'times' || n === 'x') return 'times';
  if (n === 'copies') return 'copy';
  if (n.endsWith('ies')) return `${n.slice(0, -3)}y`;
  if (n.endsWith('ses') || n.endsWith('xes')) return n.slice(0, -2);
  if (n.endsWith('s') && !n.endsWith('ss')) return n.slice(0, -1);
  return n;
}

function parseNumber(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*(k|m|bn|b|thousand|million|billion)?$/i);
  if (!m) return spelledValue(raw);
  const base = Number(m[1]);
  const mult = (m[2] ?? '').toLowerCase();
  const factor =
    mult === 'k' || mult === 'thousand' ? 1e3 : mult === 'm' || mult === 'million' ? 1e6 : mult === 'b' || mult === 'bn' || mult === 'billion' ? 1e9 : 1;
  return base * factor;
}

function boundBefore(text: string, start: number): Bound | null {
  const before = text.slice(Math.max(0, start - 28), start).toLowerCase();
  if (/(?:up to|at most|no more than|not more than|a maximum of|maximum of|max(?:imum)?\.?|not to exceed|not exceeding|no later than|within|under|below|less than|fewer than|no longer than)\s*$/.test(before)) return 'max';
  if (/(?:at least|no fewer than|no less than|a minimum of|minimum of|min(?:imum)?\.?|more than|over|above|after|exceeding|no sooner than|beyond)\s*$/.test(before)) return 'min';
  if (/(?:about|approximately|approx\.?|around|roughly|nearly|almost|~|some)\s*$/.test(before)) return 'approx';
  return null;
}

function boundAfter(text: string, end: number): Bound | null {
  const after = text.slice(end, end + 20).toLowerCase();
  if (/^\s*(?:or less|or fewer|or under|max(?:imum)?\b|at most)/.test(after)) return 'max';
  if (/^\s*(?:or more|or longer|or greater|or above|\+|minimum\b|at least)/.test(after)) return 'min';
  return null;
}

function rateAfter(text: string, end: number): string | null {
  const after = text.slice(end, end + 40).toLowerCase();
  const m = after.match(
    /^\s*(?:\/\s*|per\s+|a\s+|an\s+|each\s+|every\s+)(month|mo|year|yr|annum|week|day|hour|user|seat|member|person|device|order|account|employee|transaction|transfer|bag|visit|night|license|unit|item|call|request|gb|mb|tb)\b/,
  );
  if (m) {
    const map: Record<string, string> = { mo: 'month', yr: 'year', annum: 'year' };
    return `per ${map[m[1]] ?? m[1]}`;
  }
  if (/^\s*(?:monthly|a month|\/mo\b)/.test(after)) return 'per month';
  if (/^\s*(?:annually|yearly|a year|per year)/.test(after)) return 'per year';
  return null;
}

/** Ranges of dates, so a date's digits are not also read as quantities. */
/**
 * No-break, thin and other Unicode spaces, and the zero-width characters, as a
 * plain space, one for one, so offsets into the original text stay exact.
 * "5\u00a0business days" and "5 \u200bbusiness days" read as "5 business days" (1.3.0).
 */
export function foldSpaces(text: string): string {
  return text.replace(/[\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/g, ' ');
}

export function extractDates(raw: string): DateValue[] {
  const text = foldSpaces(raw);
  const out: DateValue[] = [];
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  const add = (d: DateValue) => {
    if (!free(d.start, d.end)) return;
    taken.push([d.start, d.end]);
    out.push(d);
  };
  const month = (s: string) => MONTHS[s.toLowerCase().replace(/\.$/, '')] ?? MONTHS[s.toLowerCase().slice(0, 3)] ?? null;

  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add({ raw: m[0], start: m.index!, end: m.index! + m[0].length, year: +m[1], month: +m[2], day: +m[3], quarter: null, precision: 'day', ambiguousOrder: false });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'))) {
    add({ raw: m[0], start: m.index!, end: m.index! + m[0].length, year: m[3] ? +m[3] : null, month: month(m[1]), day: +m[2], quarter: null, precision: 'day', ambiguousOrder: false });
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi'))) {
    add({ raw: m[0], start: m.index!, end: m.index! + m[0].length, year: m[3] ? +m[3] : null, month: month(m[2]), day: +m[1], quarter: null, precision: 'day', ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const dayFirst = a > 12;
    add({
      raw: m[0], start: m.index!, end: m.index! + m[0].length, year,
      month: dayFirst ? b : a, day: dayFirst ? a : b, quarter: null, precision: 'day',
      ambiguousOrder: a <= 12 && b <= 12 && a !== b,
    });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?,?\\s+(\\d{4})\\b`, 'gi'))) {
    add({ raw: m[0], start: m.index!, end: m.index! + m[0].length, year: +m[2], month: month(m[1]), day: null, quarter: null, precision: 'month', ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(?:Q([1-4])|(first|second|third|fourth) quarter of)\s*(?:of\s+)?(?:FY\s?)?(\d{4})\b/gi)) {
    const q = m[1] ? +m[1] : ['first', 'second', 'third', 'fourth'].indexOf(m[2].toLowerCase()) + 1;
    add({ raw: m[0], start: m.index!, end: m.index! + m[0].length, year: +m[3], month: null, day: null, quarter: q, precision: 'quarter', ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(?:in|since|until|before|after|from|by|of|through|during|throughout|for|year|fiscal|calendar|FY|end of|start of|beginning of)\s+(?:year\s+)?((?:19|20)\d{2})\b/gi)) {
    const yStart = m.index! + m[0].length - 4;
    add({ raw: m[1], start: yStart, end: yStart + 4, year: +m[1], month: null, day: null, quarter: null, precision: 'year', ambiguousOrder: false });
  }
  return out.sort((a, b) => a.start - b.start);
}

const UNIT_WORDS =
  '(?:business|working)(?:-|\\s+)days?|(?:business|working)(?:-|\\s+)weeks?|calendar(?:-|\\s+)days?|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?|yrs?|decades?|kb|mb|gb|tb|kilobytes?|megabytes?|gigabytes?|terabytes?';

export function extractQuantities(raw: string, dates: DateValue[] = extractDates(raw)): Quantity[] {
  const text = foldSpaces(raw);
  const out: Quantity[] = [];
  const taken: Array<[number, number]> = dates.map((d) => [d.start, d.end]);
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  const add = (q: Quantity) => {
    if (!free(q.start, q.end)) return;
    taken.push([q.start, q.end]);
    out.push(q);
  };
  const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';

  // Currency: $1,200 / USD 30 / €5.50 / 30 dollars, with optional k/M multipliers.
  for (const m of text.matchAll(new RegExp(`(?:(US\\$|\\$|€|£|USD|EUR|GBP|CAD|AUD)\\s?(${NUM})(\\s?(?:k|m|bn|thousand|million|billion)\\b)?)|(?:\\b(${NUM})\\s?(dollars?|euros?|pounds?|cents?|USD|EUR|GBP)\\b)`, 'gi'))) {
    const sym = (m[1] ?? m[5] ?? '').toUpperCase();
    const unit = sym.startsWith('€') || sym.startsWith('EUR') ? 'EUR' : sym.startsWith('£') || sym.startsWith('POUND') || sym === 'GBP' ? 'GBP' : sym === 'CAD' ? 'CAD' : sym === 'AUD' ? 'AUD' : 'USD';
    const written = parseNumber(`${m[2] ?? m[4]}${(m[3] ?? '').trim()}`);
    if (written === null) continue;
    const value = /^cents?$/i.test(m[5] ?? '') ? written / 100 : written;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value, written, dimension: 'currency', unit, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? 'exact', rate: rateAfter(text, end) });
  }
  // Percent.
  for (const m of text.matchAll(new RegExp(`\\b(${NUM})\\s?(%|percent\\b|per cent\\b|pct\\b)`, 'gi'))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: 'percent', unit: '%', bound: boundBefore(text, start) ?? boundAfter(text, end) ?? 'exact', rate: rateAfter(text, end) });
  }
  // Ranges with a unit: "3-5 business days", "10 to 20 days", "between 2 and 4 weeks".
  for (const m of text.matchAll(new RegExp(`\\b(?:between\\s+)?(${NUM}|${SPELLED_RE})\\s*(?:-|–|—|to|and|through)\\s*(${NUM}|${SPELLED_RE})[\\s-]*(${UNIT_WORDS})\\b`, 'gi'))) {
    const def = UNIT_TABLE.find(([re]) => re.test(m[3].replace(/\s+/g, ' ')))?.[1];
    const lo = parseNumber(m[1]);
    const hi = parseNumber(m[2]);
    if (!def || lo === null || hi === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    if (!free(start, end)) continue;
    const rate = rateAfter(text, end);
    taken.push([start, end]);
    out.push({ raw: m[0], start, end, value: lo * def.factor, written: lo, dimension: def.dimension, unit: def.unit, bound: 'range_low', rate });
    out.push({ raw: m[0], start, end, value: hi * def.factor, written: hi, dimension: def.dimension, unit: def.unit, bound: 'range_high', rate });
  }
  // Number + duration / data unit (digits or spelled).
  for (const m of text.matchAll(new RegExp(`\\b(${NUM}|${SPELLED_RE})[\\s-]*(${UNIT_WORDS})\\b`, 'gi'))) {
    const def = UNIT_TABLE.find(([re]) => re.test(m[2].replace(/\s+/g, ' ')))?.[1];
    const written = parseNumber(m[1]);
    if (!def || written === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written * def.factor, written, dimension: def.dimension, unit: def.unit, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? 'exact', rate: rateAfter(text, end) });
  }
  // Clock times: 9 a.m., 5:30 pm, 17:00.
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?=\W|$)|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi)) {
    let h = Number(m[1] ?? m[4]);
    const min = Number(m[2] ?? m[5] ?? 0);
    const ap = (m[3] ?? '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: h * 60 + min, written: h * 60 + min, dimension: 'clock', unit: 'minute_of_day', bound: boundBefore(text, start) ?? 'exact', rate: null });
  }
  // Number + count noun: "5 users", "two bags", "3x".
  for (const m of text.matchAll(new RegExp(`\\b(${NUM}|${SPELLED_COUNT_RE})\\s*(?:additional\\s+|extra\\s+|free\\s+|concurrent\\s+|active\\s+|checked\\s+|carry-on\\s+|standard\\s+|paid\\s+)?(${COUNT_NOUNS})\\b`, 'gi'))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: 'count', unit: singular(m[2]), bound: boundBefore(text, start) ?? boundAfter(text, end) ?? 'exact', rate: rateAfter(text, end) });
  }
  // Any remaining bare digits.
  for (const m of text.matchAll(new RegExp(`(?<![\\w.])(${NUM})(?![\\w%])`, 'g'))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index!;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: 'plain', unit: null, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? 'exact', rate: rateAfter(text, end) });
  }
  return out.sort((a, b) => a.start - b.start || (a.bound === 'range_low' ? -1 : 1));
}

export type Comparison = 'equal' | 'conflict' | 'incomparable';

/** Compare two quantities. 'incomparable' means different dimensions or units with no exact conversion. */
export function compareQuantities(a: Quantity, b: Quantity): Comparison {
  if (a.dimension !== b.dimension) return 'incomparable';
  if (a.dimension === 'data' && a.unit !== b.unit) return 'incomparable';
  if (a.dimension === 'currency' && a.unit !== b.unit) return 'incomparable';
  if (a.dimension === 'count' && a.unit !== b.unit) return 'incomparable';
  // Rates ("per user", "per month") are compared as qualifiers, not here.
  return Math.abs(a.value - b.value) <= 1e-9 * Math.max(1, Math.abs(a.value)) ? 'equal' : 'conflict';
}

export type DateComparison = 'equal' | 'claim_less_precise' | 'claim_more_precise' | 'conflict';

export function compareDates(claim: DateValue, source: DateValue): DateComparison {
  const fields: Array<'year' | 'quarter' | 'month' | 'day'> = ['year', 'quarter', 'month', 'day'];
  const qOf = (d: DateValue) => d.quarter ?? (d.month ? Math.ceil(d.month / 3) : null);
  let claimExtra = false;
  let sourceExtra = false;
  for (const f of fields) {
    const a = f === 'quarter' ? qOf(claim) : claim[f];
    const b = f === 'quarter' ? qOf(source) : source[f];
    if (a !== null && b !== null && a !== b) return 'conflict';
    if (a !== null && b === null) claimExtra = true;
    if (a === null && b !== null) sourceExtra = true;
  }
  if (claimExtra && !sourceExtra) return 'claim_more_precise';
  if (sourceExtra && !claimExtra) return 'claim_less_precise';
  if (claimExtra && sourceExtra) return 'claim_more_precise';
  return 'equal';
}

/** Days from a calendar date (UTC), for date arithmetic. */
export function dayNumber(d: { year: number; month: number; day: number }): number {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

export function formatQuantity(q: Quantity): string {
  return q.raw.trim();
}
