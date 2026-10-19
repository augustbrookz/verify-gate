/**
 * Qualifier extraction and comparison, in code.
 *
 * A claim can quote a real sentence and still misrepresent it by leaving out
 * the part that limits it: "refunds within 30 days" where the source says
 * "refunds within 30 days for annual plans purchased after March 1". The
 * words are found; the meaning is not. This module extracts the material
 * qualifiers from a claim and from the source context around its span, and
 * marks each one preserved, dropped, contradicted, or ambiguous.
 *
 * Rules, not a model, do the comparison. A model may propose extra qualifiers
 * it noticed in the source; those are checked to exist verbatim and then go
 * through the same comparison.
 */
import type { QualifierRow, QualifierType } from './contract';
import {
  compareDates,
  compareQuantities,
  extractDates,
  extractQuantities,
  type DateValue,
  type Quantity,
} from './numbers';
import { contentStems, coverage, words } from './text';

export interface Qualifier {
  type: QualifierType;
  text: string;
  start: number;
  end: number;
  material: boolean;
  quantity?: Quantity;
  date?: DateValue;
  modality?: 'obligation' | 'permission' | 'future' | 'recommendation';
}

const BOUNDARY = /[,;.:!?()]|\s(?:and|but|or|which|so)\s/i;

/**
 * Read from a trigger to the end of its phrase (next clause punctuation),
 * capped. Never cuts inside a number like 1,000 or a date like "May 1, 2025".
 */
function phraseFrom(text: string, start: number, max = 110, protectedRanges: Array<[number, number]> = []): { end: number; text: string } {
  const rest = text.slice(start, start + max);
  let cut = rest.length;
  const re = new RegExp(BOUNDARY.source, 'gi');
  for (const m of rest.matchAll(re)) {
    const i = m.index ?? 0;
    if (i < 3) continue;
    if (/[,.]/.test(m[0]) && /\d/.test(rest[i - 1] ?? '') && /\d/.test(rest[i + 1] ?? '')) continue;
    const abs = start + i;
    if (protectedRanges.some(([a, b]) => abs > a && abs < b)) continue;
    cut = i;
    break;
  }
  const phrase = rest.slice(0, cut).trimEnd();
  return { end: start + phrase.length, text: phrase };
}

const CONDITION_TRIGGERS = [
  'if and only if', 'only if', 'only when', 'only after', 'only before', 'only for', 'only to', 'only on',
  'only in', 'only with', 'only during', 'only within', 'only once', 'provided that', 'providing that',
  'as long as', 'so long as', 'on condition that', 'in the event that', 'in case of', 'subject to',
  'except for', 'except when', 'except if', 'except', 'excluding', 'other than', 'but not', 'unless',
  'with the exception of', 'does not apply to', 'do not apply to', "doesn't apply to", "don't apply to", 'not applicable to',
  'exclusively for', 'limited to', 'restricted to', 'reserved for', 'available to', 'available only to',
  'eligible for', 'if', 'when', 'whenever', 'upon', 'requires', 'require', 'required', 'assuming',
];
const CONDITION_RE = new RegExp(
  `\\b(?:${CONDITION_TRIGGERS.map((t) => t.replace(/ /g, '\\s+')).join('|')})\\b` +
    `|\\bprovided\\b(?!\\s+by\\b)|\\bproviding\\b(?!\\s+(?:a|an|the|you)\\b)` +
    `|\\bwith\\s+[^,;.]{2,60}?\\s+(?:switched on|switched off|turned on|turned off|enabled|disabled|activated|installed|connected|selected|on file|in place|active)\\b` +
    `|\\bwith\\s+(?:a|an)\\s+(?:valid|active|paid|verified|current|eligible|qualifying)\\b` +
    `|\\bwho\\s+(?:have|has|are|is|were|was|enrolled|enroll|joined|signed|purchased|bought|hold|holds|use|uses|live|lives|reside|resides|work|works|subscribe|subscribed|upgraded|registered)\\b` +
    `|\\bfor\\s+(?:members|customers|users|employees|subscribers|accounts|orders|purchases|plans|those|anyone|people|businesses|teams|students|residents|new|existing|eligible|annual|monthly|yearly|enterprise|business|premium|pro|paid|free|first-time|full-time|part-time|domestic|international|qualifying|verified|active|returning|individual|family|corporate|personal|standard|basic|plus)\\b`,
  'gi',
);

/**
 * A trailing exception (rules 2.1.0): the excluded thing comes first and the trigger after it,
 * "within 30 days of delivery, final-sale items excluded", "(gift cards not included)",
 * "clearance items are not eligible". The phrase runs from the clause start (after a comma,
 * semicolon, colon, parenthesis or sentence start) through the trigger; a noun phrase of at
 * most seven words, so a whole clause is never taken as the exception.
 */
const TRAILING_EXCEPTION_RE =
  /(?:^|[,;:(]|[.!?]\s|\n)\s*((?:(?!\b(?:and|or|but|which|that|except|unless|if|when)\b)[^\s,;:()!?\n.]+\s+){1,7}(?:are\s+|is\s+)?(?:excluded|not\s+included|not\s+eligible|ineligible)\b[^,;:()!?\n]{0,60})/gi;

const TIME_TRIGGERS = [
  'within', 'between', 'during', 'until', 'till', 'through', 'by', 'before', 'after', 'no later than',
  'not later than', 'in no event later than', 'no earlier than', 'not earlier than',
  'starting', 'beginning', 'effective', 'as of', 'since', 'for the first', 'for the last', 'for up to',
  'from', 'prior to', 'following', 'ending', 'expires', 'expiring',
];
const TIME_RE = new RegExp(`\\b(?:${TIME_TRIGGERS.map((t) => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi');
/** A deadline phrase is a time window by itself, whatever follows it ("not later than the date listed in ..."). */
const DEADLINE_LEAD = /^(?:no|not|in\s+no\s+event)\s+(?:later|earlier)\s+than\b/i;
/** Time anchors that are not parsed as dated values: ordinal days, business days, billing cycles. */
const TIME_ANCHOR =
  /\b(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|[a-z]+teenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|ninetieth)\s+(?:business\s+|calendar\s+|banking\s+)?day\b|\b(?:business|calendar|banking)\s+days?\b|\bbilling\s+cycles?\b/i;
const PERIODIC_RE =
  /\b(?:(?:per|each|every|a|once a|twice a)\s+(?:month|year|billing cycle|calendar year|plan year|week|day|quarter)|annually|monthly|weekly|daily|quarterly|yearly|on weekdays|on weekends|during business hours|business hours|(?:monday|mon)\s*(?:through|to|-|–)\s*(?:friday|fri|saturday|sat))\b/gi;

// Subject restrictions: "Annual-plan customers", "customers on annual plans", "new customers".
const SUBJECT_SCOPE_RE =
  /\b(?:(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)[- ](?:plan|tier)\s+(?:customers|subscribers|members|users|accounts|account holders|holders)|(?:customers|subscribers|members|users|accounts|account holders)\s+(?:on|with|under|in)\s+(?:an?\s+|the\s+)?(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)\s+(?:plans?|tiers?|subscriptions?|accounts?|memberships?)|(?:on|with|under)\s+(?:an?\s+|the\s+)?(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)\s+(?:plans?|tiers?|subscriptions?|memberships?)|(?:new|existing|returning|first-time|business|enterprise|premium|eligible|verified|domestic|international|EU|US|UK|student|nonprofit|non-profit|education|government|full-time|part-time|salaried|hourly|in-network)\s+(?:customers|subscribers|members|users|accounts|account holders|employees|students|patients|travell?ers|passengers|cardholders|staff))\b/gi;

const SCOPE_RE =
  /\b(?:in|within|across|outside)\s+(?:the\s+)?(?:US|U\.S\.|USA|United States|EU|European Union|EEA|UK|United Kingdom|Canada|Australia|California|New York|Texas|[A-Z][a-z]+ (?:region|state|province|country))\b|\b(?:domestic(?:ally)?|international(?:ly)?|worldwide|nationwide|globally|in-network|out-of-network|in network|out of network|on-site|remote(?:ly)?|in-store|online only|in person)\b|\b(?:most|some|certain|select|selected|many|several|few|eligible|qualifying|participating)\b|\bper\s+(?:user|seat|member|person|device|account|employee|household|order|location|transaction|vehicle|bag|passenger|traveler|dependent)\b/gi;

const UNIVERSAL_SCOPE = new Set(['all', 'every', 'each', 'any', 'only', 'always', 'never', 'entire', 'whole']);

const NEGATION_RE =
  /\b(?:not|never|no|none|neither|nor|without|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|shouldn't|mustn't|hasn't|haven't|hadn't|couldn't|wouldn't|ineligible|unavailable|excluded|prohibited|non-refundable|nonrefundable|non-transferable)\b/gi;
// Phrases whose "no"/"not" bounds a quantity rather than negating the predicate.
const NOT_NEGATION_RE =
  /\b(?:no\s+(?:later|earlier|more|fewer|less|sooner|longer)\s+than|not\s+(?:only|exceeding|to\s+exceed|more\s+than|less\s+than|later\s+than)|no\s+longer\s+than)\b/gi;

const MODAL_RE =
  /\b(?:must|shall|is required to|are required to|required to|have to|has to|need to|needs to|mandatory|may|can|could|might|is allowed to|are allowed to|is permitted to|are permitted to|is eligible to|are eligible to|optional|will|is going to|are going to|should|is recommended|are recommended|recommended)\b/gi;

function modalClass(m: string): Qualifier['modality'] {
  const s = m.toLowerCase();
  if (/must|shall|required|have to|has to|need|mandatory/.test(s)) return 'obligation';
  if (/should|recommend/.test(s)) return 'recommendation';
  if (/will|going to/.test(s)) return 'future';
  return 'permission';
}

const ENTITY_RE =
  /\b(?:[A-Z][a-zA-Z0-9&'-]*(?:\s+(?:of|and|&|for|the)?\s*[A-Z][a-zA-Z0-9&'-]*)*(?:\s+(?:plan|tier|edition|package|subscription|account|card|membership|program|programme|policy|team|portal|app|API|SDK))?|[A-Z]{2,}[a-z]?s?)\b/g;
const ENTITY_STOP = new Set([
  'The', 'A', 'An', 'If', 'When', 'You', 'Your', 'We', 'Our', 'It', 'This', 'That', 'These', 'Those', 'For',
  'In', 'On', 'At', 'To', 'From', 'By', 'With', 'Yes', 'No', 'Not', 'All', 'Any', 'Each', 'Every', 'Some',
  'Most', 'Only', 'After', 'Before', 'During', 'Within', 'Once', 'Unless', 'Customers', 'Users', 'Members',
  'Employees', 'Refunds', 'Orders', 'Note', 'However', 'Also', 'There', 'They', 'Please', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Updated', 'Effective', 'As',
  'I', 'OK', 'AM', 'PM', 'USD', 'EUR', 'GBP',
]);

function masked(text: string): string {
  // Remove bound-phrases so their "no"/"not" are not read as negation.
  return text.replace(NOT_NEGATION_RE, (m) => ' '.repeat(m.length));
}

export function negationCount(text: string): number {
  return (masked(text).match(NEGATION_RE) ?? []).length;
}

export function extractQualifiers(text: string): Qualifier[] {
  const out: Qualifier[] = [];
  const dates = extractDates(text);
  const quantities = extractQuantities(text, dates);
  for (const d of dates) out.push({ type: 'date', text: d.raw, start: d.start, end: d.end, material: true, date: d });
  for (const q of quantities) {
    if (q.bound === 'range_high') continue;
    out.push({ type: 'quantity', text: q.raw, start: q.start, end: q.end, material: true, quantity: q });
  }
  const covered: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => covered.some(([a, b]) => s < b && e > a);
  const valueRanges: Array<[number, number]> = [...dates.map((d) => [d.start, d.end] as [number, number]), ...quantities.map((x) => [x.start, x.end] as [number, number])];

  for (const m of text.matchAll(CONDITION_RE)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + 1)) continue;
    const { end, text: phrase } = phraseFrom(text, start, 110, valueRanges);
    if (words(phrase).length < 2) continue;
    // "when"/"if" opening a question-like clause with nothing restrictive is still a condition; keep.
    const hasTime = dates.some((d) => d.start >= start && d.end <= end) || quantities.some((q) => q.start >= start && q.end <= end && /duration|business/.test(q.dimension));
    out.push({ type: hasTime && /^(?:within|after|before|until|by)\b/i.test(phrase) ? 'time_range' : 'condition', text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(TRAILING_EXCEPTION_RE)) {
    const phrase = (m[1] ?? '').replace(/[.\s]+$/, '');
    const start = (m.index ?? 0) + m[0].indexOf(m[1] as string);
    const end = start + phrase.length;
    if (overlaps(start, end) || words(phrase).length < 2) continue;
    out.push({ type: 'condition', text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  // A leading phrase set off by a comma scopes the whole clause:
  // "With Local Mode switched on, ...", "Under the Pro plan, ...", "In the EU, ...".
  for (const m of text.matchAll(/(?:^|[.!?]\s+|\n)((?:With|Under|Using|On|For|In|During|After|Before|Within|Once|Until|From|Between|As of|Starting|Beginning|Effective|Except|Unless|If|When|Provided)\s+[^,.;:\n]{2,90}),/g)) {
    const start = (m.index ?? 0) + m[0].indexOf(m[1]);
    const end = start + m[1].length;
    if (overlaps(start, end)) continue;
    const hasTime = dates.some((d) => d.start >= start && d.end <= end) || quantities.some((q) => q.start >= start && q.end <= end && /duration|business/.test(q.dimension));
    out.push({ type: hasTime ? 'time_range' : 'condition', text: m[1], start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(TIME_RE)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + 1)) continue;
    const { end, text: phrase } = phraseFrom(text, start, 80, valueRanges);
    const inside =
      dates.some((d) => d.start >= start && d.end <= end) ||
      quantities.some((q) => q.start >= start && q.end <= end && q.dimension !== 'plain') ||
      DEADLINE_LEAD.test(phrase) ||
      TIME_ANCHOR.test(phrase);
    if (!inside) continue;
    out.push({ type: 'time_range', text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(PERIODIC_RE)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    out.push({ type: 'time_range', text: m[0], start, end: start + m[0].length, material: true });
    covered.push([start, start + m[0].length]);
  }
  for (const m of text.matchAll(SUBJECT_SCOPE_RE)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    out.push({ type: 'scope', text: m[0], start, end: start + m[0].length, material: true });
    covered.push([start, start + m[0].length]);
  }
  for (const m of text.matchAll(SCOPE_RE)) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    out.push({ type: 'scope', text: m[0], start, end: start + m[0].length, material: true });
  }
  for (const w of words(text)) {
    if (UNIVERSAL_SCOPE.has(w)) {
      const idx = text.toLowerCase().search(new RegExp(`\\b${w}\\b`));
      if (idx >= 0 && !overlaps(idx, idx + w.length) && !out.some((q) => q.type === 'scope' && q.start === idx)) {
        out.push({ type: 'scope', text: text.slice(idx, idx + w.length), start: idx, end: idx + w.length, material: false });
      }
    }
  }
  const maskedText = masked(text);
  for (const m of maskedText.matchAll(NEGATION_RE)) {
    const start = m.index ?? 0;
    out.push({ type: 'negation', text: text.slice(start, start + m[0].length), start, end: start + m[0].length, material: true });
  }
  for (const m of text.matchAll(MODAL_RE)) {
    const start = m.index ?? 0;
    out.push({ type: 'modality', text: m[0], start, end: start + m[0].length, material: true, modality: modalClass(m[0]) });
  }
  for (const m of text.matchAll(ENTITY_RE)) {
    const raw = m[0].trim();
    const first = raw.split(/\s+/)[0];
    if (ENTITY_STOP.has(first) && !raw.includes(' ')) continue;
    const start = m.index ?? 0;
    // A single capitalised word opening a sentence is just capitalisation.
    const sentenceInitial = start === 0 || /[.!?:\n]\s*$/.test(text.slice(Math.max(0, start - 3), start));
    if (sentenceInitial && !raw.includes(' ') && !/^[A-Z]{2,}/.test(raw)) continue;
    const cleaned = ENTITY_STOP.has(first) ? raw.slice(first.length).trim() : raw;
    if (!cleaned || cleaned.length < 2 || /^\d/.test(cleaned)) continue;
    if (dates.some((d) => start < d.end && start + raw.length > d.start)) continue;
    const cStart = start + raw.indexOf(cleaned);
    out.push({ type: 'entity', text: cleaned, start: cStart, end: cStart + cleaned.length, material: true });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ProposedQualifier {
  type: QualifierType;
  text: string;
}

export interface QualifierComparison {
  rows: QualifierRow[];
  dropped: QualifierRow[];
  contradicted: QualifierRow[];
  ambiguous: QualifierRow[];
  /** Claim quantities/dates that matched a value in the source context. */
  matchedValues: number;
  /** Claim quantities/dates with no equal value in the source context. */
  unmatchedValues: number;
}

const TRIGGER_WORDS = new Set(
  [...CONDITION_TRIGGERS, ...TIME_TRIGGERS, 'with', 'who', 'for', 'valid', 'active', 'paid']
    .flatMap((t) => t.split(' '))
    .concat(['only', 'available', 'eligible', 'apply', 'applies']),
);

/** Content stems of a qualifier phrase, excluding its trigger words and its values (compared separately). */
function phraseStems(text: string): string[] {
  const dates = extractDates(text);
  const spans = [...dates.map((d) => [d.start, d.end]), ...extractQuantities(text, dates).map((q) => [q.start, q.end])].sort((a, b) => b[0] - a[0]);
  let bare = text;
  for (const [a, b] of spans) bare = bare.slice(0, a) + ' ' + bare.slice(b);
  return contentStems(bare).filter((s) => !TRIGGER_WORDS.has(s));
}

function row(
  type: QualifierType,
  claim: string | null,
  source: string | null,
  status: QualifierRow['status'],
  note: string,
  material = true,
  proposedBy: QualifierRow['proposed_by'] = 'code',
): QualifierRow {
  return { type, claim_text: claim, source_text: source, status, material, note, proposed_by: proposedBy };
}

function valuesIn(text: string): { dates: DateValue[]; quantities: Quantity[] } {
  const dates = extractDates(text);
  return { dates, quantities: extractQuantities(text, dates) };
}

/**
 * Compare the claim's qualifiers with those of the source context its span
 * sits in. `context` should be clauseContext(...) of the supporting span, not
 * the whole passage.
 */
export function compareQualifiers(
  claimText: string,
  context: string,
  proposed: ProposedQualifier[] = [],
): QualifierComparison {
  const claimQ = extractQualifiers(claimText);
  const srcQ = extractQualifiers(context);
  const claimVals = valuesIn(claimText);
  const srcVals = valuesIn(context);
  const claimStems = new Set(contentStems(claimText));
  const rows: QualifierRow[] = [];
  let matchedValues = 0;
  let unmatchedValues = 0;

  // 1. Claim quantities must be backed by an equal value in the context.
  for (const cq of claimVals.quantities) {
    if (cq.bound === 'range_high') continue;
    const same = srcVals.quantities.filter((sq) => compareQuantities(cq, sq) !== 'incomparable' || (cq.dimension === sq.dimension && cq.unit === sq.unit));
    const equal = same.find((sq) => compareQuantities(cq, sq) === 'equal');
    if (equal) {
      matchedValues++;
      // Bound drift on the same value: "up to $500" in the source, "$500" in the claim.
      const boundNote = boundDrift(cq, equal);
      if (boundNote) rows.push(boundNote);
      // A rate the source attaches that the claim leaves off ("$10 per user per month" vs "$10 per month").
      const srcRates = ratesAfter(context, equal.end);
      const claimRates = ratesAfter(claimText, cq.end);
      const missingRates = srcRates.filter((r) => !claimRates.includes(r));
      const extraRates = claimRates.filter((r) => !srcRates.includes(r));
      const claimSide = `${cq.raw} ${claimRates.join(' ')}`.trim();
      const sourceSide = `${equal.raw} ${srcRates.join(' ')}`.trim();
      if (extraRates.length && missingRates.length) rows.push(row('quantity', claimSide, sourceSide, 'contradicted', 'same amount, different rate'));
      else if (extraRates.length) rows.push(row('quantity', claimSide, sourceSide, 'ambiguous', 'claim adds a rate the source does not state'));
      else if (missingRates.length) rows.push(row('scope', null, missingRates.join(' '), 'dropped', 'rate in source omitted'));
      else rows.push(row('quantity', cq.raw, equal.raw, 'preserved', 'same value'));
      continue;
    }
    unmatchedValues++;
    const conflicting = same.find((sq) => compareQuantities(cq, sq) === 'conflict');
    if (conflicting && cq.dimension !== 'plain') {
      rows.push(row('quantity', cq.raw, conflicting.raw, 'contradicted', 'different value, same unit'));
    } else {
      rows.push(row('quantity', cq.raw, null, 'ambiguous', 'value not in source context'));
    }
  }

  // 2. Claim dates.
  for (const cd of claimVals.dates) {
    let best: { d: DateValue; c: ReturnType<typeof compareDates> } | null = null;
    for (const sd of srcVals.dates) {
      const c = compareDates(cd, sd);
      if (c === 'equal' || c === 'claim_less_precise') {
        best = { d: sd, c };
        break;
      }
      if (!best || (best.c === 'conflict' && c === 'claim_more_precise')) best = { d: sd, c };
    }
    if (!best) {
      unmatchedValues++;
      rows.push(row('date', cd.raw, null, 'ambiguous', 'date not in source context'));
    } else if (best.c === 'equal' || best.c === 'claim_less_precise') {
      matchedValues++;
      rows.push(row('date', cd.raw, best.d.raw, 'preserved', best.c === 'equal' ? 'same date' : 'claim is less specific'));
    } else if (best.c === 'conflict') {
      unmatchedValues++;
      rows.push(row('date', cd.raw, best.d.raw, 'contradicted', 'different date'));
    } else {
      unmatchedValues++;
      rows.push(row('date', cd.raw, best.d.raw, 'ambiguous', 'claim is more specific than source'));
    }
  }

  // 3. Restricting phrases in the source context the claim must carry.
  const sourcePhrases: Array<{ type: QualifierType; text: string; by: 'code' | 'model' }> = srcQ
    .filter((q) => (q.type === 'condition' || q.type === 'time_range' || q.type === 'scope') && q.material)
    // "per user"/"per month" next to a value is handled with the value's rate above.
    .filter((q) => !(q.type === 'scope' && /^per\s/i.test(q.text)))
    .map((q) => ({ type: q.type, text: q.text, by: 'code' as const }));
  for (const p of proposed) {
    if (!['condition', 'time_range', 'scope', 'date'].includes(p.type)) continue;
    if (!p.text || !context.includes(p.text)) continue; // model proposals must exist verbatim
    if (sourcePhrases.some((s) => s.text.includes(p.text) || p.text.includes(s.text))) continue;
    sourcePhrases.push({ type: p.type, text: p.text, by: 'model' });
  }
  for (const sp of sourcePhrases) {
    const stems = phraseStems(sp.text);
    const vals = valuesIn(sp.text);
    let valueState: 'none' | 'match' | 'conflict' | 'missing' = 'none';
    for (const q of vals.quantities) {
      const cmp = claimVals.quantities.map((cq) => compareQuantities(cq, q));
      if (cmp.includes('equal')) valueState = valueState === 'conflict' ? 'conflict' : 'match';
      else if (cmp.includes('conflict')) valueState = 'conflict';
      else if (valueState !== 'conflict') valueState = 'missing';
    }
    for (const d of vals.dates) {
      const cmp = claimVals.dates.map((cd) => compareDates(cd, d));
      if (cmp.some((c) => c === 'equal' || c === 'claim_less_precise' || c === 'claim_more_precise')) valueState = valueState === 'conflict' ? 'conflict' : 'match';
      else if (cmp.includes('conflict')) valueState = 'conflict';
      else if (valueState !== 'conflict') valueState = 'missing';
    }
    const cov = stems.length ? stems.filter((s) => claimStems.has(s)).length / stems.length : valueState === 'match' ? 1 : 0;
    const scopeWord = sp.type === 'scope' ? sp.text.toLowerCase() : '';
    if (valueState === 'conflict') {
      rows.push(row(sp.type, null, sp.text, 'contradicted', 'value inside the source qualifier differs', true, sp.by));
    } else if (cov >= 0.7 && valueState !== 'missing') {
      rows.push(row(sp.type, sp.text, sp.text, 'preserved', 'restated in claim', true, sp.by));
    } else if (sp.type === 'scope' && /^(?:most|some|certain|select|selected|many|several|few)$/.test(scopeWord) && claimStems.size > 0) {
      // A hedging quantifier in the source that the claim states universally.
      rows.push(row('scope', null, sp.text, 'dropped', 'source limits the scope; claim does not', true, sp.by));
    } else if ((cov >= 0.34 || valueState === 'match') && valueState !== 'missing') {
      // Values all carried over but the wording differs: code cannot tell a
      // synonym from a lost restriction, so a model must look.
      rows.push(row(sp.type, null, sp.text, 'ambiguous', valueState === 'match' ? 'values restated, wording differs' : 'partly restated', true, sp.by));
    } else {
      rows.push(row(sp.type, null, sp.text, 'dropped', 'material qualifier in source, absent from claim', true, sp.by));
    }
  }

  // 4. Restrictions the claim adds that the source context does not state.
  const srcStems = new Set(contentStems(context));
  for (const q of claimQ) {
    if (q.type !== 'condition' && q.type !== 'time_range' && q.type !== 'scope') continue;
    if (!q.material) {
      // "all"/"every"/"only" in the claim: fine if the source says it too.
      const w = q.text.toLowerCase();
      if (!words(context).includes(w) && (w === 'only' || w === 'all' || w === 'every' || w === 'always' || w === 'never')) {
        rows.push(row('scope', q.text, null, 'ambiguous', 'claim generalises; source does not say this', true));
      }
      continue;
    }
    if (rows.some((r) => r.claim_text === q.text || (r.source_text && coverage(q.text, r.source_text) >= 0.7))) continue;
    const stems = phraseStems(q.text);
    const cov = stems.length ? stems.filter((s) => srcStems.has(s)).length / stems.length : 1;
    if (cov < 0.7) rows.push(row(q.type, q.text, null, 'ambiguous', 'claim adds a qualifier the source context does not state'));
  }

  // 5. Polarity and modality. Code cannot tell which predicate a "not" negates,
  //    so a mismatch is ambiguous here; the template rule (rules.ts) catches the
  //    unambiguous verbatim-flip case.
  const cNeg = negationCount(claimText) % 2 === 1;
  const sNeg = negationCount(context) % 2 === 1;
  if (cNeg !== sNeg) {
    rows.push(row('negation', cNeg ? 'negated' : 'affirmative', sNeg ? 'negated' : 'affirmative', 'ambiguous', 'polarity differs from source context'));
  }
  const cMod = claimQ.filter((q) => q.type === 'modality').map((q) => q.modality);
  const sMod = srcQ.filter((q) => q.type === 'modality').map((q) => q.modality);
  for (const m of new Set(cMod)) {
    if (sMod.length && !sMod.includes(m)) {
      rows.push(row('modality', m ?? null, sMod.join('/'), 'ambiguous', 'different modality'));
    }
  }

  // 6. Named entities in the claim must appear in the context.
  const ctxLower = context.toLowerCase();
  for (const q of claimQ.filter((x) => x.type === 'entity')) {
    if (!ctxLower.includes(q.text.toLowerCase())) {
      rows.push(row('entity', q.text, null, 'ambiguous', 'entity not in source context'));
    }
  }

  return {
    rows,
    dropped: rows.filter((r) => r.status === 'dropped' && r.material),
    contradicted: rows.filter((r) => r.status === 'contradicted' && r.material),
    ambiguous: rows.filter((r) => r.status === 'ambiguous' && r.material),
    matchedValues,
    unmatchedValues,
  };
}

function boundDrift(claim: Quantity, source: Quantity): QualifierRow | null {
  if (claim.bound === source.bound) return null;
  const durational = claim.dimension === 'duration_fixed' || claim.dimension === 'duration_calendar' || claim.dimension === 'business_days';
  const opposite =
    (claim.bound === 'max' && source.bound === 'min') || (claim.bound === 'min' && source.bound === 'max');
  if (opposite) return row('scope', boundWord(claim), boundWord(source), 'contradicted', 'opposite bound on the same value');
  if (claim.bound === 'exact' && (source.bound === 'max' || source.bound === 'min' || source.bound === 'approx')) {
    // "within 30 days" vs "for 30 days" describe the same window; "up to $500" vs "$500" does not.
    return durational
      ? row('scope', null, boundWord(source), 'ambiguous', 'source bounds the period; claim states it flat')
      : row('scope', null, boundWord(source), 'dropped', 'source bounds the value; claim states it flat');
  }
  return row('scope', boundWord(claim), boundWord(source), 'ambiguous', 'different bound on the same value');
}

function boundWord(q: Quantity): string {
  return q.bound === 'max' ? 'at most' : q.bound === 'min' ? 'at least' : q.bound === 'approx' ? 'about' : 'exactly';
}

function ratesAfter(text: string, end: number): string[] {
  const after = text.slice(end, end + 48).toLowerCase();
  const out: string[] = [];
  const re = /^\s*(?:\/\s*|per\s+|a\s+|an\s+|each\s+|every\s+)(month|mo|year|yr|annum|week|day|hour|user|seat|member|person|device|order|account|employee|transaction|transfer|bag|visit|night|license|unit|item|call|request)\b/;
  let rest = after;
  for (let i = 0; i < 2; i++) {
    const m = rest.match(re);
    if (!m) break;
    const map: Record<string, string> = { mo: 'month', yr: 'year', annum: 'year' };
    out.push(`per ${map[m[1]] ?? m[1]}`);
    rest = rest.slice(m[0].length);
  }
  if (!out.length && /^\s*(?:monthly|a month)\b/.test(after)) out.push('per month');
  if (!out.length && /^\s*(?:annually|yearly|a year)\b/.test(after)) out.push('per year');
  return out;
}
