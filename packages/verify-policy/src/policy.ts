/**
 * The Verify Gate release policy. Rules, never a model, turn claim results
 * into a decision.
 *
 *   hold   the check could not complete (XYN-006). Never converted to pass;
 *          never overridable; outranks block, because a run that could not
 *          finish cannot be trusted to have found every problem.
 *   block  a defined release condition failed: a material contradiction
 *          (XYN-001), a material dropped or conflicting qualifier (XYN-002),
 *          a critical/high unsupported claim (XYN-003), a missing required
 *          citation on a material claim (XYN-004) — subject to the thresholds.
 *   warn   needs attention, policy allows the merge: non-material or
 *          within-threshold findings, unresolved claims (XYN-005), and any
 *          block-level finding that depends on a model judgement while
 *          policy.model_findings is "warn" (the default).
 *   pass   nothing above.
 *
 * Precedence: hold > block > warn > pass. Deterministic: findings are
 * sorted, and identical input always yields an identical decision.
 */
import type { QualifierType } from '@xyntherium/verify-core';
import type { GateClaim } from './claims';
import { isMaterial, type GateDecision, type GatePolicy, type Materiality } from './defaults';
import type { RuleId } from './taxonomy';

export const DECISION_RANK: Record<GateDecision, number> = { pass: 0, warn: 1, block: 2, hold: 3 };

export function worst(decisions: GateDecision[]): GateDecision {
  return decisions.reduce<GateDecision>((a, b) => (DECISION_RANK[b] > DECISION_RANK[a] ? b : a), 'pass');
}

export type IntegrityKind =
  | 'source_hash_mismatch'
  | 'source_missing'
  | 'endpoint_timeout'
  | 'endpoint_error'
  | 'verifier_error'
  | 'verifier_unavailable'
  | 'quota_exhausted'
  | 'excessive_unresolved'
  | 'answer_missing';

export interface IntegrityIssue {
  kind: IntegrityKind;
  detail: string;
  source_id?: string;
}

export interface Finding {
  rule: RuleId;
  level: 'claim' | 'case';
  claim_index: number | null;
  materiality: Materiality | null;
  /** Reproduces identically: decided in code from valid spans. */
  deterministic: boolean;
  kind: string;
  reason: string;
  qualifier_type: QualifierType | null;
  verdict: string | null;
  decision: GateDecision;
  /** Set when a block-level finding was reported as warn because it depends on a model. */
  downgraded: string | null;
}

export interface CaseDecision {
  decision: GateDecision;
  findings: Finding[];
  reasons: string[];
  counts: {
    claims: number;
    material: number;
    supported_material: number;
    deterministic_findings: number;
    model_findings: number;
  };
}

type Raw = Omit<Finding, 'decision' | 'downgraded'>;

function firstQualifier(c: GateClaim, statuses: string[]): QualifierType | null {
  const q = c.qualifier_checks.find((x) => x.material && statuses.includes(x.status));
  return q?.type ?? null;
}

/** What is wrong with one claim, before the policy assigns decisions. */
export function rawFindings(c: GateClaim): Raw[] {
  const base = { level: 'claim' as const, claim_index: c.index, materiality: c.materiality, verdict: c.verdict };
  const out: Raw[] = [];
  if (!c.present_in_answer) {
    out.push({ ...base, rule: 'XYN-003', kind: 'expected_claim_missing', deterministic: true, reason: 'the answer no longer makes this expected claim', qualifier_type: null });
    return out;
  }
  switch (c.verdict) {
    case 'contradicted':
      if (c.failure_reason === 'condition_mismatch') {
        out.push({ ...base, rule: 'XYN-002', kind: 'conflicting_qualifier', deterministic: c.deterministic, reason: 'a condition in the claim conflicts with the source', qualifier_type: firstQualifier(c, ['conflicting']) ?? 'condition' });
      } else {
        out.push({ ...base, rule: 'XYN-001', kind: c.failure_reason ?? 'contradicted', deterministic: c.deterministic, reason: `contradicted by a source passage (${c.failure_reason ?? 'conflict'})`, qualifier_type: null });
      }
      break;
    case 'unsupported':
      if (c.failure_reason === 'qualifier_loss') {
        const conflicting = c.qualifier_checks.some((q) => q.material && q.status === 'conflicting');
        out.push({
          ...base,
          rule: 'XYN-002',
          kind: conflicting ? 'conflicting_qualifier' : 'dropped_qualifier',
          deterministic: c.deterministic,
          reason: conflicting ? 'the claim conflicts with a qualifier the source states' : 'the claim drops a material qualifier the source states',
          qualifier_type: firstQualifier(c, ['missing', 'conflicting']),
        });
      } else {
        const invented = c.discarded_quotes > 0;
        out.push({
          ...base,
          rule: 'XYN-003',
          kind: invented ? 'invented_quote' : (c.failure_reason ?? 'unsupported'),
          deterministic: c.deterministic,
          reason: invented ? 'no supporting span; a model-proposed quote was not in the source and was discarded' : 'no supplied source supports the claim',
          qualifier_type: null,
        });
      }
      break;
    case 'unverifiable': {
      const infra = c.failure_reason === 'cost_ceiling' || c.failure_reason === 'deadline' || c.failure_reason === 'provider_error';
      out.push({
        ...base,
        rule: infra ? 'XYN-006' : 'XYN-005',
        kind: c.failure_reason ?? 'unverifiable',
        deterministic: c.deterministic,
        reason: infra
          ? `the verifier could not check this claim (${c.failure_reason})`
          : c.failure_reason === 'not_adjudicated'
            ? 'code could not settle this claim and no verifier model was used (local mode)'
            : `the sources cannot resolve this claim (${c.failure_reason ?? 'unverifiable'})`,
        qualifier_type: null,
      });
      break;
    }
    default:
      break;
  }
  // A missing marker is a fact code reads off the answer. A wrong citation says
  // the cited passage does not support the claim, which is known only once the
  // claim is decided, and only as surely as that decision: an unresolved claim's
  // citation is not judged (its XYN-005 says why), and a model-decided one
  // inherits the model's uncertainty (0.2.0).
  const wrongCitation = c.citation.status === 'mismatch' && c.verdict !== 'unverifiable';
  if (c.citation.required && (c.citation.status === 'missing' || wrongCitation)) {
    out.push({
      ...base,
      rule: 'XYN-004',
      kind: c.citation.status === 'missing' ? 'missing_citation' : 'wrong_citation',
      deterministic: c.citation.status === 'missing' ? true : c.deterministic,
      reason: c.citation.status === 'missing' ? 'citations are required and this claim has none' : 'the claim cites a passage that does not support it',
      qualifier_type: null,
    });
  }
  return out;
}

const INTEGRITY_REASON: Record<IntegrityKind, string> = {
  source_hash_mismatch: 'a source file no longer matches its recorded sha256',
  source_missing: 'a source file named in the golden set is missing or empty',
  endpoint_timeout: 'the application endpoint timed out past the retry policy',
  endpoint_error: 'the application endpoint failed past the retry policy',
  verifier_error: 'the verifier returned an error',
  verifier_unavailable: 'the verifier was unavailable',
  quota_exhausted: 'the Verify quota is exhausted',
  excessive_unresolved: 'too many material claims stayed unresolved',
  answer_missing: 'no answer to check',
};

function decide(f: Raw, counts: Map<string, number>, c: GateClaim | null, p: GatePolicy): { decision: GateDecision; downgraded: string | null } {
  const m = f.materiality;
  let d: GateDecision;
  switch (f.rule) {
    case 'XYN-006':
      return { decision: 'hold', downgraded: null };
    case 'XYN-001': {
      const limit = m ? p.max_contradicted[m] : undefined;
      d = limit !== undefined && (counts.get(`001:${m}`) ?? 0) > limit ? 'block' : 'warn';
      break;
    }
    case 'XYN-002':
      d = p.fail_on_material_qualifier_loss && m !== null && isMaterial(m) ? 'block' : 'warn';
      break;
    case 'XYN-003': {
      if (f.kind === 'material_supported_ratio') {
        d = 'block';
        break;
      }
      if (f.kind === 'expected_claim_missing') {
        d = p.missing_expected_claim === 'block' && m !== null && isMaterial(m) ? 'block' : 'warn';
        break;
      }
      const limit = m ? p.max_unsupported[m] : undefined;
      d = limit !== undefined && (counts.get(`003:${m}`) ?? 0) > limit ? 'block' : 'warn';
      break;
    }
    case 'XYN-004':
      d = (p.require_citations || !!c?.citation.required) && m !== null && isMaterial(m) ? 'block' : 'warn';
      break;
    case 'XYN-005':
      d = p.treat_unverifiable_as;
      if (d === 'hold') return { decision: 'hold', downgraded: null };
      break;
    default:
      d = 'warn';
  }
  if (d === 'block' && !f.deterministic && p.model_findings === 'warn') {
    return { decision: 'warn', downgraded: 'depends on a model judgement; blocks only with policy.model_findings: block' };
  }
  return { decision: d, downgraded: null };
}

function sortKey(f: Finding): string {
  return `${String(f.claim_index ?? -1).padStart(5, '0')}|${f.rule}|${f.kind}|${f.qualifier_type ?? ''}`;
}

/** Unverifiable reasons that are a classification of the claim or its sources, not an undecided check. */
export const CLASSIFIED_UNVERIFIABLE = ['comparative', 'out_of_scope', 'conflicting_sources'] as const;

/**
 * Decide one case. `mode` matters only for the unresolved-claims hold: in
 * local mode nothing adjudicates, so claims code could not settle are
 * expected and warn rather than hold.
 */
export function evaluateCase(input: { claims: GateClaim[]; integrity: IntegrityIssue[]; policy: GatePolicy; mode: 'local' | 'hosted' }): CaseDecision {
  const { claims, integrity, policy: p, mode } = input;
  const raws: { f: Raw; c: GateClaim | null }[] = [];
  for (const c of claims) for (const f of rawFindings(c)) raws.push({ f, c });
  for (const i of integrity) {
    raws.push({
      f: { rule: 'XYN-006', level: 'case', claim_index: null, materiality: null, deterministic: true, kind: i.kind, reason: `${INTEGRITY_REASON[i.kind]}${i.detail ? `: ${i.detail}` : ''}`, qualifier_type: null, verdict: null },
      c: null,
    });
  }

  const material = claims.filter((c) => isMaterial(c.materiality));
  const supportedMaterial = material.filter((c) => c.present_in_answer && c.verdict === 'supported');
  if (p.min_material_supported_ratio !== null && material.length > 0 && supportedMaterial.length / material.length < p.min_material_supported_ratio) {
    raws.push({
      f: {
        rule: 'XYN-003',
        level: 'case',
        claim_index: null,
        materiality: 'high',
        deterministic: material.every((c) => c.deterministic),
        kind: 'material_supported_ratio',
        reason: `${supportedMaterial.length} of ${material.length} material claims supported, below min_material_supported_ratio ${p.min_material_supported_ratio}`,
        qualifier_type: null,
        verdict: null,
      },
      c: null,
    });
  }
  if (mode === 'hosted' && material.length > 0) {
    // Claims the verifier tried and could not decide. A claim it classified (a
    // comparison or a topic the sources do not cover, or sources that disagree)
    // was resolved as XYN-005, not left undecided: one such sentence is a
    // warning, not a check that could not complete (0.2.0).
    const tried = material.filter((c) => c.verdict === 'unverifiable' && c.resolved_by !== 'code' && !['not_adjudicated', ...CLASSIFIED_UNVERIFIABLE].includes(c.failure_reason ?? ''));
    if (tried.length / material.length > p.max_unresolved_ratio) {
      raws.push({
        f: { rule: 'XYN-006', level: 'case', claim_index: null, materiality: null, deterministic: false, kind: 'excessive_unresolved', reason: `${INTEGRITY_REASON.excessive_unresolved}: ${tried.length} of ${material.length} (max_unresolved_ratio ${p.max_unresolved_ratio})`, qualifier_type: null, verdict: null },
        c: null,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const { f } of raws) {
    if (f.level !== 'claim' || !f.materiality) continue;
    if (f.rule === 'XYN-001') counts.set(`001:${f.materiality}`, (counts.get(`001:${f.materiality}`) ?? 0) + 1);
    if (f.rule === 'XYN-003') counts.set(`003:${f.materiality}`, (counts.get(`003:${f.materiality}`) ?? 0) + 1);
  }
  const findings: Finding[] = raws.map(({ f, c }) => ({ ...f, ...decide(f, counts, c, p) })).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  const decision = worst(findings.map((f) => f.decision));
  const reasons: string[] = [];
  const by = (d: GateDecision) => findings.filter((f) => f.decision === d);
  if (by('hold').length) reasons.push(`hold: ${[...new Set(by('hold').map((f) => f.reason))].join('; ')}`);
  if (by('block').length) reasons.push(`block: ${by('block').length} finding(s) — ${[...new Set(by('block').map((f) => f.rule))].join(', ')}`);
  if (by('warn').length) reasons.push(`warn: ${by('warn').length} finding(s)`);
  if (!reasons.length) reasons.push('every material claim is supported by the supplied sources and no threshold is exceeded');
  return {
    decision,
    findings,
    reasons,
    counts: {
      claims: claims.length,
      material: material.length,
      supported_material: supportedMaterial.length,
      deterministic_findings: findings.filter((f) => f.deterministic).length,
      model_findings: findings.filter((f) => !f.deterministic).length,
    },
  };
}

export interface RunOutcome {
  decision: GateDecision;
  exit_code: 0 | 1;
  conclusion: 'success' | 'neutral' | 'failure';
  title: string;
}

export interface OverrideRecord {
  actor: string;
  reason: string;
  timestamp: string;
  overridden_claims: { suite: string; case_id: string; claim_index: number | null; rule: RuleId }[];
}

/**
 * Exit code and check conclusion. report_only never fails the job. A block
 * with a valid override concludes "neutral" and says who overrode it. A hold
 * fails the job only when fail_on includes hold, and is never "success".
 */
export function runOutcome(decision: GateDecision, o: { enforcement: GatePolicy['enforcement']; fail_on: ReadonlyArray<'block' | 'hold' | 'warn'>; override: OverrideRecord | null }): RunOutcome {
  if (decision === 'block' && o.override) {
    return { decision, exit_code: 0, conclusion: 'neutral', title: `Overridden by ${o.override.actor}` };
  }
  if (o.enforcement === 'report_only') {
    const title = decision === 'block' ? 'report-only: would block' : decision === 'hold' ? 'hold: the check could not complete (report-only)' : decision;
    return { decision, exit_code: 0, conclusion: decision === 'pass' || decision === 'warn' ? 'success' : 'neutral', title };
  }
  if (decision === 'block') return o.fail_on.includes('block') ? { decision, exit_code: 1, conclusion: 'failure', title: 'block' } : { decision, exit_code: 0, conclusion: 'neutral', title: 'block (fail-on excludes block)' };
  if (decision === 'hold') return o.fail_on.includes('hold') ? { decision, exit_code: 1, conclusion: 'failure', title: 'hold: the check could not complete' } : { decision, exit_code: 0, conclusion: 'neutral', title: 'hold: the check could not complete' };
  if (decision === 'warn') return o.fail_on.includes('warn') ? { decision, exit_code: 1, conclusion: 'failure', title: 'warn' } : { decision, exit_code: 0, conclusion: 'success', title: 'warn' };
  return { decision, exit_code: 0, conclusion: 'success', title: 'pass' };
}

export type OverrideCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether an override request is valid. Pure: the Action gathers the facts
 * (who applied the label, who wrote the comment, their permission, their teams).
 */
export function checkOverride(o: {
  decision: GateDecision;
  policy: GatePolicy;
  label_applied_by: string | null;
  label_applier_permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none' | null;
  comment_author: string | null;
  comment_author_permission: 'admin' | 'maintain' | 'write' | 'triage' | 'read' | 'none' | null;
  reason: string | null;
  author_teams: string[];
}): OverrideCheck {
  if (o.decision === 'hold') return { ok: false, error: 'a hold cannot be overridden; fix the cause and re-run' };
  if (o.decision !== 'block') return { ok: false, error: `nothing to override (decision is ${o.decision})` };
  if (!o.policy.overrides.enabled) return { ok: false, error: 'overrides are disabled for this repository (policy.overrides.enabled: false)' };
  const writes = (p: string | null) => p === 'admin' || p === 'maintain' || p === 'write';
  if (!o.label_applied_by || !writes(o.label_applier_permission)) return { ok: false, error: `the "${o.policy.overrides.label}" label must be applied by someone with write access` };
  if (!o.comment_author || !writes(o.comment_author_permission)) return { ok: false, error: 'the /verify-override comment must come from someone with write access' };
  if (!o.reason || o.reason.trim().length < 10) return { ok: false, error: 'an override needs a reason: comment "/verify-override <reason>" (at least 10 characters)' };
  if (o.policy.overrides.require_team && !o.author_teams.includes(o.policy.overrides.require_team)) {
    return { ok: false, error: `overrides require membership of ${o.policy.overrides.require_team}` };
  }
  return { ok: true };
}

/** Parse "/verify-override <reason>" from a comment body. */
export function parseOverrideComment(body: string): string | null {
  const m = /^\s*\/verify-override\s+(.+?)\s*$/m.exec(body ?? '');
  return m ? m[1].slice(0, 2000) : null;
}
