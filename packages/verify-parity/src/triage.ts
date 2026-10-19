/**
 * Use 2, disagreement triage: when verifier runs or models disagree, first
 * check whether they saw identical source snapshots.
 *
 *   different inputs  an infrastructure fault (a stale cache, a source read at
 *                     another version, a truncated payload): route REEVAL, so
 *                     the runs are repeated on one snapshot
 *   identical inputs  a genuine disagreement: route per policy (default
 *                     human_review)
 *
 * Inputs are compared by each source's snapshot parity hash; a source one run
 * has and another lacks is a mismatch. Pure and deterministic.
 */
export type TriageRoute = 'NONE' | 'REEVAL' | 'human_review' | 'block' | 'warn';

export interface VerifierRun {
  run_id: string;
  /** The verdict or decision the run reached. */
  outcome: string;
  /** Source id → the parity_sha256 of the snapshot the run saw. */
  sources: Record<string, string>;
}

export interface TriagePolicy {
  genuine_disagreement: Exclude<TriageRoute, 'NONE' | 'REEVAL'>;
}

export const DEFAULT_TRIAGE_POLICY: TriagePolicy = { genuine_disagreement: 'human_review' };

export interface TriageResult {
  kind: 'agreement' | 'infrastructure_fault' | 'genuine_disagreement';
  route: TriageRoute;
  outcomes: string[];
  mismatched_sources: { source_id: string; hashes: Record<string, string | null> }[];
  explanation: string;
}

export function triageDisagreement(runs: VerifierRun[], policy: TriagePolicy = DEFAULT_TRIAGE_POLICY): TriageResult {
  if (runs.length < 2) throw new Error('triage needs at least two runs');
  const outcomes = [...new Set(runs.map((r) => r.outcome))].sort();
  const ids = [...new Set(runs.flatMap((r) => Object.keys(r.sources)))].sort();
  const mismatched_sources = ids
    .map((id) => ({ source_id: id, hashes: Object.fromEntries(runs.map((r) => [r.run_id, r.sources[id] ?? null])) as Record<string, string | null> }))
    .filter((m) => new Set(Object.values(m.hashes)).size > 1);
  if (outcomes.length === 1) return { kind: 'agreement', route: 'NONE', outcomes, mismatched_sources, explanation: 'the runs agree' };
  if (mismatched_sources.length) {
    return { kind: 'infrastructure_fault', route: 'REEVAL', outcomes, mismatched_sources, explanation: `the runs disagree and did not see the same source snapshots (${mismatched_sources.map((m) => m.source_id).join(', ')}): re-evaluate on one snapshot` };
  }
  return { kind: 'genuine_disagreement', route: policy.genuine_disagreement, outcomes, mismatched_sources, explanation: `the runs saw identical source snapshots and still disagree: ${policy.genuine_disagreement.replace('_', ' ')}` };
}
