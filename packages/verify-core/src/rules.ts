/**
 * The verdict rules. Every verdict Verify returns is produced here, with the
 * id of the rule that produced it.
 *
 *   supported     a code-verified span supports the claim AND every material
 *                 qualifier is preserved by the source context
 *   contradicted  a code-verified span conflicts with the claim (number, date,
 *                 entity, negation, condition)
 *   unsupported   no adequate support, INCLUDING support that only exists once
 *                 a material qualifier is dropped (failure_reason qualifier_loss)
 *   unverifiable  the passages cannot resolve the claim under these rules
 *
 * Code-only rules run first (decideByCode). A model's adjudication is then a
 * PROPOSAL (decideWithModel): its quotes must be located in the source by
 * spans.ts, its qualifiers are compared by qualifiers.ts, its arithmetic is
 * recomputed by checks.ts. A model can never produce "supported" without a
 * located span, and model agreement is never itself a verdict.
 */
import type {
  DeterministicCheck,
  FailureReason,
  Provenance,
  QualifierRow,
  QualifierType,
  ResolvedBy,
  SourceInput,
  Span,
  Verdict,
} from './contract';
import { claimArithmetic, claimComputation, dateMath, governingSource, recomputeArithmetic, sourceRecency, type Operation } from './checks';
import { EXTERNAL_COMPARATIVE, OUT_OF_SCOPE } from './claims';
import { sha256Hex } from './hash';
import { compareQuantities, extractQuantities } from './numbers';
import { compareQualifiers, extractQualifiers, negationCount, type ProposedQualifier, type QualifierComparison } from './qualifiers';
import { clauseContext } from './sentences';
import { normalize } from './normalize';
import { locateQuote } from './spans';
import { templateMatches } from './templates';
import { contentStems, coverage } from './text';

export interface HashedSource extends SourceInput {
  hash: string;
}

export function hashSources(sources: SourceInput[]): HashedSource[] {
  return sources.map((s) => ({ ...s, hash: sha256Hex(s.text) }));
}

export interface Decision {
  verdict: Verdict;
  failure_reason: FailureReason | null;
  rule_id: string;
  resolved_by: ResolvedBy;
  spans: Span[];
  context: Provenance['context'];
  qualifiers: QualifierRow[];
  checks: DeterministicCheck[];
  discarded_quotes: number;
  /** Internal score used for calibration binning. Not a probability. */
  internal_score: number;
  /** Set when a stronger adjudicator should look before this is final. */
  escalate?: string;
}

export type Tier = 'fast' | 'strong';

export interface Adjudication {
  verdict: Verdict;
  reason: string;
  evidence: { source_id: string; quote: string; role: 'supports' | 'conflicts' | 'qualifies' }[];
  source_qualifiers: { type: QualifierType; text: string; source_id: string }[];
  conflict_type: 'none' | 'number' | 'date' | 'entity' | 'negation' | 'condition' | 'scope' | 'superseded';
  unverifiable_reason: 'none' | 'comparative' | 'out_of_scope' | 'conflicting_sources' | 'other';
  arithmetic: { operation: Operation; operands: number[]; result: number } | null;
}

function stripMarkers(claim: string): string {
  return claim.replace(/\s*\[[^\]]*\]/g, '').trim();
}

function asSpan(source: HashedSource, start: number, end: number, role: Span['role'], match: Span['match_type'] = 'exact', distance = 0): Span {
  return { source_id: source.id, start, end, quote: source.text.slice(start, end), match_type: match, edit_distance: distance, role, source_hash: source.hash };
}

function contextOf(source: HashedSource, span: { start: number; end: number }) {
  const c = clauseContext(source.text, span.start, span.end);
  return { source_id: source.id, start: c.start, end: c.end, text: c.text };
}

const VALUE_TYPES = new Set<QualifierType>(['quantity', 'date']);
/** Words that say a figure in the claim is computed from others (see finishSupport). */
const closeTo = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);
const DERIVATION_CUE = /\b(?:total|totals|totaling|totalling|combined|altogether|in all|sum|difference|more|fewer|less|so|therefore|which (?:brings|makes|means|comes)|works out|comes to|adds up)\b/i;

function isValueRow(r: QualifierRow): boolean {
  return VALUE_TYPES.has(r.type) || (r.type === 'scope' && /bound|rate/.test(r.note)) || /value inside/.test(r.note);
}

// ---------------------------------------------------------------------------
// Code facts: everything code can establish about a claim before any model.
// ---------------------------------------------------------------------------

export interface CodeFacts {
  whole: { source: HashedSource; start: number; end: number; match: Span['match_type']; distance: number } | null;
  templateConflicts: Array<{ source: HashedSource; start: number; end: number; kind: 'number' | 'date' | 'negation' | 'modality'; detail: string; claim_text?: string; source_text?: string }>;
  templateSupports: Array<{ source: HashedSource; start: number; end: number }>;
  arithmetic: DeterministicCheck | null;
  comparative: boolean;
  outOfScope: boolean;
  /** Best clause coverage of the claim's content words, 0..1. */
  bestCoverage: number;
}

export function codeFacts(claimRaw: string, sources: HashedSource[]): CodeFacts {
  const claim = stripMarkers(claimRaw);
  const bare = claim.replace(/[.!]+$/, '');
  let whole: CodeFacts['whole'] = null;
  for (const s of sources) {
    const r = locateQuote(s.text, bare);
    if (r.ok) {
      whole = { source: s, start: r.span.start, end: r.span.end, match: r.span.match_type, distance: r.span.edit_distance };
      break;
    }
  }
  const templateConflicts: CodeFacts['templateConflicts'] = [];
  const templateSupports: CodeFacts['templateSupports'] = [];
  for (const m of templateMatches(claim, sources)) {
    const source = sources.find((s) => s.id === m.source_id)!;
    // A modal difference code does not decide is neither support nor a conflict.
    if (m.conflicts.length === 0 && !m.modal_mismatch) templateSupports.push({ source, start: m.start, end: m.end });
    for (const c of m.conflicts) templateConflicts.push({ source, start: c.start, end: c.end, kind: c.kind, detail: c.detail, claim_text: c.claim_text, source_text: c.source_text });
  }
  // A value or negation conflict outranks a modality one on the same claim.
  templateConflicts.sort((a, b) => Number(a.kind === 'modality') - Number(b.kind === 'modality'));
  const allText = sources.map((s) => s.text).join('\n').toLowerCase();
  const comp = claim.match(EXTERNAL_COMPARATIVE);
  const oos = claim.match(OUT_OF_SCOPE);
  const stems = contentStems(claim);
  let bestCoverage = 0;
  for (const s of sources) {
    for (const piece of s.text.split(/(?<=[.!?;])\s+/)) {
      bestCoverage = Math.max(bestCoverage, coverage(stems, piece));
    }
  }
  return {
    whole,
    templateConflicts,
    templateSupports,
    arithmetic: claimArithmetic(claim),
    comparative: !!comp && !allText.includes(comp[0].toLowerCase()),
    outOfScope: !!oos && !allText.includes(oos[0].toLowerCase()),
    bestCoverage,
  };
}

// ---------------------------------------------------------------------------
// Code-only decisions
// ---------------------------------------------------------------------------

// A continuation straight after the span ("... customers in Canada").
const QUALIFIER_LEAD =
  /^\s*(?:in|for|on|only|if|when|whenever|unless|provided|providing|except|excluding|until|after|before|within|during|between|from|by|as long as|so long as|subject to|while|where|once|without|with|starting|beginning|effective|through|up to|at least|no later than|not later than|in no event later than|no earlier than|not earlier than|prior to|following|in any event|per)\b/i;
// After a comma only conditions and exceptions qualify; ", after which ..." or
// ", which ..." usually starts a separate statement.
const COMMA_QUALIFIER_LEAD =
  /^\s*[,;]\s*(?:provided|providing|unless|except|excluding|only|as long as|so long as|subject to|if|but only|on condition)\b/i;
// A deadline or time window after a comma limits the clause too ("…, as applicable, within 2 billing cycles"),
// but only when it names a time: ", before which …" or ", by the way" do not.
const COMMA_TIME_LEAD = /^\s*[,;]\s*(?:within|no later than|not later than|in no event later than|no earlier than|not earlier than|prior to|before|until|by)\b/i;
const TEMPORAL_WORD =
  /\d|\b(?:days?|weeks?|months?|years?|hours?|minutes?|business|calendar|billing cycles?|date|time|deadline|period|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const NON_QUALIFIER_STEMS = new Set(['available', 'to', 'eligible', 'apply', 'applies', 'only', 'for', 'in', 'on', 'with', 'who', 'that']);
/** An explicit exception (rules 2.1.0): in a following sentence that limits this one, it is a dropped condition, not a maybe. */
const EXPLICIT_EXCEPTION = /\b(?:except|excluding|excludes?|excluded|other\s+than|with\s+the\s+exception\s+of|(?:does|do)\s+not\s+apply\s+to|doesn't\s+apply\s+to|not\s+applicable\s+to|not\s+included|not\s+eligible|ineligible)\b/i;

/**
 * Qualifier comparison for a claim that IS a span of the source. Being
 * verbatim guarantees the claim contains exactly the span's text, so:
 *   - a material condition / time window / scope lying wholly or partly
 *     outside the span is not in the claim: dropped;
 *   - the rest of the clause after the span, when it opens like a qualifier
 *     ("in Canada and the UK", "for annual plans", "only if ..."), is dropped;
 *   - everything inside the span is preserved.
 */
function verbatimQualifiers(claim: string, ctx: { start: number; end: number; text: string }, span: { start: number; end: number }): QualifierComparison {
  const base = compareQualifiers(claim, ctx.text);
  const s0 = span.start - ctx.start;
  const s1 = span.end - ctx.start;
  const rows: QualifierRow[] = base.rows.filter((r) => !(r.claim_text === null && r.source_text !== null && ['condition', 'time_range', 'scope'].includes(r.type)));
  const dropped: QualifierRow[] = [];
  const claimStems = new Set(contentStems(claim));
  // Where the span's own sentence ends inside the context: text past it is an
  // attached following sentence, which code reads as ambiguous, not dropped.
  const sentenceEnd = (() => {
    const m = /[.!?](\s|$)/.exec(ctx.text.slice(s1 - 1));
    return m ? s1 - 1 + m.index + 1 : ctx.text.length;
  })();
  const claimNorm = normalize(claim).toLowerCase();
  for (const q of extractQualifiers(ctx.text)) {
    if (!q.material || !['condition', 'time_range', 'scope'].includes(q.type)) continue;
    const outsideText = ctx.text.slice(q.start, Math.max(q.start, Math.min(q.end, s0))) + ' ' + ctx.text.slice(Math.max(q.start, s1), Math.max(q.end, s1));
    // A qualifier lying wholly outside the verbatim span is not in the claim unless
    // the claim restates it word for word; its words turning up elsewhere in the
    // claim ("…in the blend" vs "If you blend …") is not a restatement.
    const wholeOutside = q.end <= s0 || q.start >= s1;
    const missing = wholeOutside
      ? claimNorm.includes(normalize(q.text).toLowerCase())
        ? []
        : contentStems(q.text).filter((st) => !NON_QUALIFIER_STEMS.has(st)).concat(['(outside the quoted span)'])
      : contentStems(outsideText).filter((st) => !NON_QUALIFIER_STEMS.has(st) && !claimStems.has(st));
    const inNextSentence = q.start >= sentenceEnd;
    const nextException = inNextSentence && EXPLICIT_EXCEPTION.test(q.text);
    const row: QualifierRow = {
      type: q.type,
      claim_text: missing.length ? null : q.text,
      source_text: q.text,
      status: !missing.length ? 'preserved' : inNextSentence && !nextException ? 'ambiguous' : 'dropped',
      material: true,
      note: !missing.length ? 'inside the quoted span' : nextException ? 'an exception in the following sentence, which limits this one' : inNextSentence ? 'in the following sentence; may limit the claim' : 'part of the source sentence the claim stops short of',
      proposed_by: 'code',
    };
    rows.push(row);
    if (row.status === 'dropped') dropped.push(row);
  }
  // The rest of the span's sentence after it, when it opens like a qualifier.
  const rest = ctx.text.slice(s1, sentenceEnd).replace(/^[\s.!?]+$/, '');
  const timeLead = COMMA_TIME_LEAD.test(rest) && TEMPORAL_WORD.test(rest.split(/[.;!?]/)[0]);
  const restLead = COMMA_QUALIFIER_LEAD.test(rest) || timeLead || (!/^\s*[,;]/.test(rest) && QUALIFIER_LEAD.test(rest));
  if (rest.trim() && restLead && !dropped.some((d) => d.source_text && rest.includes(d.source_text.slice(-12)))) {
    const phrase = rest.replace(/^[,;]?\s*/, '').split(/[.;!?]|,\s+(?:and|but|while|so)\s/)[0].trim();
    if (contentStems(phrase).some((st) => !NON_QUALIFIER_STEMS.has(st) && !claimStems.has(st))) {
      const row: QualifierRow = { type: 'scope', claim_text: null, source_text: phrase, status: 'dropped', material: true, note: 'rest of the source clause, cut off by the claim', proposed_by: 'code' };
      rows.push(row);
      dropped.push(row);
    }
  }
  return {
    rows,
    dropped,
    contradicted: base.contradicted,
    ambiguous: rows.filter((r) => r.status === 'ambiguous' && r.material),
    matchedValues: base.matchedValues,
    unmatchedValues: base.unmatchedValues,
  };
}

function checkKind(kind: 'number' | 'date' | 'negation' | 'modality'): DeterministicCheck['kind'] {
  return kind === 'modality' ? 'qualifiers' : kind;
}

function conflictReason(kind: 'number' | 'date' | 'negation' | 'modality'): FailureReason {
  if (kind === 'modality') return 'qualifier_loss';
  return kind === 'number' ? 'number_mismatch' : kind === 'date' ? 'date_mismatch' : 'negation';
}

/**
 * Decide from code alone, or return null when a model is needed.
 * Order matters: an internal arithmetic error, then conflicts between
 * passages, then verbatim support / verbatim qualifier loss, then template
 * contradictions, then external comparisons and predictions.
 */
export function decideByCode(claimRaw: string, sources: HashedSource[], facts: CodeFacts = codeFacts(claimRaw, sources)): Decision | null {
  const claim = stripMarkers(claimRaw);
  const checks: DeterministicCheck[] = [];
  if (facts.arithmetic) checks.push(facts.arithmetic);

  // R-ARITH: the claim's own arithmetic is wrong, and its operands are in a passage.
  if (facts.arithmetic?.result === 'fail') {
    const operandSpan = sources
      .map((s) => ({ s, q: extractQuantities(claim).find((q) => q.dimension !== 'plain' && s.text.includes(q.raw.trim())) }))
      .find((x) => x.q);
    if (operandSpan?.q) {
      const at = operandSpan.s.text.indexOf(operandSpan.q.raw.trim());
      const ctx = contextOf(operandSpan.s, { start: at, end: at + operandSpan.q.raw.trim().length });
      return {
        verdict: 'contradicted',
        failure_reason: 'arithmetic_error',
        rule_id: 'R-ARITH-CONTRADICTED',
        resolved_by: 'code',
        spans: [asSpan(operandSpan.s, ctx.start, ctx.end, 'conflicts')],
        context: { source_id: ctx.source_id, start: ctx.start, end: ctx.end },
        qualifiers: [],
        checks,
        discarded_quotes: 0,
        internal_score: 0.93,
      };
    }
  }

  const supportSources = new Set<string>([
    ...(facts.whole ? [facts.whole.source.id] : []),
    ...facts.templateSupports.map((t) => t.source.id),
  ]);
  // Only value and negation conflicts mean two passages disagree; a modal overstatement is the claim's.
  const conflictSources = new Set(facts.templateConflicts.filter((t) => t.kind !== 'modality').map((t) => t.source.id));

  // Passages disagree with each other about this exact sentence.
  if (supportSources.size && conflictSources.size) {
    const involved = sources.filter((s) => supportSources.has(s.id) || conflictSources.has(s.id));
    const gov = governingSource(involved.map(sourceRecency));
    checks.push(gov.check);
    if (gov.source_id && conflictSources.has(gov.source_id) && !supportSources.has(gov.source_id)) {
      const c = facts.templateConflicts.find((t) => t.source.id === gov.source_id)!;
      const ctx = contextOf(c.source, c);
      return {
        verdict: 'contradicted',
        failure_reason: 'superseded',
        rule_id: 'R-SUPERSEDED',
        resolved_by: 'code',
        spans: [asSpan(c.source, c.start, c.end, 'conflicts')],
        context: { source_id: ctx.source_id, start: ctx.start, end: ctx.end },
        qualifiers: [],
        checks: [...checks, { kind: checkKind(c.kind), result: 'fail', detail: c.detail }],
        discarded_quotes: 0,
        internal_score: 0.88,
      };
    }
    if (!gov.source_id) {
      const c = facts.templateConflicts[0];
      const sup = facts.whole ?? { source: facts.templateSupports[0].source, start: facts.templateSupports[0].start, end: facts.templateSupports[0].end };
      return {
        verdict: 'unverifiable',
        failure_reason: 'conflicting_sources',
        rule_id: 'R-CONFLICTING-SOURCES',
        resolved_by: 'code',
        spans: [asSpan(sup.source, sup.start, sup.end, 'supports'), asSpan(c.source, c.start, c.end, 'conflicts')],
        context: null,
        qualifiers: [],
        checks,
        discarded_quotes: 0,
        internal_score: 0.8,
      };
    }
    // Governing passage supports: fall through to the support rules below,
    // considering only that passage.
  }

  // A newer passage on the same topic (dated later, or announcing that it
  // replaces earlier terms) may supersede verbatim support in an older one in
  // different words: code cannot tell, so it defers to adjudication.
  const supersededRisk = (supporting: HashedSource): boolean => {
    const mine = sourceRecency(supporting);
    const claimStems = contentStems(claim);
    return sources.some((s) => {
      if (s.id === supporting.id) return false;
      const r = sourceRecency(s);
      const newer = (r.day !== null && (mine.day === null || r.day > mine.day)) || (r.superseding && !mine.superseding);
      return newer && coverage(claimStems, s.text) >= 0.5;
    });
  };
  // Another passage states every value the claim states, about the same thing:
  // a template conflict elsewhere may be conflicting sources, not a contradiction.
  const valuesElsewhere = (exclude: string): boolean => {
    const values = extractQuantities(claim).filter((q) => q.dimension !== 'plain');
    if (!values.length) return false;
    const claimStems = contentStems(claim);
    return sources.some(
      (s) =>
        s.id !== exclude &&
        s.text.split(/(?<=[.!?;])\s+/).some((sent) => {
          const qs = extractQuantities(sent);
          return values.every((v) => qs.some((q) => compareQuantities(v, q) === 'equal')) && coverage(claimStems, sent) >= 0.5;
        }),
    );
  };

  // R-VERBATIM: the claim is in a passage word for word.
  if (facts.whole && !(conflictSources.size && !supportSources.has(facts.whole.source.id)) && !supersededRisk(facts.whole.source)) {
    const w = facts.whole;
    const ctx = contextOf(w.source, w);
    const cmp = verbatimQualifiers(claim, ctx, w);
    const span = asSpan(w.source, w.start, w.end, 'supports', w.match, w.distance);
    checks.push({ kind: 'span_match', result: 'pass', detail: `claim found ${w.match === 'exact' ? 'verbatim' : `(${w.match})`} in ${w.source.id}` });
    checks.push({ kind: 'qualifiers', result: cmp.dropped.length ? 'fail' : 'pass', detail: cmp.dropped.length ? `dropped: ${cmp.dropped.map((d) => d.source_text).join('; ')}` : 'no material qualifier dropped' });
    if (cmp.dropped.length) {
      return {
        verdict: 'unsupported',
        failure_reason: 'qualifier_loss',
        rule_id: 'R-VERBATIM-QUALIFIER-LOSS',
        resolved_by: 'code',
        spans: [span, ...cmp.dropped.map(() => asSpan(w.source, ctx.start, ctx.end, 'qualifies'))].slice(0, 2),
        context: { source_id: w.source.id, start: ctx.start, end: ctx.end },
        qualifiers: cmp.rows,
        checks,
        discarded_quotes: 0,
        internal_score: 0.92,
      };
    }
    const deferred = cmp.rows.some((r) => r.status === 'ambiguous' && r.claim_text === null && r.source_text !== null);
    if (cmp.contradicted.length === 0 && !deferred) {
      return {
        verdict: 'supported',
        failure_reason: null,
        rule_id: 'R-VERBATIM-SUPPORTED',
        resolved_by: 'code',
        spans: [span],
        context: { source_id: w.source.id, start: ctx.start, end: ctx.end },
        qualifiers: cmp.rows.map((r) => (r.status === 'ambiguous' ? { ...r, status: 'preserved' as const, note: `${r.note}; claim is verbatim source text` } : r)),
        checks,
        discarded_quotes: 0,
        internal_score: w.match === 'exact' ? 0.97 : w.match === 'normalized' ? 0.95 : 0.92,
      };
    }
  }

  // R-TEMPLATE-MODALITY: identical to a source sentence except that the claim makes
  // firmer what the source leaves open ("may" → "will"). Not a contradiction —
  // the source does not say it will not — but support exists only once the
  // modal qualifier is dropped: qualifier loss.
  const first = facts.templateConflicts[0];
  if (first?.kind === 'modality' && !supportSources.size && !supersededRisk(first.source)) {
    const ctx = contextOf(first.source, first);
    return {
      verdict: 'unsupported',
      failure_reason: 'qualifier_loss',
      rule_id: 'R-TEMPLATE-MODALITY',
      resolved_by: 'code',
      spans: [asSpan(first.source, first.start, first.end, 'qualifies')],
      context: { source_id: first.source.id, start: ctx.start, end: ctx.end },
      qualifiers: [
        { type: 'modality', claim_text: first.claim_text ?? null, source_text: first.source_text ?? null, status: 'contradicted', material: true, note: 'claim states as firm what the source states as possible or advised', proposed_by: 'code' },
      ],
      checks: [...checks, { kind: 'qualifiers', result: 'fail', detail: first.detail }],
      discarded_quotes: 0,
      internal_score: 0.93,
    };
  }

  // R-TEMPLATE: identical to a source sentence except one value or a negation.
  if (facts.templateConflicts.length && first.kind !== 'modality' && !supportSources.size && !valuesElsewhere(facts.templateConflicts[0].source.id) && !supersededRisk(facts.templateConflicts[0].source)) {
    const c = facts.templateConflicts[0];
    const ctx = contextOf(c.source, c);
    return {
      verdict: 'contradicted',
      failure_reason: conflictReason(c.kind),
      rule_id: c.kind === 'negation' ? 'R-TEMPLATE-NEGATION' : 'R-TEMPLATE-VALUE',
      resolved_by: 'code',
      spans: [asSpan(c.source, c.start, c.end, 'conflicts')],
      context: { source_id: c.source.id, start: ctx.start, end: ctx.end },
      qualifiers: [],
      checks: [...checks, { kind: checkKind(c.kind), result: 'fail', detail: c.detail }],
      discarded_quotes: 0,
      internal_score: 0.95,
    };
  }

  // R-EXTERNAL-COMPARATIVE / R-OUT-OF-SCOPE: nothing in the passages could settle it.
  if (facts.comparative || facts.outOfScope) {
    return {
      verdict: 'unverifiable',
      failure_reason: facts.comparative ? 'comparative' : 'out_of_scope',
      rule_id: facts.comparative ? 'R-EXTERNAL-COMPARATIVE' : 'R-OUT-OF-SCOPE',
      resolved_by: 'code',
      spans: [],
      context: null,
      qualifiers: [],
      checks,
      discarded_quotes: 0,
      internal_score: 0.85,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Model proposals, checked in code
// ---------------------------------------------------------------------------

interface Located {
  source: HashedSource;
  span: Span;
}

function locateEvidence(adj: Adjudication, sources: HashedSource[]): { located: Located[]; discarded: number } {
  const located: Located[] = [];
  let discarded = 0;
  for (const e of adj.evidence ?? []) {
    const named = sources.find((s) => s.id === e.source_id);
    const order = named ? [named, ...sources.filter((s) => s !== named)] : sources;
    let found: Located | null = null;
    for (const s of order) {
      const r = locateQuote(s.text, e.quote);
      if (r.ok) {
        found = { source: s, span: asSpan(s, r.span.start, r.span.end, e.role, r.span.match_type, r.span.edit_distance) };
        break;
      }
    }
    if (found) located.push(found);
    else discarded++;
  }
  return { located, discarded };
}

function contextsText(located: Located[]): { text: string; first: Provenance['context'] } {
  const parts: string[] = [];
  let first: Provenance['context'] = null;
  const seen = new Set<string>();
  for (const l of located) {
    const ctx = contextOf(l.source, l.span);
    const key = `${ctx.source_id}:${ctx.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!first) first = { source_id: ctx.source_id, start: ctx.start, end: ctx.end };
    parts.push(ctx.text);
  }
  return { text: parts.join('\n'), first };
}

function matchPenalty(spans: Span[]): number {
  return spans.reduce((p, s) => p + (s.match_type === 'punctuation_tolerant' ? 0.05 : s.match_type === 'normalized' ? 0.02 : 0), 0);
}

function base(verdict: Verdict, reason: FailureReason | null, rule: string, score: number, extra: Partial<Decision> = {}): Decision {
  return {
    verdict,
    failure_reason: reason,
    rule_id: rule,
    resolved_by: 'model',
    spans: [],
    context: null,
    qualifiers: [],
    checks: [],
    discarded_quotes: 0,
    internal_score: score,
    ...extra,
  };
}

/**
 * Turn a model's adjudication into a verdict, or ask for a stronger tier.
 * `tier` is the tier that produced this adjudication.
 */
export function decideWithModel(
  claimRaw: string,
  sources: HashedSource[],
  adj: Adjudication,
  tier: Tier,
  facts: CodeFacts = codeFacts(claimRaw, sources),
): Decision {
  const claim = stripMarkers(claimRaw);
  const { located, discarded } = locateEvidence(adj, sources);
  const checks: DeterministicCheck[] = [];
  if (facts.arithmetic) checks.push(facts.arithmetic);
  if (discarded) checks.push({ kind: 'span_match', result: 'fail', detail: `${discarded} model-proposed quote(s) not found in the source and discarded` });
  const strong = tier === 'strong';
  const penalty = (strong ? 0.12 : 0) + Math.min(0.15, discarded * 0.05);
  const escalateOr = (reason: string, final: Decision): Decision => (strong ? final : { ...final, escalate: reason });
  const proposed: ProposedQualifier[] = (adj.source_qualifiers ?? []).map((q) => ({ type: q.type, text: q.text }));

  if (adj.verdict === 'supported') {
    const supports = located.filter((l) => l.span.role !== 'conflicts');
    if (!supports.length) {
      return escalateOr('model cited support that is not in the source', base('unsupported', 'no_supporting_span', 'R-SUPPORT-QUOTE-UNVERIFIED', 0.7 - penalty, { checks, discarded_quotes: discarded }));
    }
    const conflicts = located.filter((l) => l.span.role === 'conflicts');
    const { text: ctx, first } = contextsText(supports);
    const cmp = compareQualifiers(claim, ctx, proposed);
    const spans = [...supports, ...conflicts].map((l) => l.span);
    checks.push({ kind: 'span_match', result: 'pass', detail: `${supports.length} supporting quote(s) located in source` });
    // Code found a passage that contradicts this sentence outright.
    if (facts.templateConflicts.length && !facts.templateSupports.length && !facts.whole) {
      const c = facts.templateConflicts[0];
      const modal = c.kind === 'modality';
      return escalateOr(modal ? 'code found the claim firmer than its source' : 'code found a passage that contradicts the claim', {
        ...(modal
          ? base('unsupported', 'qualifier_loss', 'R-TEMPLATE-MODALITY-OVERRIDES-MODEL', 0.85 - penalty)
          : base('contradicted', conflictReason(c.kind), 'R-TEMPLATE-OVERRIDES-MODEL', 0.85 - penalty)),
        resolved_by: 'model',
        spans: [...spans, asSpan(c.source, c.start, c.end, 'conflicts')],
        context: first,
        qualifiers: cmp.rows,
        checks: [...checks, { kind: checkKind(c.kind), result: 'fail', detail: c.detail }],
        discarded_quotes: discarded,
      });
    }
    return finishSupport(claim, sources, adj, cmp, spans, first, checks, discarded, tier, penalty, located);
  }

  if (adj.verdict === 'contradicted') {
    const conflicts = located.filter((l) => l.span.role === 'conflicts' || l.span.role === 'supports');
    if (!conflicts.length) {
      return escalateOr('model cited a contradiction that is not in the source', base('unsupported', 'unverified_contradiction', 'R-CONTRADICTION-QUOTE-UNVERIFIED', 0.68 - penalty, { checks, discarded_quotes: discarded }));
    }
    const spans = conflicts.map((l) => ({ ...l.span, role: 'conflicts' as const }));
    const { text: ctx, first } = contextsText(conflicts);
    const cmp = compareQualifiers(claim, ctx, proposed);
    const valueConflict = cmp.contradicted.find((r) => isValueRow(r));
    const template = facts.templateConflicts[0];
    // A newer passage supersedes an older one the claim follows.
    if (adj.conflict_type === 'superseded' || conflicts.length && located.some((l) => l.span.role === 'supports')) {
      const involved = [...new Set(located.map((l) => l.source))];
      if (involved.length >= 2) {
        const gov = governingSource(involved.map(sourceRecency));
        checks.push(gov.check);
        if (gov.source_id && conflicts.some((c) => c.source.id === gov.source_id && c.span.role === 'conflicts')) {
          return { ...base('contradicted', 'superseded', 'R-MODEL-SUPERSEDED', 0.82 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
        }
        if (!gov.source_id) {
          return { ...base('unverifiable', 'conflicting_sources', 'R-MODEL-CONFLICTING-SOURCES', 0.72 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
        }
      }
    }
    if (template) {
      checks.push({ kind: template.kind === 'date' ? 'date' : template.kind === 'number' ? 'number' : 'negation', result: 'fail', detail: template.detail });
      return { ...base('contradicted', conflictReason(template.kind), 'R-MODEL-CONTRADICTED-CODE-CONFIRMED', 0.9 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
    }
    if (valueConflict) {
      checks.push({ kind: valueConflict.type === 'date' ? 'date' : 'number', result: 'fail', detail: `claim ${valueConflict.claim_text ?? ''} vs source ${valueConflict.source_text ?? ''}`.trim() });
      return {
        ...base('contradicted', valueConflict.type === 'date' ? 'date_mismatch' : 'number_mismatch', 'R-MODEL-CONTRADICTED-CODE-CONFIRMED', 0.86 - penalty - matchPenalty(spans)),
        spans,
        context: first,
        qualifiers: cmp.rows,
        checks,
        discarded_quotes: discarded,
      };
    }
    // Code sees the claim's values preserved and no qualifier conflict: the
    // model's contradiction is about meaning code cannot check (an entity, a
    // condition, a negation in other words).
    const valuesAllMatch = cmp.unmatchedValues === 0 && cmp.matchedValues > 0 && !cmp.dropped.length && !cmp.ambiguous.length;
    if (valuesAllMatch && !strong) {
      return { ...base('contradicted', 'condition_mismatch', 'R-MODEL-CONTRADICTED', 0.7 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded, escalate: 'code finds the cited span consistent with the claim' };
    }
    const reason: FailureReason =
      adj.conflict_type === 'entity'
        ? 'entity_mismatch'
        : adj.conflict_type === 'negation'
          ? 'negation'
          : adj.conflict_type === 'date'
            ? 'date_mismatch'
            : adj.conflict_type === 'number'
              ? 'number_mismatch'
              : 'condition_mismatch';
    return { ...base('contradicted', reason, 'R-MODEL-CONTRADICTED-SPAN-VERIFIED', 0.78 - penalty - matchPenalty(spans)), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
  }

  if (adj.verdict === 'unverifiable') {
    if (adj.unverifiable_reason === 'comparative' || adj.unverifiable_reason === 'out_of_scope') {
      return { ...base('unverifiable', adj.unverifiable_reason, 'R-MODEL-UNVERIFIABLE-SCOPE', 0.72 - penalty), checks, discarded_quotes: discarded };
    }
    if (adj.unverifiable_reason === 'conflicting_sources') {
      const bySource = new Set(located.map((l) => l.source.id));
      if (bySource.size >= 2) {
        const involved = sources.filter((s) => bySource.has(s.id));
        const gov = governingSource(involved.map(sourceRecency));
        checks.push(gov.check);
        if (gov.source_id) {
          // One passage governs: judge the claim against it alone.
          const governing = located.filter((l) => l.source.id === gov.source_id);
          const { text: ctx, first } = contextsText(governing);
          const cmp = compareQualifiers(claim, ctx, proposed);
          const conflictRow = cmp.contradicted.find((r) => isValueRow(r));
          if (conflictRow) {
            return { ...base('contradicted', 'superseded', 'R-GOVERNING-SOURCE-CONTRADICTS', 0.8 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
          }
          return escalateOr('passages conflict; the governing passage needs a fresh judgement', { ...base('unverifiable', 'conflicting_sources', 'R-MODEL-CONFLICTING-SOURCES', 0.7 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded });
        }
        return { ...base('unverifiable', 'conflicting_sources', 'R-MODEL-CONFLICTING-SOURCES', 0.75 - penalty), spans: located.map((l) => l.span), checks, discarded_quotes: discarded };
      }
      return escalateOr('model reported conflicting passages that could not be located', base('unverifiable', 'model_abstained', 'R-MODEL-ABSTAINED', 0.6 - penalty, { checks, discarded_quotes: discarded }));
    }
    return escalateOr('model could not decide', base('unverifiable', 'model_abstained', 'R-MODEL-ABSTAINED', 0.6 - penalty, { checks, discarded_quotes: discarded }));
  }

  // unsupported
  const qualifying = located.filter((l) => l.span.role !== 'conflicts');
  if (qualifying.length) {
    const { text: ctx, first } = contextsText(qualifying);
    const cmp = compareQualifiers(claim, ctx, proposed);
    if (cmp.dropped.length && cmp.unmatchedValues === 0) {
      return { ...base('unsupported', 'qualifier_loss', 'R-MODEL-QUALIFIER-LOSS', 0.84 - penalty - matchPenalty(qualifying.map((q) => q.span))), spans: qualifying.map((l) => l.span), context: first, qualifiers: cmp.rows, checks: [...checks, { kind: 'qualifiers', result: 'fail', detail: `dropped: ${cmp.dropped.map((d) => d.source_text).join('; ')}` }], discarded_quotes: discarded };
    }
  }
  // A passage that matches the claim almost word for word deserves a second look.
  if (!strong && (facts.templateSupports.length || facts.bestCoverage >= 0.85)) {
    return { ...base('unsupported', 'no_supporting_span', 'R-MODEL-UNSUPPORTED', 0.6 - penalty), checks, discarded_quotes: discarded, escalate: 'a passage closely matches the claim' };
  }
  return { ...base('unsupported', 'no_supporting_span', 'R-MODEL-UNSUPPORTED', 0.8 - penalty), spans: located.map((l) => l.span), checks, discarded_quotes: discarded };
}

function finishSupport(
  claim: string,
  sources: HashedSource[],
  adj: Adjudication,
  cmp: QualifierComparison,
  spans: Span[],
  first: Provenance['context'],
  checks: DeterministicCheck[],
  discarded: number,
  tier: Tier,
  penalty: number,
  located: Located[],
): Decision {
  const strong = tier === 'strong';
  const rows = [...cmp.rows];
  const score = 0.88 - penalty - matchPenalty(spans);

  // A model cannot confirm support across a polarity difference that code finds
  // in the quoted span itself: the span carries the claim's content words and
  // negates them where the claim does not, or the reverse ("Monthly plans are
  // refundable" quoted as support from "Monthly plans are not refundable").
  // Code cannot be sure which predicate the negation applies to, so this is not
  // a contradiction, but it is not support either, and no tier may overrule it.
  const claimStemsForPolarity = contentStems(claim);
  const flipped = located
    .filter((l) => l.span.role !== 'conflicts')
    .find((l) => negationCount(l.span.quote) % 2 !== negationCount(claim) % 2 && coverage(claimStemsForPolarity, contentStems(l.span.quote)) >= 0.8);
  if (flipped) {
    checks.push({ kind: 'negation', result: 'fail', detail: 'the quoted support negates the claim (or the claim negates it); a model cannot confirm support across that' });
    return { ...base('unsupported', 'unverified_contradiction', 'R-SUPPORT-POLARITY-CONFLICT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }

  // The cited text must be about the claim. A real sentence that shares almost
  // nothing with the claim (an injected instruction, an unrelated line) is not
  // support, whatever the model says.
  const supportText = located.filter((l) => l.span.role !== 'conflicts').map((l) => contextOf(l.source, l.span).text).join('\n');
  const relevance = coverage(contentStems(claim), contentStems(supportText));
  if (relevance < (strong ? 0.2 : 0.3)) {
    checks.push({ kind: 'span_match', result: 'fail', detail: `cited support shares ${Math.round(relevance * 100)}% of the claim's content words` });
    return strong
      ? { ...base('unsupported', 'no_supporting_span', 'R-SUPPORT-NOT-RELEVANT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded }
      : { ...base('unsupported', 'no_supporting_span', 'R-SUPPORT-NOT-RELEVANT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: 'cited support does not appear to be about the claim' };
  }

  if (cmp.dropped.length) {
    checks.push({ kind: 'qualifiers', result: 'fail', detail: `dropped: ${cmp.dropped.map((d) => d.source_text).join('; ')}` });
    return { ...base('unsupported', 'qualifier_loss', 'R-QUALIFIER-LOSS', score - 0.02), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }

  // Values the claim states that the support context does not: try the other
  // located spans, the model's arithmetic (recomputed), and date math.
  const evidenceText = located.map((l) => contextOf(l.source, l.span).text).join('\n');
  const arith = adj.arithmetic ? recomputeArithmetic(adj.arithmetic, evidenceText, claim) : null;
  // A figure the claim says it computes ("for a total of 20 days", "so … 240,000
  // more", "$49 per month, so a full year costs $588") is derived from the
  // passages, not missing from them and not a different value for the same fact,
  // when code recomputes it from values in the cited evidence: the claim's own
  // stated computation, or the model's arithmetic where the claim carries a
  // computation cue (1.3.0). Without one the conflict stands: arithmetic cannot
  // explain away "60 days" against "30 days".
  const evidenceValues = extractQuantities(evidenceText).map((q) => q.written);
  const inEvidence = (v: number) => evidenceValues.some((e) => closeTo(e, v));
  const comp = claimComputation(claim);
  const compDerives = comp?.check.result === 'pass' && comp.operands.every(inEvidence) ? comp : null;
  const derivedValues = [
    ...(compDerives ? [compDerives.result] : []),
    ...(arith?.result === 'pass' && DERIVATION_CUE.test(claim) ? [adj.arithmetic!.result] : []),
  ];
  for (const r of rows.filter((x) => (x.status === 'ambiguous' || x.status === 'contradicted') && VALUE_TYPES.has(x.type))) {
    if (r.claim_text === null || !extractQuantities(r.claim_text).some((q) => derivedValues.some((v) => closeTo(q.written, v)))) continue;
    r.status = 'preserved';
    r.note = `${r.note}; derived from cited evidence by recomputation`;
    const ck = compDerives ? compDerives.check : arith!;
    if (!checks.includes(ck)) checks.push(ck);
  }
  const unresolvedValueRows = rows.filter((r) => r.status === 'ambiguous' && VALUE_TYPES.has(r.type));
  if (unresolvedValueRows.length) {
    const wider = compareQualifiers(claim, evidenceText, []);
    let resolved = wider.unmatchedValues === 0 && wider.matchedValues > 0;
    if (!resolved && arith) {
      if (!checks.includes(arith)) checks.push(arith);
      resolved = arith.result === 'pass';
    }
    if (!resolved) {
      const dm = dateMath(claim, evidenceText);
      if (dm) {
        checks.push(dm);
        resolved = dm.result === 'pass';
      }
    }
    if (resolved) {
      for (const r of unresolvedValueRows) {
        r.status = 'preserved';
        r.note = `${r.note}; established from cited evidence by recomputation`;
      }
    } else {
      checks.push({ kind: 'number', result: 'fail', detail: `claim value(s) not found in cited evidence: ${unresolvedValueRows.map((r) => r.claim_text).join(', ')}` });
      return strong
        ? { ...base('unsupported', 'unsupported_detail', 'R-UNSUPPORTED-DETAIL', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded }
        : { ...base('unsupported', 'unsupported_detail', 'R-UNSUPPORTED-DETAIL', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: 'claim states a value the cited evidence does not' };
    }
  }

  const valueConflicts = cmp.contradicted.filter((r) => isValueRow(r) && r.status === 'contradicted');
  if (valueConflicts.length) {
    checks.push({ kind: 'number', result: 'fail', detail: valueConflicts.map((r) => `claim ${r.claim_text ?? '—'} vs source ${r.source_text ?? '—'}`).join('; ') });
    if (!strong) {
      return { ...base('unsupported', 'unsupported_detail', 'R-VALUE-CONFLICT-IN-SUPPORT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: 'cited support states a different value' };
    }
    const aligned = coverage(contentStems(claim), contentStems(evidenceText)) >= 0.8;
    const r0 = valueConflicts[0];
    return aligned
      ? { ...base('contradicted', r0.type === 'date' ? 'date_mismatch' : 'number_mismatch', 'R-VALUE-CONFLICT-IN-SUPPORT', score), spans: spans.map((s) => ({ ...s, role: 'conflicts' as const })), context: first, qualifiers: rows, checks, discarded_quotes: discarded }
      : { ...base('unsupported', 'unsupported_detail', 'R-VALUE-CONFLICT-IN-SUPPORT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }
  const otherConflicts = cmp.contradicted.filter((r) => !isValueRow(r));
  if (otherConflicts.length) {
    return strong
      ? { ...base('unsupported', 'qualifier_loss', 'R-QUALIFIER-CONFLICT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded }
      : { ...base('unsupported', 'qualifier_loss', 'R-QUALIFIER-CONFLICT', score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: 'a qualifier in the cited support differs from the claim' };
  }

  // Remaining ambiguity (entity, polarity, modality, a qualifier the claim adds):
  // code cannot decide; require the strong tier's judgement before "supported".
  const softAmbiguous = rows.filter((r) => r.status === 'ambiguous' && r.material);
  if (softAmbiguous.length && !strong) {
    return { ...base('supported', null, 'R-MODEL-SUPPORTED-PENDING', score - 0.1), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: `code could not confirm: ${softAmbiguous.map((r) => r.type).join(', ')}` };
  }
  for (const r of softAmbiguous) {
    r.status = 'preserved';
    r.note = `${r.note}; judged preserved by the strong-tier model (code could not decide)`;
  }
  checks.push({ kind: 'qualifiers', result: 'pass', detail: 'no material qualifier dropped or contradicted' });
  return {
    ...base('supported', null, softAmbiguous.length ? 'R-MODEL-SUPPORTED-STRONG-CONFIRMED' : 'R-MODEL-SUPPORTED-VERIFIED', score - softAmbiguous.length * 0.04),
    spans,
    context: first,
    qualifiers: rows,
    checks,
    discarded_quotes: discarded,
  };
}

/** The verdict for a claim no adjudicator could reach. */
export function unresolved(reason: 'cost_ceiling' | 'deadline' | 'provider_error', facts?: CodeFacts): Decision {
  return {
    verdict: 'unverifiable',
    failure_reason: reason,
    rule_id: reason === 'cost_ceiling' ? 'R-COST-CEILING' : reason === 'deadline' ? 'R-DEADLINE' : 'R-PROVIDER-ERROR',
    resolved_by: 'code',
    spans: [],
    context: null,
    qualifiers: [],
    checks: facts?.arithmetic ? [facts.arithmetic] : [],
    discarded_quotes: 0,
    internal_score: 0.5,
  };
}
