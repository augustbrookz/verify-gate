/**
 * Evaluate one golden-set case: an answer, its sources, and the expected
 * material claims, into Gate claims the policy can decide on. Shared by the
 * Action's local mode and the hosted /v1/gate/verify-run endpoint.
 *
 *   1. Each expected claim is located in the answer (normalised, with original
 *      offsets). Missing → an "expected claim missing" claim.
 *   2. Present → decided in code first (decideByCode). If code cannot settle it
 *      and the golden set declares a supporting quote, that quote is handed to
 *      verify-core as the proposal: code locates it, compares every qualifier
 *      and recomputes arithmetic exactly as it does for a model's proposal. The
 *      support is declared by the golden set and checked in code, so the
 *      result reproduces identically. Hosted mode may instead ask the verifier
 *      model, and every clause the engine splits the sentence into is kept as
 *      a claim; local mode reports it unresolved.
 *   3. The rest of the answer is split into claims and checked by the engine:
 *      code only in local mode, model-assisted in hosted mode.
 *
 * Text never leaves this function except inside the returned claims, and only
 * when include_text is set.
 */
import {
  citationStatus,
  citedFor,
  classifyClaim,
  codeFacts,
  decideByCode,
  decideWithModel,
  hashSources,
  locateQuote,
  parseCitations,
  runEngine,
  splitSentences,
  type Adjudication,
  type ClaimResult,
  type Decision,
  type EngineOptions,
  type HashedSource,
} from '@xyntherium/verify-core';
import { missingExpectedClaim, toGateClaim, type GateClaim } from './claims';
import type { GatePolicy, Materiality } from './defaults';

export interface ExpectedClaim {
  id: string;
  claim: string;
  materiality: Materiality;
  /** A passage, verbatim in `source`, that supports the claim (golden-set declaration). */
  quote?: string | null;
  source?: string | null;
  require_citation?: boolean;
}

export interface CaseSource {
  id: string;
  text: string;
  title?: string;
  retrieved_at?: string;
}

export interface AnswerEvaluation {
  claims: GateClaim[];
  partial: boolean;
  partial_reasons: string[];
  cost_cents: number;
  model_calls: number;
  extraction: 'model' | 'cached' | 'fallback';
}

function golden(quote: string, sourceId: string): Adjudication {
  return {
    verdict: 'supported',
    reason: 'support declared by the golden set',
    evidence: [{ source_id: sourceId, quote, role: 'supports' }],
    source_qualifiers: [],
    conflict_type: 'none',
    unverifiable_reason: 'none',
    arithmetic: null,
  };
}

function notAdjudicated(): Decision {
  return { verdict: 'unverifiable', failure_reason: 'not_adjudicated', rule_id: 'R-NOT-ADJUDICATED', resolved_by: 'code', spans: [], context: null, qualifiers: [], checks: [], discarded_quotes: 0, internal_score: 0.5 };
}

function asClaimResult(d: Decision, o: { index: number; text: string; start: number; end: number; requireCitations: boolean; cited: string[] }): ClaimResult {
  const supportIds = d.spans.filter((s) => s.role === 'supports').map((s) => s.source_id);
  const status = d.verdict === 'supported' ? citationStatus(o.requireCitations, o.cited, supportIds) : o.requireCitations ? (o.cited.length ? 'mismatch' : 'missing') : 'not_required';
  return {
    index: o.index,
    text: o.text,
    claim_type: classifyClaim(o.text),
    material: true,
    answer_start: o.start,
    answer_end: o.end,
    verdict: d.verdict,
    failure_reason: d.failure_reason,
    resolved_by: d.resolved_by,
    calibrated_confidence: null,
    calibration_label: null,
    citation: { cited: o.cited, status },
    provenance: {
      spans: d.spans,
      context: d.context,
      qualifiers: d.qualifiers,
      checks: d.checks,
      rule_id: d.rule_id,
      model_used: d.resolved_by !== 'code',
      models: [],
      prompt_versions: [],
      discarded_quotes: d.discarded_quotes,
    },
  };
}

/** Find the source that contains a declared quote (verbatim or normalised). */
function quoteSource(quote: string, preferred: string | null | undefined, sources: HashedSource[]): string | null {
  const ordered = preferred ? [...sources.filter((s) => s.id === preferred), ...sources.filter((s) => s.id !== preferred)] : sources;
  for (const s of ordered) if (locateQuote(s.text, quote).ok) return s.id;
  return null;
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  const inter = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  return inter > 0 && inter >= 0.5 * Math.min(a[1] - a[0], b[1] - b[0]);
}

export async function evaluateAnswer(input: {
  question: string;
  answer: string;
  sources: CaseSource[];
  expected: ExpectedClaim[];
  policy: GatePolicy;
  include_text?: boolean;
  /** Hosted mode: the model functions. Omitted in local mode (code only). */
  engine?: EngineOptions;
}): Promise<AnswerEvaluation> {
  const { question, answer, policy } = input;
  const hashed = hashSources(input.sources);
  const requireCitations = policy.require_citations || input.expected.some((e) => e.require_citation);
  const markers = parseCitations(answer, input.sources);
  const claims: GateClaim[] = [];
  const covered: [number, number][] = [];
  let partial = false;
  const partialReasons = new Set<string>();
  let cost = 0;
  let modelCalls = 0;
  let index = 0;

  for (const e of input.expected) {
    const loc = locateQuote(answer, e.claim.trim().replace(/[.!]+$/, ''));
    if (!loc.ok) {
      claims.push(missingExpectedClaim({ index: index++, expected_id: e.id, text: e.claim, materiality: e.materiality, include_text: input.include_text }));
      continue;
    }
    // Verify what the answer actually says: the whole answer sentence containing the
    // expected claim, not the claim alone. Checking "Phone support is available only
    // on the Business plan" by itself would report the answer's own time window
    // ("Monday through Friday …") as dropped.
    const sentence = splitSentences(answer).find((x) => x.start <= loc.span.start && x.end >= loc.span.end);
    const start = sentence ? sentence.start : loc.span.start;
    const end = sentence ? sentence.end : loc.span.end;
    const text = answer.slice(start, end).trim();
    covered.push([start, end]);
    const facts = codeFacts(text, hashed);
    let d: Decision | null = hashed.length ? decideByCode(text, hashed, facts) : null;
    if (!d && e.quote) {
      const sid = quoteSource(e.quote, e.source, hashed);
      if (sid) {
        const g = decideWithModel(text, hashed, golden(e.quote, sid), 'strong', facts);
        d = {
          ...g,
          resolved_by: 'code',
          rule_id: `R-GOLDEN:${g.rule_id}`,
          qualifiers: g.qualifiers.map((q) => ({ ...q, note: q.note.replace('judged preserved by the strong-tier model (code could not decide)', "accepted on the golden set's declared support (code could not decide)") })),
        };
      }
    }
    if (!d && input.engine?.adjudicate) {
      const r = await runEngine({ question, answer: text, sources: input.sources, options: { require_citations: false } }, { ...input.engine, extract: undefined });
      cost += r.cost_cents;
      modelCalls += r.telemetry.model_calls;
      if (r.partial) {
        partial = true;
        for (const pr of r.partial_reasons) partialReasons.add(pr);
      }
      // The engine may split the sentence into clauses ("…10,000 requests, and …
      // 250,000, so … 225,000 more"). Every clause is a claim of this expected
      // claim; keeping only the first would drop the clause that is wrong.
      if (r.claims.length) {
        const lead = start + (answer.slice(start, end).length - answer.slice(start, end).trimStart().length);
        for (const c of r.claims) {
          const cs = c.answer_start === null ? start : lead + c.answer_start;
          const ce = c.answer_end === null ? end : lead + c.answer_end;
          const cited = citedFor(answer, markers, cs, ce);
          const res: ClaimResult = { ...c, index, answer_start: cs, answer_end: ce, citation: { cited, status: c.verdict === 'supported' ? citationStatus(requireCitations, cited, c.provenance.spans.filter((s) => s.role === 'supports').map((s) => s.source_id)) : requireCitations ? (cited.length ? 'mismatch' : 'missing') : 'not_required' } };
          claims.push(toGateClaim(res, { sources: input.sources, materiality: e.materiality, origin: 'expected', expected_id: e.id, require_citation: policy.require_citations || !!e.require_citation, include_text: input.include_text, index: index++ }));
        }
        continue;
      }
    }
    const decision = d ?? notAdjudicated();
    const res = asClaimResult(decision, { index, text, start, end, requireCitations, cited: citedFor(answer, markers, start, end) });
    claims.push(toGateClaim(res, { sources: input.sources, materiality: e.materiality, origin: 'expected', expected_id: e.id, require_citation: policy.require_citations || !!e.require_citation, include_text: input.include_text, index: index++ }));
  }

  const r = await runEngine({ question, answer, sources: input.sources, options: { require_citations: requireCitations } }, input.engine ?? {});
  cost += r.cost_cents;
  modelCalls += r.telemetry.model_calls;
  if (r.partial) {
    partial = true;
    for (const pr of r.partial_reasons) partialReasons.add(pr);
  }
  for (const c of r.claims) {
    if (c.answer_start !== null && c.answer_end !== null && covered.some((s) => overlaps(s, [c.answer_start!, c.answer_end!]))) continue;
    claims.push(toGateClaim(c, { sources: input.sources, materiality: c.material ? 'medium' : 'low', origin: 'answer', require_citation: policy.require_citations, include_text: input.include_text, index: index++ }));
  }
  return { claims, partial, partial_reasons: [...partialReasons], cost_cents: Math.round(cost * 10_000) / 10_000, model_calls: modelCalls, extraction: r.telemetry.extraction };
}
