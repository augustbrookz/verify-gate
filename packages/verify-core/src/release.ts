/**
 * Release recommendation and overall status: deterministic rules over the
 * per-claim verdicts. Published in the docs exactly as written here.
 *
 *   revise        any material claim contradicted, any qualifier loss, or more
 *                 unsupported material claims than thresholds.max_unsupported (0)
 *   human_review  results are partial, or more unverifiable material claims
 *                 than thresholds.max_unverifiable (0)
 *   cite_required every material claim is supported, but citations were
 *                 required and at least one is missing or points elsewhere
 *   allow         every material claim is supported (and cited, if required)
 *
 * Precedence: revise > human_review > cite_required > allow. A known problem
 * outranks an unknown one, so a partial result with a contradiction is
 * "revise", with the partial reason still listed.
 */
import type { ClaimResult, OverallStatus, ReleaseRecommendation, ReleaseThresholds, VerdictCounts } from './contract';

export interface ReleaseInput {
  claims: Pick<ClaimResult, 'index' | 'verdict' | 'failure_reason' | 'material' | 'citation'>[];
  partial: boolean;
  requireCitations: boolean;
  thresholds?: ReleaseThresholds;
  /** No usable sources were supplied (empty, or all empty text). */
  noSources?: boolean;
}

export interface ReleaseOutcome {
  release_recommendation: ReleaseRecommendation;
  release_reasons: string[];
  overall_status: OverallStatus;
  counts: VerdictCounts & { total: number };
  material_unsupported_claims: number[];
  qualifier_loss_detected: boolean;
}

export function countVerdicts(claims: Pick<ClaimResult, 'verdict'>[]): VerdictCounts & { total: number } {
  const counts = { supported: 0, contradicted: 0, unsupported: 0, unverifiable: 0, total: claims.length };
  for (const c of claims) counts[c.verdict]++;
  return counts;
}

export function decideRelease(input: ReleaseInput): ReleaseOutcome {
  const maxUnsupported = Math.max(0, input.thresholds?.max_unsupported ?? 0);
  const maxUnverifiable = Math.max(0, input.thresholds?.max_unverifiable ?? 0);
  const material = input.claims.filter((c) => c.material);
  const counts = countVerdicts(input.claims);
  const contradicted = material.filter((c) => c.verdict === 'contradicted');
  const qualifierLoss = material.filter((c) => c.verdict === 'unsupported' && c.failure_reason === 'qualifier_loss');
  const unsupported = material.filter((c) => c.verdict === 'unsupported' && c.failure_reason !== 'qualifier_loss');
  const unverifiable = material.filter((c) => c.verdict === 'unverifiable');
  const citationProblems = material.filter(
    (c) => c.verdict === 'supported' && (c.citation.status === 'missing' || c.citation.status === 'mismatch'),
  );

  const reasons: string[] = [];
  let rec: ReleaseRecommendation = 'allow';
  if (contradicted.length) reasons.push(`${contradicted.length} claim(s) contradicted by the supplied passages`);
  if (qualifierLoss.length) reasons.push(`${qualifierLoss.length} claim(s) drop a material qualifier stated in the passages`);
  if (unsupported.length > maxUnsupported) reasons.push(`${unsupported.length} claim(s) not supported by the supplied passages`);
  if (reasons.length) {
    rec = 'revise';
  } else if (input.partial || unverifiable.length > maxUnverifiable) {
    rec = 'human_review';
    if (input.partial) reasons.push('results are partial; some claims could not be checked');
    if (unverifiable.length > maxUnverifiable) reasons.push(`${unverifiable.length} claim(s) cannot be resolved from the supplied passages`);
  } else if (input.requireCitations && citationProblems.length) {
    rec = 'cite_required';
    reasons.push(`${citationProblems.length} supported claim(s) lack a citation to the passage that supports them`);
  } else if (material.length === 0) {
    rec = 'human_review';
    reasons.push('the answer contains no checkable claims');
  } else if (unsupported.length || unverifiable.length) {
    reasons.push(
      `within thresholds: ${unsupported.length} unsupported and ${unverifiable.length} unverifiable claim(s) tolerated (max_unsupported ${maxUnsupported}, max_unverifiable ${maxUnverifiable})`,
    );
  } else {
    reasons.push('every material claim is supported by the supplied passages');
  }
  if (input.partial && rec === 'revise') reasons.push('results are partial; some claims could not be checked');

  let overall: OverallStatus;
  if (input.partial) overall = 'partial';
  else if (contradicted.length || qualifierLoss.length || unsupported.length || unverifiable.length) {
    const anySupport = material.some((c) => c.verdict === 'supported' || c.verdict === 'contradicted' || c.failure_reason === 'qualifier_loss');
    overall = input.noSources || (!anySupport && material.length > 0) ? 'insufficient_sources' : 'issues_found';
  } else if (material.length === 0) overall = 'issues_found';
  else overall = 'all_supported';

  return {
    release_recommendation: rec,
    release_reasons: reasons,
    overall_status: overall,
    counts,
    material_unsupported_claims: material.filter((c) => c.verdict === 'unsupported').map((c) => c.index),
    qualifier_loss_detected: qualifierLoss.length > 0,
  };
}
