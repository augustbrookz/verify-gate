/**
 * Gate claims: a verify-core ClaimResult split into separate fields, so a
 * developer can see exactly which part of a check failed and which results
 * will reproduce identically.
 *
 *   span_valid          deterministic: every quoted span exists at its offsets in a
 *                       source whose sha256 still matches
 *   support_assessment  supported | contradicted | unresolved (model-assisted unless
 *                       resolved_by is code)
 *   qualifier_checks    per qualifier: preserved | missing | conflicting | ambiguous
 *   resolved_by         code | model | deliberation
 *   review_required     a person should look before relying on this claim
 *
 * `deterministic` is true when the verdict was decided in code from valid spans
 * and code-proposed qualifiers: that finding reproduces byte for byte.
 */
import { sha256Hex, spanIsExact, type ClaimResult, type QualifierType, type ResolvedBy, type Verdict } from '@xyntherium/verify-core';
import type { Materiality } from './defaults';

export type SupportAssessment = 'supported' | 'contradicted' | 'unresolved';
export type QualifierCheckStatus = 'preserved' | 'missing' | 'conflicting' | 'ambiguous';

export interface QualifierCheck {
  type: QualifierType;
  status: QualifierCheckStatus;
  material: boolean;
  proposed_by: 'code' | 'model';
  note: string;
  claim_text_hash: string | null;
  source_text_hash: string | null;
  /** Present only when the run includes text. */
  claim_text?: string | null;
  source_text?: string | null;
}

export interface GateSpan {
  source_id: string;
  start: number;
  end: number;
  role: 'supports' | 'conflicts' | 'qualifies';
  match_type: string;
  source_hash: string;
  quote_hash: string;
  /** Re-checked now: the quote is at these offsets in a source with this hash. */
  valid: boolean;
  quote?: string;
}

export interface GateClaim {
  index: number;
  origin: 'expected' | 'answer';
  /** The golden-set claim this is, when it is one. */
  expected_id: string | null;
  materiality: Materiality;
  claim_hash: string;
  text?: string;
  /** Expected claims: whether the answer makes the claim at all. */
  present_in_answer: boolean;
  answer_span: { start: number; end: number } | null;
  verdict: Verdict | null;
  failure_reason: string | null;
  verify_rule_id: string | null;
  span_valid: boolean | null;
  support_assessment: SupportAssessment;
  qualifier_checks: QualifierCheck[];
  resolved_by: ResolvedBy;
  review_required: boolean;
  deterministic: boolean;
  citation: { required: boolean; status: 'ok' | 'missing' | 'mismatch' | 'not_required' };
  spans: GateSpan[];
  discarded_quotes: number;
  calibrated_confidence: number | null;
}

export interface SourceText {
  id: string;
  text: string;
}

const STATUS: Record<string, QualifierCheckStatus> = { preserved: 'preserved', dropped: 'missing', contradicted: 'conflicting', ambiguous: 'ambiguous' };

const h = (s: string | null | undefined) => (s === null || s === undefined ? null : sha256Hex(s));

export function supportAssessment(c: Pick<ClaimResult, 'verdict' | 'failure_reason'>): SupportAssessment {
  if (c.verdict === 'supported') return 'supported';
  if (c.verdict === 'contradicted') return 'contradicted';
  // A dropped qualifier means the fact itself is in the source: the support check
  // passed and the qualifier check failed. The split shows exactly that.
  if (c.verdict === 'unsupported' && c.failure_reason === 'qualifier_loss') return 'supported';
  return 'unresolved';
}

export function toGateClaim(
  c: ClaimResult,
  o: {
    sources: SourceText[];
    materiality: Materiality;
    origin: 'expected' | 'answer';
    expected_id?: string | null;
    require_citation?: boolean;
    include_text?: boolean;
    index?: number;
  },
): GateClaim {
  const byId = new Map(o.sources.map((s) => [s.id, s]));
  const spans: GateSpan[] = c.provenance.spans.map((s) => {
    const src = byId.get(s.source_id);
    const valid = !!src && sha256Hex(src.text) === s.source_hash && spanIsExact(src.text, s);
    return {
      source_id: s.source_id,
      start: s.start,
      end: s.end,
      role: s.role,
      match_type: s.match_type,
      source_hash: s.source_hash,
      quote_hash: sha256Hex(s.quote),
      valid,
      ...(o.include_text ? { quote: s.quote } : {}),
    };
  });
  const span_valid = spans.length ? spans.every((s) => s.valid) : c.provenance.discarded_quotes > 0 ? false : null;
  const qualifier_checks: QualifierCheck[] = c.provenance.qualifiers.map((q) => ({
    type: q.type,
    status: STATUS[q.status] ?? 'ambiguous',
    material: q.material,
    proposed_by: q.proposed_by,
    note: q.note,
    claim_text_hash: h(q.claim_text),
    source_text_hash: h(q.source_text),
    ...(o.include_text ? { claim_text: q.claim_text, source_text: q.source_text } : {}),
  }));
  const deterministic =
    c.resolved_by === 'code' && span_valid !== false && qualifier_checks.every((q) => q.proposed_by === 'code') && c.failure_reason !== 'not_adjudicated';
  const assessment = supportAssessment(c);
  const ambiguousMaterial = qualifier_checks.some((q) => q.material && q.status === 'ambiguous');
  const failing = c.verdict === 'contradicted' || c.verdict === 'unsupported';
  const review_required =
    span_valid === false ||
    (c.verdict === 'unverifiable' && (o.materiality === 'critical' || o.materiality === 'high')) ||
    (ambiguousMaterial && c.verdict !== 'supported') ||
    (failing && !deterministic);
  const required = !!o.require_citation;
  return {
    index: o.index ?? c.index,
    origin: o.origin,
    expected_id: o.expected_id ?? null,
    materiality: o.materiality,
    claim_hash: sha256Hex(c.text),
    ...(o.include_text ? { text: c.text } : {}),
    present_in_answer: true,
    answer_span: c.answer_start === null || c.answer_end === null ? null : { start: c.answer_start, end: c.answer_end },
    verdict: c.verdict,
    failure_reason: c.failure_reason,
    verify_rule_id: c.provenance.rule_id,
    span_valid,
    support_assessment: assessment,
    qualifier_checks,
    resolved_by: c.resolved_by,
    review_required,
    deterministic,
    citation: { required, status: required ? (c.citation.status === 'not_required' ? 'missing' : c.citation.status) : 'not_required' },
    spans,
    discarded_quotes: c.provenance.discarded_quotes,
    calibrated_confidence: c.calibrated_confidence,
  };
}

/** An expected material claim that the answer no longer makes. Deterministic: the answer was searched in code. */
export function missingExpectedClaim(o: { index: number; expected_id: string; text: string; materiality: Materiality; include_text?: boolean }): GateClaim {
  return {
    index: o.index,
    origin: 'expected',
    expected_id: o.expected_id,
    materiality: o.materiality,
    claim_hash: sha256Hex(o.text),
    ...(o.include_text ? { text: o.text } : {}),
    present_in_answer: false,
    answer_span: null,
    verdict: null,
    failure_reason: 'expected_claim_missing',
    verify_rule_id: null,
    span_valid: null,
    support_assessment: 'unresolved',
    qualifier_checks: [],
    resolved_by: 'code',
    review_required: o.materiality === 'critical' || o.materiality === 'high',
    deterministic: true,
    citation: { required: false, status: 'not_required' },
    spans: [],
    discarded_quotes: 0,
    calibrated_confidence: null,
  };
}
