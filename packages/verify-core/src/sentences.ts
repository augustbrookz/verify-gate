/**
 * Sentence and clause segmentation with original offsets.
 *
 * Qualifier comparison needs to know which words belong to the same fact as a
 * span. "Refunds take 30 days, and shipping is free for orders over $50": the
 * "$50" condition belongs to shipping, not to refunds. So context is the CLAUSE
 * group around a span, not the whole sentence and certainly not the passage.
 */

export interface TextRange {
  start: number;
  end: number;
  text: string;
}

const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'inc', 'ltd', 'co', 'corp', 'st', 'no', 'nos',
  'approx', 'est', 'dept', 'fig', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'u.s', 'u.k', 'a.m', 'p.m', 'min', 'max',
  'incl', 'excl', 'ref', 'vol', 'pp', 'ed', 'jr', 'sr', 'llc', 'plc',
]);

function isUpperStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Z0-9"'(\[“‘•*\-]/.test(ch);
}

/**
 * Whitespace for segmentation: \s plus the zero-width characters normalisation
 * removes (zero-width space, joiners, word joiner, BOM). ". \u200bThe" is a
 * sentence boundary like ". The" (1.3.0).
 */
const WS = /[\s\u200b\u200c\u200d\u2060\ufeff]/;
const SP = '[\\s\\u200b\\u200c\\u200d\\u2060\\ufeff]';

function trimRange(text: string, start: number, end: number): TextRange | null {
  while (start < end && WS.test(text[start])) start++;
  while (end > start && WS.test(text[end - 1])) end--;
  if (end <= start) return null;
  return { start, end, text: text.slice(start, end) };
}

/** The word immediately before position i (exclusive), lowercased, without its trailing dot. */
function wordBefore(text: string, i: number): string {
  let j = i - 1;
  while (j >= 0 && /[A-Za-z.]/.test(text[j])) j--;
  return text.slice(j + 1, i).toLowerCase().replace(/\.$/, '');
}

export function splitSentences(text: string): TextRange[] {
  const out: TextRange[] = [];
  let start = 0;
  const push = (end: number) => {
    const r = trimRange(text, start, end);
    if (r) out.push(r);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      // Blank line, or a new list item, always ends the sentence.
      const rest = text.slice(i + 1);
      if (/^\s*\n/.test(rest) || /^\s*(?:[-*•]\s|\d+[.)]\s)/.test(rest)) {
        push(i);
        continue;
      }
      // A line ending without terminal punctuation followed by a capitalised
      // line is a heading or list line, not a run-on sentence.
      const before = text.slice(start, i).trim();
      if (before && !/[.!?:;,]$/.test(before) && /^\s*[A-Z]/.test(rest)) {
        push(i);
      }
      continue;
    }
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    // Decimal or version number: 3.5, v2.1
    if (ch === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
    // Ellipsis inside a sentence.
    if (ch === '.' && text[i + 1] === '.') continue;
    let j = i + 1;
    while (j < text.length && /["')\]”’]/.test(text[j])) j++;
    if (j < text.length && !WS.test(text[j])) continue;
    let k = j;
    while (k < text.length && WS.test(text[k])) k++;
    if (k < text.length && !isUpperStart(text[k])) continue;
    if (ch === '.') {
      const w = wordBefore(text, i);
      if (ABBREVIATIONS.has(w)) continue;
      // Single initial ("J. Smith").
      if (/^[a-z]$/.test(w) && /[A-Z]/.test(text[i - 1] ?? '')) continue;
    }
    push(j);
  }
  push(text.length);
  return out;
}

/** The sentence containing [start, end), extended to every sentence it overlaps. */
export function sentenceAround(text: string, start: number, end: number, sentences = splitSentences(text)): TextRange {
  const hit = sentences.filter((s) => s.end > start && s.start < end);
  if (hit.length === 0) return { start, end, text: text.slice(start, end) };
  const s = hit[0].start;
  const e = hit[hit.length - 1].end;
  return { start: s, end: e, text: text.slice(s, e) };
}

// Clause boundaries: a semicolon, or a comma followed by a coordinating
// conjunction that starts a new independent clause.
const CLAUSE_BREAK = new RegExp(`;${SP}+|,${SP}+(?:and|but|while|whereas|so|or|yet)${SP}+|${SP}+(?:-|—|–)${SP}+`, 'g');

export function splitClauses(sentence: TextRange): TextRange[] {
  const out: TextRange[] = [];
  let last = 0;
  const t = sentence.text;
  for (const m of t.matchAll(CLAUSE_BREAK)) {
    const idx = m.index ?? 0;
    const r = trimRange(t, last, idx);
    if (r) out.push({ start: sentence.start + r.start, end: sentence.start + r.end, text: r.text });
    last = idx + m[0].length;
  }
  const r = trimRange(t, last, t.length);
  if (r) out.push({ start: sentence.start + r.start, end: sentence.start + r.end, text: r.text });
  return out.length ? out : [sentence];
}

// A following sentence that limits the previous one ("This applies only to…").
const ATTACHING_NEXT =
  /^(?:this|these|that|the above|such|the offer|the discount|the benefit|the policy|the limit|the fee|the coverage|the credit|the refund)\b[^.]{0,40}\b(?:only|applies|apply|does not apply|do not apply|is limited|are limited|excludes?|is subject|are subject|expires?|ends?)\b|^(?:only|except|exceptions?|excluding|however|note|but)\b/i;

/** A clause that is an exception to the clause before it. */
const TRAILING_EXCEPTION_CLAUSE =
  /^(?:(?:[^\s,;:]+\s+){1,7}(?:are\s+|is\s+)?(?:excluded|not\s+included|not\s+eligible|ineligible)\b|(?:with\s+the\s+exception\s+of|other\s+than|except|excluding|(?:this|it|that)\s+(?:does|do)\s+not\s+apply\s+to|(?:does|do)\s+not\s+apply\s+to|not\s+applicable\s+to)\b)/i;

/**
 * The context a span's qualifiers are read from: the clause(s) the span sits
 * in, any leading conditional clause of the same sentence ("If you cancel
 * early, ..."), and a next sentence that explicitly limits this one.
 */
export function clauseContext(text: string, start: number, end: number): TextRange {
  const sentences = splitSentences(text);
  const sentence = sentenceAround(text, start, end, sentences);
  const clauses = splitClauses(sentence);
  const hit = clauses.filter((c) => c.end > start && c.start < end);
  let s = hit.length ? hit[0].start : start;
  let e = hit.length ? hit[hit.length - 1].end : end;
  // A leading subordinate clause scopes over the clause that follows it.
  const first = clauses[0];
  if (first && first.start < s && /^(?:if|when|unless|provided|for|only|after|before|during|within|once|as long as|except|subject to|upon|beginning|starting|effective|until|between|while|as of|from)\b/i.test(first.text)) {
    s = first.start;
  }
  // A span that stops on a dangling conjunction ("… as soon as possible, but") is cut
  // mid-thought: the clause after it belongs to the context.
  if (/\b(?:but|and|or|nor|yet|except|unless|provided)\s*$/i.test(text.slice(start, end))) {
    const next = clauses.find((c) => c.start >= e);
    if (next) e = next.end;
  }
  // A following clause of the same sentence that is an exception limits it too (rules 2.1.0):
  // "…within 30 days; clearance items are not eligible", "… — final-sale items excluded".
  const nextClause = clauses.find((c) => c.start >= e);
  if (nextClause && TRAILING_EXCEPTION_CLAUSE.test(nextClause.text)) e = nextClause.end;
  // Pull in a following sentence that limits this one.
  const idx = sentences.findIndex((x) => x.start >= sentence.end);
  if (idx >= 0 && ATTACHING_NEXT.test(sentences[idx].text)) e = sentences[idx].end;
  return { start: s, end: e, text: text.slice(s, e) };
}
