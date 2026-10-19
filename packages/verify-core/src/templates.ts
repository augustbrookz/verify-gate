/**
 * Masked-template alignment: the code-only contradiction detector.
 *
 * Replace every number and date with a typed placeholder and drop negation
 * words, in both the claim and each source sentence. If the claim's token
 * stream then occurs contiguously in a source sentence, the two say the same
 * thing about the same subject except, possibly, for the masked parts — so a
 * different value or a flipped negation there is a contradiction, decided
 * without a model. Demanding a token-for-token match everywhere else is what
 * keeps this precise; anything looser goes to adjudication.
 */
import type { SourceInput } from './contract';
import { compareDates, compareQuantities, extractDates, extractQuantities, type DateValue, type Quantity } from './numbers';
import { splitSentences } from './sentences';

interface Token {
  kind: 'word' | 'value' | 'modal';
  key: string;
  start: number;
  end: number;
  quantity?: Quantity;
  date?: DateValue;
  modal?: ModalClass;
  raw?: string;
}

/**
 * Modal verbs are masked like values, so "Refunds may take 10 days" aligns with
 * "Refunds will take 10 days" and the difference is compared, not hidden.
 */
export type ModalClass = 'possibility' | 'certainty' | 'obligation' | 'recommendation' | 'conditional';
const MODALS: Record<string, ModalClass> = {
  may: 'possibility', might: 'possibility', can: 'possibility', could: 'possibility',
  will: 'certainty', shall: 'obligation', must: 'obligation', should: 'recommendation', would: 'conditional',
};

/**
 * The only modal shifts code decides: the claim makes firmer what the source
 * leaves open. "may" → "will"/"must"/"shall", and "should" → "must"/"shall".
 * Every other difference (a firmer source, a softer claim) stays undecided.
 */
export function modalOverstates(source: ModalClass, claim: ModalClass): boolean {
  if (source === 'possibility') return claim === 'certainty' || claim === 'obligation';
  if (source === 'recommendation') return claim === 'obligation';
  return false;
}

const NEGATION_WORDS = new Set([
  'not', 'never', 'no', 'cannot', "can't", "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't",
  "weren't", "shouldn't", "mustn't", "hasn't", "haven't", "hadn't", "couldn't", "wouldn't",
]);
// Contractions whose positive form should align with the negated form.
const CONTRACTION_BASE: Record<string, string> = {
  "can't": 'can', cannot: 'can', "won't": 'will', "don't": 'do', "doesn't": 'does', "didn't": 'did',
  "isn't": 'is', "aren't": 'are', "wasn't": 'was', "weren't": 'were', "shouldn't": 'should',
  "mustn't": 'must', "hasn't": 'has', "haven't": 'have', "hadn't": 'had', "couldn't": 'could', "wouldn't": 'would',
};
// Auxiliaries that only appear to carry the negation ("does not include" ~ "includes").
const DO_SUPPORT = new Set(['do', 'does', 'did']);

interface Tokenised {
  tokens: Token[];
  negations: number[]; // original offsets of negation words
}

function tokenise(text: string): Tokenised {
  const dates = extractDates(text);
  const quantities = extractQuantities(text, dates).filter((q) => q.bound !== 'range_high');
  const values: Token[] = [
    ...dates.map((d) => ({ kind: 'value' as const, key: '#date', start: d.start, end: d.end, date: d })),
    ...quantities.map((q) => ({ kind: 'value' as const, key: `#${q.dimension}:${q.unit ?? ''}`, start: q.start, end: q.end, quantity: q })),
  ].sort((a, b) => a.start - b.start);
  const tokens: Token[] = [];
  const negations: number[] = [];
  let vi = 0;
  const wordRe = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;
  for (const m of text.matchAll(wordRe)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    while (vi < values.length && values[vi].end <= start) {
      tokens.push(values[vi]);
      vi++;
    }
    if (vi < values.length && start < values[vi].end && end > values[vi].start) continue; // inside a value
    let w = m[0].toLowerCase().replace('’', "'");
    if (w === 'non' && text[end] === '-') {
      negations.push(start);
      continue;
    }
    if (NEGATION_WORDS.has(w)) {
      negations.push(start);
      if (CONTRACTION_BASE[w]) {
        w = CONTRACTION_BASE[w];
      } else {
        continue;
      }
    }
    if (MODALS[w]) {
      tokens.push({ kind: 'modal', key: '#modal', start, end, modal: MODALS[w], raw: m[0] });
      continue;
    }
    tokens.push({ kind: 'word', key: w, start, end });
  }
  while (vi < values.length) tokens.push(values[vi++]);
  // Drop do-support so "does not include" aligns with "includes".
  const filtered = tokens.filter((t, i) => !(t.kind === 'word' && DO_SUPPORT.has(t.key) && tokens[i + 1]?.kind === 'word'));
  return { tokens: filtered.map((t) => (t.kind === 'word' ? { ...t, key: lightStem(t.key) } : t)), negations };
}

function lightStem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export interface TemplateConflict {
  source_id: string;
  start: number;
  end: number;
  kind: 'number' | 'date' | 'negation' | 'modality';
  detail: string;
  /** For modality: the modal words on each side. */
  claim_text?: string;
  source_text?: string;
}

export interface TemplateMatch {
  source_id: string;
  start: number;
  end: number;
  conflicts: TemplateConflict[];
  /** The modal verbs differ in a way code does not decide: not support, not a conflict. */
  modal_mismatch?: boolean;
}

/**
 * Find source sentences that match the claim token-for-token outside the
 * masked values and negations. Returns each match with any conflicts.
 */
export function templateMatches(claim: string, sources: SourceInput[], minTokens = 5): TemplateMatch[] {
  const c = tokenise(claim.replace(/\[[^\]]*\]/g, ''));
  if (c.tokens.length < minTokens) return [];
  const keys = c.tokens.map((t) => t.key);
  const out: TemplateMatch[] = [];
  for (const source of sources) {
    for (const sentence of splitSentences(source.text)) {
      const s = tokenise(sentence.text);
      const sk = s.tokens.map((t) => t.key);
      for (let i = 0; i + keys.length <= sk.length; i++) {
        let ok = true;
        for (let j = 0; j < keys.length; j++) {
          if (sk[i + j] !== keys[j]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const window = s.tokens.slice(i, i + keys.length);
        const start = sentence.start + window[0].start;
        const end = sentence.start + window[window.length - 1].end;
        const conflicts: TemplateConflict[] = [];
        let modalMismatch = false;
        window.forEach((st, j) => {
          const ct = c.tokens[j];
          if (st.kind === 'modal' && ct.kind === 'modal' && st.modal !== ct.modal) {
            if (modalOverstates(st.modal!, ct.modal!)) {
              conflicts.push({ source_id: source.id, start, end, kind: 'modality', detail: `claim says "${ct.raw}", source says "${st.raw}"`, claim_text: ct.raw, source_text: st.raw });
            } else modalMismatch = true;
            return;
          }
          if (st.kind !== 'value') return;
          if (st.quantity && ct.quantity && compareQuantities(ct.quantity, st.quantity) === 'conflict') {
            conflicts.push({ source_id: source.id, start, end, kind: 'number', detail: `claim says ${ct.quantity.raw.trim()}, source says ${st.quantity.raw.trim()}` });
          }
          if (st.date && ct.date && compareDates(ct.date, st.date) === 'conflict') {
            conflicts.push({ source_id: source.id, start, end, kind: 'date', detail: `claim says ${ct.date.raw}, source says ${st.date.raw}` });
          }
        });
        // Negations inside the matched window, or immediately before it in the same sentence.
        const windowStart = window[0].start;
        const windowEnd = window[window.length - 1].end;
        const srcNeg = s.negations.filter((o) => o >= Math.max(0, windowStart - 12) && o < windowEnd).length;
        const claimNeg = c.negations.length;
        if (srcNeg % 2 !== claimNeg % 2) {
          conflicts.push({ source_id: source.id, start, end, kind: 'negation', detail: claimNeg % 2 ? 'claim is negated, source is not' : 'source is negated, claim is not' });
        }
        out.push({ source_id: source.id, start, end, conflicts, ...(modalMismatch ? { modal_mismatch: true } : {}) });
      }
    }
  }
  return out;
}
