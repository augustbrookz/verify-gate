/**
 * The version of Verify's verification rules, prompts and default thresholds.
 *
 * Semver. Any change to a file listed in rules-manifest.json (the rule code,
 * the prompts, the default thresholds) needs a new version here AND an entry
 * in rules-changelog.json saying what changed, why, and what it did to the
 * held-out benchmark. tests/verify/rules-version.test.ts fails the build
 * otherwise.
 *
 *   major  a verdict can flip in a direction that releases more answers
 *   minor  a rule is added or tightened; verdicts can change
 *   patch  wording, reasons or provenance change; verdicts cannot
 *
 * The version is stamped on every ledger entry inside the hashed payload, so
 * an entry's rules version cannot be changed without breaking its hash.
 *
 * This file is deliberately NOT in the manifest: bumping the version must not
 * itself count as a rule change.
 */
export const RULES_VERSION = '2.1.0' as const;

/**
 * Version of the source-freshness reporting rules (the freshness track). Kept
 * apart from RULES_VERSION because freshness never changes a verdict: with the
 * freshness flag off a Verify response is byte-identical, version included.
 */
export const FRESHNESS_VERSION = '0.1.0' as const;

/** How the same rules were labelled before semver (ledger entries written before 1.0.0 carry this). */
export const RULES_VERSION_LEGACY_LABELS: Record<string, string> = { 'rules-2026-10-15': '1.0.0' };

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemver(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`not semver: ${!pa ? a : b}`);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** A ledger entry's rules version in semver, whichever label it was written with. */
export function normalizeRulesVersion(label: string): string {
  return RULES_VERSION_LEGACY_LABELS[label] ?? label;
}
