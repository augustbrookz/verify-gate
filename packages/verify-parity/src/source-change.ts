/**
 * Use 1, source change detection: two versions of a source document, a real
 * change or a cosmetic one, and the changed conditions named.
 *
 * Each sentence is captured as a `source-sentence@1` snapshot:
 *   exact      conditions (class and wording, extracted in code), amounts and
 *              durations, dates, the number of negations, modal classes
 *              ("shall" and "must" are the same obligation), citations
 *   tolerance  the sentence text with formatting removed
 *   excluded   the paragraph designator ("(a)", "(2)(ii)") and the position
 * Sentences are aligned across the versions (equal formatting-free text first;
 * a sentence split or joined differently is matched as a whole; the rest are
 * paired by word overlap). A pair is cosmetic when every exact field is equal
 * and the text is within tolerance; otherwise it is a real change, and each
 * differing exact field is named (condition added / removed / changed, value,
 * date, negation, modality, citation), or the wording when only the text
 * moved. An added or removed sentence is a real change.
 *
 * Pure and deterministic: the capture time is a parameter.
 */
import { negationCount, sha256Hex, splitSentences } from '@xyntherium/verify-core';
import { citationMatches, dateValues, DESIGNATOR, foldDrafting, modalsOf, quantityValues, stripDesignator, toleranceText, toleranceTokens, tokenSimilarity, type FoundValue } from './canonical';
import { conditionPhrases, type ConditionClass } from './conditions';
import { captureSnapshot, compareSnapshots, type FieldComparison, type ParitySchema, type Snapshot } from './snapshot';

export const SOURCE_SENTENCE_SCHEMA: ParitySchema = {
  id: 'source-sentence',
  version: '1',
  fields: [
    { name: 'conditions', mode: 'exact', kind: 'condition' },
    { name: 'quantities', mode: 'exact' },
    { name: 'dates', mode: 'exact' },
    { name: 'negations', mode: 'exact', kind: 'number' },
    { name: 'modality', mode: 'exact' },
    { name: 'citations', mode: 'exact' },
    { name: 'text', mode: 'tolerance' },
    { name: 'designator', mode: 'excluded' },
    { name: 'position', mode: 'excluded' },
  ],
};

export const SOURCE_DOCUMENT_SCHEMA: ParitySchema = {
  id: 'source-document',
  version: '1',
  fields: [
    { name: 'sentences', mode: 'exact' },
    { name: 'source_id', mode: 'excluded' },
    { name: 'retrieved_at', mode: 'excluded' },
  ],
};

export type ChangeType =
  | 'condition_added'
  | 'condition_removed'
  | 'condition_changed'
  | 'value_changed'
  | 'date_changed'
  | 'negation_changed'
  | 'modality_changed'
  | 'citation_changed'
  | 'wording_changed'
  | 'sentence_added'
  | 'sentence_removed';

export interface NamedChange {
  type: ChangeType;
  /** The condition class, when the change is to a condition (deadline, scope, …). */
  class: ConditionClass | null;
  before: string | null;
  after: string | null;
}

export interface SentenceChange {
  status: 'cosmetic' | 'real' | 'added' | 'removed';
  before: string | null;
  after: string | null;
  before_parity_sha256: string | null;
  after_parity_sha256: string | null;
  changes: NamedChange[];
}

export interface SourceChange {
  kind: 'none' | 'cosmetic' | 'real';
  before_parity_sha256: string;
  after_parity_sha256: string;
  /** SHA-256 of the raw texts: differs even for a cosmetic edit. */
  before_text_sha256: string;
  after_text_sha256: string;
  counts: { unchanged: number; cosmetic: number; real: number; added: number; removed: number };
  /** Every sentence that is not byte-identical (cosmetic ones included). */
  sentences: SentenceChange[];
  /** The real changes, flattened. */
  changes: NamedChange[];
}

interface Sent {
  raw: string;
  tokens: string[];
  tol: string;
  conds: { canon: string; class: ConditionClass; text: string }[];
  quantities: FoundValue[];
  dates: FoundValue[];
  citations: FoundValue[];
  /** Modal classes, sorted. */
  modals: string[];
  snap: Snapshot;
}

// Up to the next comma, semicolon, colon or full stop ("§ 273.1(d)" does not end it).
const EXCEPTION = /\b(?:unless|except|other than|excluding|provided,? (?:however,? )?that)\b(?:[^,;:.]|\.(?=\S))*/gi;

/** Exception phrases, each up to the next comma, semicolon, colon or full stop. */
function exceptionPhrases(text: string): string[] {
  return [...text.matchAll(EXCEPTION)].map((m) => m[0].trim()).filter((p) => p.split(' ').length >= 3);
}

/** The drafting form exact fields are read from. */
function exactForm(s: string): string {
  return foldDrafting(s)
    .replace(/\s+/g, ' ')
    .replace(/\bshall\b/g, 'must')
    .replace(/\bShall\b/g, 'Must')
    .replace(/\b[Ss]ections\s+(?=\d)/g, '§§ ')
    .replace(/\b[Ss]ection\s+(?=\d)/g, '§ ')
    .trim();
}

function sentence(raw: string, position: number, captured_at: string): Sent {
  const { designator, text: rawText } = stripDesignator(raw.trim());
  // Exact fields are read from the text in one drafting form (spelled number + numeral,
  // hyphenation, dashes, line breaks and runs of spaces folded; "shall" read as "must" and
  // "section 12" as "§ 12", the same obligation and the same citation), so a cosmetic edit
  // cannot move them. Condition wording is reported in that form.
  const text = exactForm(rawText);
  const found = conditionPhrases(text).filter((c) => c.class !== 'modality' && c.class !== 'negation');
  // Exceptions the phrase extractor leaves inside a longer phrase or misses ("unless and until …").
  for (const e of exceptionPhrases(text)) if (!found.some((c) => c.class === 'exception' && (c.text.includes(e) || e.includes(c.text)))) found.push({ class: 'exception', text: e });
  const conds = found.map((c) => ({ canon: `${c.class}:${toleranceText(c.text)}`, class: c.class, text: c.text }));
  // Section numbers are citations, not amounts: quantities are read with citations blanked.
  const cites = citationMatches(text);
  const uncited = cites.reduceRight((t, m) => t.slice(0, m.start) + ' '.repeat(m.end - m.start) + t.slice(m.end), text);
  const quantities = quantityValues(uncited);
  const dates = dateValues(text);
  const citations = cites.map((m) => ({ canon: m.canon, raw: text.slice(m.start, m.end) }));
  const modals = modalsOf(text);
  const sorted = (vs: FoundValue[]) => vs.map((v) => v.canon).sort();
  const snap = captureSnapshot(
    SOURCE_SENTENCE_SCHEMA,
    {
      conditions: conds.map((c) => `${c.class}:${c.text}`),
      quantities: sorted(quantities),
      dates: sorted(dates),
      negations: negationCount(text),
      modality: modals,
      citations: sorted(citations),
      text,
      designator,
      position,
    },
    { captured_at },
  );
  const tokens = toleranceTokens(text);
  return { raw: raw.trim(), tokens, tol: tokens.join(' '), conds, quantities, dates, citations, modals, snap };
}

// A list item starts after ";", ":" or a dash (and a closing "and" / "or") at its designator:
// "include: (i) …; (ii) …; and (iii) …". Split there, wherever the lines break.
const LIST_ITEM = new RegExp(`(?<=(?:[;:\\u2013\\u2014]|--|\\s-)(?:\\s+(?:and|or))?)\\s*(?=${DESIGNATOR}(?:\\s|$))`);

/**
 * A line break inside a sentence is a soft wrap and is read as a space, so where the lines
 * break cannot split a sentence. A break is kept after sentence or list punctuation, at a
 * blank line, after a heading and before a bullet, heading, numbered item or table row.
 */
function unwrap(text: string): string {
  const lines = text.split(/\r?\n/);
  let out = lines[0] ?? '';
  for (let k = 1; k < lines.length; k++) {
    const prev = lines[k - 1].trim();
    const next = lines[k].trim();
    const soft = prev !== '' && next !== '' && !/^#/.test(prev) && !/[.;:!?\u2014]["”'’)]*$/.test(prev) && !/^(?:[-*+•](?!-)\s|[#>|]|\d{1,3}[.)]\s)/.test(next);
    out += soft ? ` ${lines[k].replace(/^[ \t]+/, '')}` : `\n${lines[k]}`;
  }
  return out;
}

function sentencesOf(text: string, captured_at: string): Sent[] {
  // Sentences, and list items within them. A piece with no words (a paragraph designator a
  // line break left on its own, "(b)") is carried into the next one, so where a line breaks
  // cannot move a designator.
  const out: string[] = [];
  let carry = '';
  for (const s of splitSentences(unwrap(text)).flatMap((x) => x.text.split(LIST_ITEM))) {
    if (!toleranceTokens(stripDesignator(s).text).length) carry += `${s.trim()} `;
    else {
      out.push(carry + s);
      carry = '';
    }
  }
  return out.map((s, i) => sentence(s, i, captured_at));
}

/** What is in `a` and not in `b` (gone) and the reverse (came), counting repeats. */
function difference<T extends { canon: string }>(a: T[], b: T[]): { gone: T[]; came: T[] } {
  const came = [...b];
  const gone: T[] = [];
  for (const x of a) {
    const k = came.findIndex((y) => y.canon === x.canon);
    if (k >= 0) came.splice(k, 1);
    else gone.push(x);
  }
  return { gone, came };
}

const words = (vs: FoundValue[]) => (vs.length ? vs.map((v) => v.raw).join('; ') : null);

function named(a: Sent, b: Sent, fields: FieldComparison[]): NamedChange[] {
  const out: NamedChange[] = [];
  const changed = new Set(fields.filter((f) => f.status === 'changed').map((f) => f.field));
  if (changed.has('conditions')) {
    const { gone, came } = difference(a.conds, b.conds);
    const used = new Set<number>();
    for (const c of gone) {
      const k = came.findIndex((d, i) => !used.has(i) && d.class === c.class);
      if (k >= 0) {
        used.add(k);
        out.push({ type: 'condition_changed', class: c.class, before: c.text, after: came[k].text });
      } else out.push({ type: 'condition_removed', class: c.class, before: c.text, after: null });
    }
    came.forEach((d, i) => {
      if (!used.has(i)) out.push({ type: 'condition_added', class: d.class, before: null, after: d.text });
    });
  }
  // A value already named inside a changed condition is not named again.
  const inConditions = out.map((c) => `${c.before ?? ''} ${c.after ?? ''}`).join(' ');
  const values = (type: 'value_changed' | 'date_changed', cls: ConditionClass, x: FoundValue[], y: FoundValue[]) => {
    const { gone, came } = difference(x, y);
    if (!gone.length && !came.length) return;
    if ([...gone, ...came].every((v) => inConditions.includes(v.raw))) return;
    out.push({ type, class: cls, before: words(gone), after: words(came) });
  };
  if (changed.has('quantities')) values('value_changed', 'quantity', a.quantities, b.quantities);
  if (changed.has('dates')) values('date_changed', 'deadline', a.dates, b.dates);
  const field = (n: string) => fields.find((f) => f.field === n);
  if (changed.has('negations')) out.push({ type: 'negation_changed', class: 'negation', before: String(field('negations')?.before ?? 0), after: String(field('negations')?.after ?? 0) });
  if (changed.has('modality')) {
    const { gone, came } = difference(
      a.modals.map((m) => ({ canon: m, raw: m })),
      b.modals.map((m) => ({ canon: m, raw: m })),
    );
    out.push({ type: 'modality_changed', class: 'modality', before: words(gone), after: words(came) });
  }
  if (changed.has('citations')) {
    const { gone, came } = difference(a.citations, b.citations);
    out.push({ type: 'citation_changed', class: null, before: words(gone), after: words(came) });
  }
  if (!out.length && changed.has('text')) out.push({ type: 'wording_changed', class: null, before: a.raw, after: b.raw });
  return out;
}

function compare(a: Sent, b: Sent): SentenceChange | null {
  const cmp = compareSnapshots(a.snap, b.snap, SOURCE_SENTENCE_SCHEMA);
  if (cmp.status === 'identical' && a.raw === b.raw) return null;
  const real = cmp.status === 'different';
  return { status: real ? 'real' : 'cosmetic', before: a.raw, after: b.raw, before_parity_sha256: a.snap.parity_sha256, after_parity_sha256: b.snap.parity_sha256, changes: real ? named(a, b, cmp.fields) : [] };
}

function addedOrRemoved(s: Sent, side: 'added' | 'removed'): SentenceChange {
  const changes: NamedChange[] = s.conds.map((c) => (side === 'added' ? { type: 'condition_added' as const, class: c.class, before: null, after: c.text } : { type: 'condition_removed' as const, class: c.class, before: c.text, after: null }));
  if (!changes.length) changes.push(side === 'added' ? { type: 'sentence_added', class: null, before: null, after: s.raw } : { type: 'sentence_removed', class: null, before: s.raw, after: null });
  return { status: side, before: side === 'removed' ? s.raw : null, after: side === 'added' ? s.raw : null, before_parity_sha256: side === 'removed' ? s.snap.parity_sha256 : null, after_parity_sha256: side === 'added' ? s.snap.parity_sha256 : null, changes };
}

/** Sentences compared as one (split differently): designators are layout, so only the first is kept. */
function joined(ss: Sent[], captured_at: string): Sent {
  return sentence([ss[0].raw, ...ss.slice(1).map((s) => stripDesignator(s.raw).text)].join(' '), -1, captured_at);
}

export function detectSourceChange(input: { before: string; after: string; captured_at: string; include_text?: boolean }): SourceChange {
  const at = input.captured_at;
  const A = sentencesOf(input.before, at);
  const B = sentencesOf(input.after, at);
  // LCS over formatting-free sentence text.
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i].tol === B[j].tol ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: SentenceChange[] = [];
  let unchanged = 0;
  const flush = (olds: Sent[], news: Sent[]) => {
    if (!olds.length && !news.length) return;
    const doneOld = new Set<number>();
    const doneNew = new Set<number>();
    const pairUp = (x: Sent, y: Sent) => {
      const c = compare(x, y);
      if (c) out.push(c);
      else unchanged++;
    };
    // The same words split into sentences differently (a full stop made a semicolon, a
    // heading run into its first sentence): runs of up to three sentences on each side with
    // the same formatting-free text are compared as a whole.
    const run = (ss: Sent[], from: number, n: number, done: Set<number>) => {
      const r = ss.slice(from, from + n);
      return r.length === n && r.every((_, k) => !done.has(from + k)) ? r : null;
    };
    for (let p = 0; p < olds.length; p++)
      for (let q = 0; q < news.length; q++)
        for (let n = 1; n <= 3; n++)
          for (let m = 1; m <= 3; m++) {
            if (n === 1 && m === 1) continue;
            const x = run(olds, p, n, doneOld);
            const y = run(news, q, m, doneNew);
            if (!x || !y || x.map((s) => s.tol).join(' ') !== y.map((s) => s.tol).join(' ')) continue;
            x.forEach((_, k) => doneOld.add(p + k));
            y.forEach((_, k) => doneNew.add(q + k));
            pairUp(joined(x, at), joined(y, at));
          }
    // The rest: each earlier sentence with the later one it shares most words with.
    olds.forEach((o, p) => {
      if (doneOld.has(p)) return;
      let best = -1;
      let score = 0.5;
      news.forEach((n, k) => {
        if (doneNew.has(k)) return;
        const s = tokenSimilarity(o.tokens, n.tokens);
        if (s >= score) {
          score = s;
          best = k;
        }
      });
      if (best >= 0) {
        doneNew.add(best);
        pairUp(o, news[best]);
      } else out.push(addedOrRemoved(o, 'removed'));
    });
    news.forEach((n, k) => {
      if (!doneNew.has(k)) out.push(addedOrRemoved(n, 'added'));
    });
  };
  let i = 0;
  let j = 0;
  let olds: Sent[] = [];
  let news: Sent[] = [];
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i].tol === B[j].tol) {
      flush(olds, news);
      olds = [];
      news = [];
      const c = compare(A[i], B[j]);
      if (c) out.push(c);
      else unchanged++;
      i++;
      j++;
    } else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) news.push(B[j++]);
    else olds.push(A[i++]);
  }
  flush(olds, news);

  const doc = (ss: Sent[], text: string) => ({ parity: captureSnapshot(SOURCE_DOCUMENT_SCHEMA, { sentences: ss.map((s) => s.snap.parity_sha256), source_id: null, retrieved_at: null }, { captured_at: at }).parity_sha256, text: sha256Hex(text) });
  const before = doc(A, input.before);
  const after = doc(B, input.after);
  const counts = {
    unchanged,
    cosmetic: out.filter((s) => s.status === 'cosmetic').length,
    real: out.filter((s) => s.status === 'real').length,
    added: out.filter((s) => s.status === 'added').length,
    removed: out.filter((s) => s.status === 'removed').length,
  };
  const kind: SourceChange['kind'] = counts.real + counts.added + counts.removed > 0 ? 'real' : counts.cosmetic > 0 || before.text !== after.text ? 'cosmetic' : 'none';
  const strip = (s: SentenceChange): SentenceChange => (input.include_text ? s : { ...s, before: null, after: null, changes: s.changes.map((c) => ({ ...c, before: null, after: null })) });
  const sentences = out.map(strip);
  return {
    kind,
    before_parity_sha256: before.parity,
    after_parity_sha256: after.parity,
    before_text_sha256: before.text,
    after_text_sha256: after.text,
    counts,
    sentences,
    changes: sentences.filter((s) => s.status !== 'cosmetic').flatMap((s) => s.changes),
  };
}

/** A document's parity hash: equal for two versions that differ only cosmetically in formatting. */
export function documentParityHash(text: string, captured_at: string): string {
  return captureSnapshot(SOURCE_DOCUMENT_SCHEMA, { sentences: sentencesOf(text, captured_at).map((s) => s.snap.parity_sha256), source_id: null, retrieved_at: null }, { captured_at }).parity_sha256;
}
