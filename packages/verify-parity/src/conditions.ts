/**
 * Condition phrases and the sentence-aligned diff, shared by source change
 * detection and Verify Gate's document change mode (which re-exports them).
 * Moved here unchanged from verify-policy's policy-change module.
 */
import { contentStems, coverage, extractQualifiers, normalize, splitSentences } from '@xyntherium/verify-core';
import { foldDrafting } from './canonical';

export const CONDITION_CLASSES = ['eligibility', 'deadline', 'exception', 'scope', 'modality', 'negation', 'quantity'] as const;
export type ConditionClass = (typeof CONDITION_CLASSES)[number];

export interface RequiredCondition {
  class: ConditionClass;
  text: string;
}

/** Normalised text for containment checks, with drafting conventions folded ("thirty (30)" is "30"). */
export const normText = (s: string) => normalize(foldDrafting(s)).toLowerCase().replace(/\s+/g, ' ').replace(/[.;,:]+$/, '').trim();
/** Whether `needle` occurs in `hay` once both are normalised. */
export const containsText = (hay: string, needle: string) => normText(hay).includes(normText(needle));
const norm = normText;
const MODAL_CONDITION = /^(?:may|must|shall|should|will|required|is required to|are required to|need to|needs to)$/i;

/** The class of a condition phrase, from what it says. */
export function conditionClass(phrase: string, hint?: string): ConditionClass {
  const p = phrase.trim().toLowerCase();
  if (/^(?:except|unless|other than|excluding|but not|save for|apart from)\b/.test(p)) return 'exception';
  if (hint === 'negation' || /^(?:not|no|never|non-)\b/.test(p)) return 'negation';
  if (hint === 'modality') return 'modality';
  if (hint === 'time_range' || hint === 'date' || /^(?:within|before|after|until|by|no later than|not later than)\b/.test(p)) return 'deadline';
  if (/^(?:when|once|as soon as)\b.*\b(?:period|days?|weeks?|months?|years?|date|ends?|expires?|renews?)\b/.test(p)) return 'deadline';
  if (/\bonly\b/.test(p) && !/\bonly if\b/.test(p)) return 'scope';
  if (/^(?:for|in|on|under)\s+(?:the\s+)?(?:[a-z]+\s+){0,3}(?:customers?|accounts?|plans?|members?|users?|residents?|regions?|countries|orders?)\b/.test(p)) return 'scope';
  if (hint === 'quantity') return 'quantity';
  return 'eligibility';
}

/** "only" on its own is not a condition: widen it to what it restricts ("annual plans only", "only on the Business plan"). */
function widenOnly(sentence: string, start: number): { text: string; start: number; end: number } | null {
  const paren = /\(([^()]{0,60}\bonly\b[^()]{0,40})\)/i.exec(sentence);
  if (paren && paren.index <= start && start <= paren.index + paren[0].length) return { text: paren[1].trim(), start: paren.index + 1, end: paren.index + 1 + paren[1].length };
  const before = /(?:[A-Za-z0-9'-]+\s){1,3}only$/i.exec(sentence.slice(0, start + 4));
  if (before && /^only\s*[).,;:]?\s*$/i.test(sentence.slice(start, start + 6))) return { text: before[0].trim(), start: start + 4 - before[0].length, end: start + 4 };
  const after = /^only\s+(?:(?:for|to|on|in|with|when)\s+)?(?:the\s+)?(?:[A-Za-z0-9'-]+\s?){1,4}/i.exec(sentence.slice(start));
  if (after) return { text: after[0].trim().replace(/[.,;:]$/, ''), start, end: start + after[0].length };
  return null;
}

/** The condition phrases of one sentence, each with its class. Deterministic. */
export function conditionPhrases(sentence: string): RequiredCondition[] {
  const raw: { cls: ConditionClass; text: string; start: number; end: number }[] = [];
  for (const q of extractQualifiers(sentence)) {
    if (q.type === 'entity') continue;
    if (q.type === 'modality' && !MODAL_CONDITION.test(q.text.trim())) continue;
    if (q.type === 'scope' && /^only$/i.test(q.text.trim())) {
      const w = widenOnly(sentence, q.start);
      if (w) raw.push({ cls: 'scope', ...w });
      continue;
    }
    if (q.type === 'scope' && !q.material) continue;
    if (q.type === 'time_range' && !/\d|\b(?:days?|weeks?|months?|years?|before|after|until|end of)\b/i.test(q.text)) continue;
    // A phrase ends with its sentence: the qualifier extractor can read past a full stop when
    // it is handed several sentences at once (a list item and the sentence after it).
    const cut = /\.\s+(?=[A-Z(])/.exec(q.text);
    const text = (cut ? q.text.slice(0, cut.index) : q.text).trim();
    raw.push({ cls: conditionClass(text, q.type), text, start: q.start, end: q.start + text.length });
  }
  // Period-relative deadlines the qualifier extractor leaves to context ("until the end of the
  // billing period", "when the trial ends").
  for (const m of sentence.matchAll(/\b(?:until|before|after|by|at)\s+the\s+(?:end|start|beginning)\s+of\s+(?:the\s+|your\s+|each\s+)?[a-z-]+(?:\s[a-z-]+){0,2}/gi)) raw.push({ cls: 'deadline', text: m[0].trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].trim().length });
  for (const m of sentence.matchAll(/\b(?:when|once)\s+(?:the|your)\s+[a-z-]+(?:\s[a-z-]+){0,2}\s+(?:ends|expires|renews|is renewed)\b/gi)) raw.push({ cls: 'deadline', text: m[0].trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].trim().length });
  // Keep the longest phrase where phrases overlap ("within 14 days of purchase" over "14 days").
  raw.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: typeof raw = [];
  for (const r of raw) if (!kept.some((k) => r.start < k.end && r.end > k.start)) kept.push(r);
  return kept.sort((a, b) => a.start - b.start).map((r) => ({ class: r.cls, text: r.text }));
}


export interface Hunk {
  before: string | null;
  after: string | null;
}

/** Changed, added and removed sentences between two versions of a text. */
export function sentenceDiff(before: string, after: string): Hunk[] {
  const a = splitSentences(before).map((s) => s.text.trim());
  const b = splitSentences(after).map((s) => s.text.trim());
  const na = a.map(norm);
  const nb = b.map(norm);
  // LCS over normalised sentences.
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hunks: Hunk[] = [];
  const flush = (olds: string[], news: string[]) => {
    // Pair a removed sentence with the added sentence most like it; the rest are pure adds / removes.
    const used = new Set<number>();
    for (const o of olds) {
      let best = -1;
      let score = 0.5;
      news.forEach((n, k) => {
        if (used.has(k)) return;
        const s = Math.min(coverage(contentStems(o), contentStems(n)), coverage(contentStems(n), contentStems(o)));
        if (s >= score) {
          score = s;
          best = k;
        }
      });
      if (best >= 0) {
        used.add(best);
        hunks.push({ before: o, after: news[best] });
      } else hunks.push({ before: o, after: null });
    }
    news.forEach((n, k) => {
      if (!used.has(k)) hunks.push({ before: null, after: n });
    });
  };
  let i = 0;
  let j = 0;
  let olds: string[] = [];
  let news: string[] = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) {
      flush(olds, news);
      olds = [];
      news = [];
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) news.push(b[j++]);
    else olds.push(a[i++]);
  }
  flush(olds, news);
  return hunks;
}

