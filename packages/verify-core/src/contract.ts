/**
 * The Verify verdict contract, schema version 2026-10-15.
 *
 * Every verdict describes the SUPPLIED EVIDENCE, never the world. "supported"
 * means the passages the caller sent support the claim; it does not mean the
 * claim is true. Nothing in this contract is, or may be renamed to, a word
 * that implies real-world truth (see BANNED_VERDICT_WORDS).
 *
 * Breaking changes to verdict semantics require a new schema version.
 */

export const SCHEMA_VERSION = '2026-10-15' as const;

export const DISCLAIMER =
  'Verdicts describe whether the supplied passages support each claim. They do not establish whether any claim is true in the world.' as const;

/** The one-line form used on result pages and the benchmark. */
export const DISCLAIMER_SHORT = 'Supported means supported by the supplied evidence, not true in the world.' as const;

export const VERDICTS = ['supported', 'contradicted', 'unsupported', 'unverifiable'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const FAILURE_REASONS = [
  // unsupported
  'qualifier_loss',
  'no_supporting_span',
  'unsupported_detail',
  'unverified_contradiction',
  // contradicted
  'number_mismatch',
  'date_mismatch',
  'entity_mismatch',
  'negation',
  'condition_mismatch',
  'arithmetic_error',
  'superseded',
  // unverifiable
  'comparative',
  'out_of_scope',
  'conflicting_sources',
  'model_abstained',
  'cost_ceiling',
  'deadline',
  'provider_error',
  'deliberation_disagreement',
  // Code-only runs (CI regression gate, benchmark baselines): no adjudicator was configured.
  'not_adjudicated',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const RELEASE_RECOMMENDATIONS = ['allow', 'cite_required', 'revise', 'human_review'] as const;
export type ReleaseRecommendation = (typeof RELEASE_RECOMMENDATIONS)[number];

export const OVERALL_STATUSES = ['all_supported', 'issues_found', 'insufficient_sources', 'partial'] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export const RESOLVED_BY = ['code', 'model', 'deliberation'] as const;
export type ResolvedBy = (typeof RESOLVED_BY)[number];

export const QUALIFIER_TYPES = [
  'date',
  'time_range',
  'entity',
  'quantity',
  'condition',
  'scope',
  'modality',
  'negation',
] as const;
export type QualifierType = (typeof QUALIFIER_TYPES)[number];

export const QUALIFIER_STATUSES = ['preserved', 'dropped', 'contradicted', 'ambiguous'] as const;
export type QualifierStatus = (typeof QUALIFIER_STATUSES)[number];

export const MATCH_TYPES = ['exact', 'normalized', 'punctuation_tolerant'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const CLAIM_TYPES = ['factual', 'numeric', 'procedural', 'comparative', 'opinion', 'temporal'] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

/**
 * Words that must never appear as a verdict, status, or recommendation, and
 * never as a label in verdict UI copy. Enforced by a build-failing test.
 */
export const BANNED_VERDICT_WORDS = ['true', 'correct', 'verified correct', 'accurate', 'safe'] as const;

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface SourceInput {
  id: string;
  title?: string;
  /** Passage text. Required in v1: sources are text only. */
  text: string;
  /** Metadata only. Never fetched in v1. */
  url?: string;
  /** ISO 8601. Used to prefer a newer passage over a superseded one. */
  retrieved_at?: string;
}

export interface ReleaseThresholds {
  /** Unverifiable material claims tolerated before human_review. Default 0. */
  max_unverifiable?: number;
  /** Unsupported (non-qualifier-loss) material claims tolerated before revise. Default 0. */
  max_unsupported?: number;
}

export interface VerifyOptions {
  require_citations?: boolean;
  thresholds?: ReleaseThresholds;
}

export interface VerifyRequestBody {
  question: string;
  answer: string;
  sources: SourceInput[];
  options?: VerifyOptions;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface QualifierRow {
  type: QualifierType;
  /** Text of the qualifier as it appears in the claim, or null when absent there. */
  claim_text: string | null;
  /** Text as it appears in the source context, or null when absent there. */
  source_text: string | null;
  status: QualifierStatus;
  material: boolean;
  /** Why the status was assigned, in a few words. */
  note: string;
  /** Who proposed it: rules in code, or a model (always compared in code). */
  proposed_by: 'code' | 'model';
}

export interface DeterministicCheck {
  kind: 'span_match' | 'number' | 'date' | 'arithmetic' | 'date_math' | 'negation' | 'qualifiers' | 'recency' | 'citation';
  result: 'pass' | 'fail' | 'inconclusive';
  detail: string;
}

export interface Span {
  source_id: string;
  /** Character offsets into the ORIGINAL source text, end exclusive. */
  start: number;
  end: number;
  /** Exactly source.text.slice(start, end). */
  quote: string;
  match_type: MatchType;
  edit_distance: number;
  role: 'supports' | 'conflicts' | 'qualifies';
  /** sha256 of the full source text, so the span can be checked against the original later. */
  source_hash: string;
}

export interface Provenance {
  spans: Span[];
  /** The sentence(s) around the primary span, as offsets, for context display. */
  context: { source_id: string; start: number; end: number } | null;
  qualifiers: QualifierRow[];
  checks: DeterministicCheck[];
  rule_id: string;
  model_used: boolean;
  models: string[];
  prompt_versions: string[];
  /** Model-proposed quotes that did not exist in the source and were discarded. */
  discarded_quotes: number;
}

export interface ClaimResult {
  index: number;
  text: string;
  claim_type: ClaimType;
  material: boolean;
  /** Where the claim sits in the answer, for highlighting. Null if it could not be aligned. */
  answer_start: number | null;
  answer_end: number | null;
  verdict: Verdict;
  failure_reason: FailureReason | null;
  resolved_by: ResolvedBy;
  /** Null until calibration exists. Never a probability of truth. */
  calibrated_confidence: number | null;
  calibration_label: string | null;
  citation: { cited: string[]; status: 'ok' | 'missing' | 'mismatch' | 'not_required' };
  provenance: Provenance;
}

export interface VerdictCounts {
  supported: number;
  contradicted: number;
  unsupported: number;
  unverifiable: number;
}

export interface CostLine {
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

export interface VerifyResponseBody {
  schema_version: typeof SCHEMA_VERSION;
  request_id: string;
  evidence_ledger_id: string | null;
  status: 'completed' | 'partial' | 'failed';
  overall_status: OverallStatus;
  release_recommendation: ReleaseRecommendation;
  release_reasons: string[];
  partial_reasons: string[];
  counts: VerdictCounts & { total: number; resolved_by_code: number };
  claims: ClaimResult[];
  rejected_claims: { text: string; reason: string }[];
  material_unsupported_claims: number[];
  qualifier_loss_detected: boolean;
  billable_units: number;
  provider_cost_breakdown: CostLine[];
  versions: VersionInfo;
  disclaimer: typeof DISCLAIMER;
  created_at: string;
}

export interface VersionInfo {
  schema: typeof SCHEMA_VERSION;
  core: string;
  extraction_prompt: string;
  adjudication_prompt: string;
  rules: string;
  calibration: string | null;
}

export const CORE_VERSION = '1.0.0' as const;
export { RULES_VERSION } from './rules-version';
