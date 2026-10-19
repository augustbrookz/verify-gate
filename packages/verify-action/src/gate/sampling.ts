/**
 * Large suites: max_cases_per_run and sample_rate pick a deterministic subset
 * per commit (the same commit always checks the same cases), with a full run
 * on schedule (nightly) or when asked. Selection is by SHA-256 of
 * commit + suite + case, never random.
 */
import { createHash } from 'node:crypto';

export function selectCases<T extends { suite: string; id: string }>(cases: T[], o: { max_cases_per_run: number | null; sample_rate: number | null; seed: string; full_run: boolean }): T[] {
  if (o.full_run || (o.max_cases_per_run === null && o.sample_rate === null)) return cases;
  const ranked = cases
    .map((c) => ({ c, r: parseInt(createHash('sha256').update(`${o.seed}|${c.suite}|${c.id}`).digest('hex').slice(0, 8), 16) / 0x100000000 }))
    .filter((x) => o.sample_rate === null || x.r < o.sample_rate)
    .sort((a, b) => a.r - b.r);
  const picked = new Set((o.max_cases_per_run === null ? ranked : ranked.slice(0, o.max_cases_per_run)).map((x) => x.c));
  // Keep the golden set's order in the report.
  return cases.filter((c) => picked.has(c));
}

/**
 * Estimated monthly units in hosted mode: each case is one Verify check (an
 * answer of up to 25 claims), so a pull-request run costs the selected cases
 * not served from cache, plus a nightly full run when the suite is sampled.
 * Local mode costs nothing.
 */
export function estimateMonthlyUnits(o: { cases_per_pr_run: number; full_suite_cases: number; prs_per_day: number | null; nightly_full_run: boolean; cache_hit_rate?: number }): number {
  const prs = o.prs_per_day ?? 10;
  const fresh = 1 - Math.min(1, Math.max(0, o.cache_hit_rate ?? 0));
  return Math.round(o.cases_per_pr_run * fresh * prs * 30 + (o.nightly_full_run ? o.full_suite_cases * 30 : 0));
}
