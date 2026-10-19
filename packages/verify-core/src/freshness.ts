/**
 * Source freshness, v0: is the dating of the source a claim relies on
 * established, unknown, or conflicted by a newer supplied source?
 *
 * Reported SEPARATELY from support and never folded into it. A claim can be
 * supported by an older passage AND conflicted_by_newer_source at the same
 * time; the support verdict, its spans, its qualifier results and the release
 * recommendation are exactly what they would be without this module.
 *
 * Inputs are only what the caller supplies: effective_date, published_at,
 * version, supersedes[] and authority_rank on each source. A newer source is
 * NOT presumed to control an older one. It controls only when it lists the
 * cited source in `supersedes`, or when authority_rank says so (a newer
 * "primary" source over a "secondary" one).
 *
 *   established                the cited source is dated or versioned, and no
 *                              controlling newer source states something different
 *   unknown                    the cited source carries no date or version, or a
 *                              newer source differs but nothing says it controls,
 *                              or code cannot tell whether it agrees
 *   conflicted_by_newer_source a controlling newer source states a different value,
 *                              polarity or modality for the same statement
 *
 * Release effect (recommended_release, never the response's own
 * release_recommendation): conflicted → human_review; unknown → reported only,
 * unless require_dated_sources is set.
 */
import type { ClaimResult, SourceInput } from './contract';
import { FRESHNESS_VERSION } from './rules-version';
import { templateMatches } from './templates';

export type FreshnessStatus = 'established' | 'unknown' | 'conflicted_by_newer_source';
export type FreshnessConflict = 'number' | 'date' | 'negation' | 'modality';

export interface FreshnessFields {
  effective_date?: string;
  published_at?: string;
  version?: string;
  supersedes?: string[];
  authority_rank?: 'primary' | 'secondary';
}

export type DatedSource = SourceInput & FreshnessFields;

export interface ClaimFreshness {
  claim_index: number;
  status: FreshnessStatus;
  cited_source_id: string | null;
  newer_source_id: string | null;
  conflict_type: FreshnessConflict | null;
  explanation: string;
}

export interface FreshnessReport {
  version: typeof FRESHNESS_VERSION;
  status: FreshnessStatus;
  cited_source_id: string | null;
  newer_source_id: string | null;
  conflict_type: FreshnessConflict | null;
  explanation: string;
  claims: ClaimFreshness[];
  sources: { id: string; dated: boolean; effective_date: string | null; published_at: string | null; version: string | null; supersedes: string[]; authority_rank: 'primary' | 'secondary' | null }[];
  recommended_release: 'human_review' | null;
  note: string;
}

export const FRESHNESS_NOTE =
  'Freshness describes only the dates, versions and supersession the caller supplied with each source. It is reported separately from support and never changes a verdict.' as const;

/** Words freshness output must never use: it describes supplied dates, not standing. */
export const FRESHNESS_BANNED_WORDS = ['current', 'valid', 'authoritative'] as const;

const RANK: Record<FreshnessStatus, number> = { established: 0, unknown: 1, conflicted_by_newer_source: 2 };

function day(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function versionParts(v: string | undefined): number[] | null {
  if (!v) return null;
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(v.trim());
  return m ? m[1].split('.').map(Number) : null;
}

/** 1 if a is newer than b, -1 if older, 0 if equal, null if the inputs cannot say. */
export function newerThan(a: DatedSource, b: DatedSource): 1 | -1 | 0 | null {
  const da = day(a.effective_date) ?? day(a.published_at);
  const db = day(b.effective_date) ?? day(b.published_at);
  if (da !== null && db !== null) return da > db ? 1 : da < db ? -1 : 0;
  const va = versionParts(a.version);
  const vb = versionParts(b.version);
  if (va && vb) {
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const x = va[i] ?? 0;
      const y = vb[i] ?? 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  return null;
}

function dated(s: DatedSource): boolean {
  return day(s.effective_date) !== null || day(s.published_at) !== null || versionParts(s.version) !== null || !!s.version?.trim();
}

/** Whether `newer` controls `cited`: it says it supersedes it, or it outranks it and is newer. */
function controls(newer: DatedSource, cited: DatedSource): boolean {
  if ((newer.supersedes ?? []).includes(cited.id)) return true;
  return newer.authority_rank === 'primary' && cited.authority_rank === 'secondary' && newerThan(newer, cited) === 1;
}

function conflictWith(claim: string, s: DatedSource): FreshnessConflict | null {
  for (const m of templateMatches(claim, [s])) {
    const c = m.conflicts[0];
    if (c) return c.kind;
  }
  return null;
}

function agreesWith(claim: string, s: DatedSource): boolean {
  return templateMatches(claim, [s]).some((m) => m.conflicts.length === 0 && !m.modal_mismatch);
}

export function claimFreshness(c: Pick<ClaimResult, 'index' | 'text' | 'provenance'>, sources: DatedSource[]): ClaimFreshness {
  const span = c.provenance.spans.find((s) => s.role === 'supports') ?? c.provenance.spans.find((s) => s.role === 'qualifies') ?? c.provenance.spans[0];
  const base = { claim_index: c.index, newer_source_id: null, conflict_type: null };
  if (!span) return { ...base, status: 'unknown', cited_source_id: null, explanation: 'the claim relies on no supplied source, so there is nothing to date' };
  const cited = sources.find((s) => s.id === span.source_id);
  if (!cited) return { ...base, status: 'unknown', cited_source_id: span.source_id, explanation: 'the cited source was not supplied' };
  const others = sources.filter((s) => s.id !== cited.id);

  for (const s of others.filter((o) => controls(o, cited))) {
    const kind = conflictWith(c.text, s);
    if (kind) {
      const how = (s.supersedes ?? []).includes(cited.id) ? `lists ${cited.id} in supersedes` : `is a newer primary source than the secondary source ${cited.id}`;
      return { claim_index: c.index, status: 'conflicted_by_newer_source', cited_source_id: cited.id, newer_source_id: s.id, conflict_type: kind, explanation: `${s.id} ${how} and states a different ${kind === 'number' ? 'value' : kind} for this statement` };
    }
    if (!agreesWith(c.text, s)) {
      return { claim_index: c.index, status: 'unknown', cited_source_id: cited.id, newer_source_id: s.id, conflict_type: null, explanation: `${s.id} replaces ${cited.id}; code could not confirm that it says the same thing` };
    }
  }
  for (const s of others) {
    if (newerThan(s, cited) !== 1) continue;
    const kind = conflictWith(c.text, s);
    if (kind) {
      return { claim_index: c.index, status: 'unknown', cited_source_id: cited.id, newer_source_id: s.id, conflict_type: kind, explanation: `${s.id} is dated later and states a different ${kind === 'number' ? 'value' : kind}, but nothing says it replaces ${cited.id}` };
    }
  }
  if (!dated(cited)) return { ...base, status: 'unknown', cited_source_id: cited.id, explanation: `${cited.id} carries no effective date, publication date or version` };
  return { ...base, status: 'established', cited_source_id: cited.id, explanation: `${cited.id} is dated or versioned and no controlling newer source states otherwise` };
}

export function computeFreshness(claims: Pick<ClaimResult, 'index' | 'text' | 'material' | 'provenance'>[], sources: DatedSource[], opts: { require_dated_sources?: boolean } = {}): FreshnessReport {
  const rows = claims.map((c) => claimFreshness(c, sources));
  const material = rows.filter((r) => claims.find((c) => c.index === r.claim_index)?.material !== false);
  const pool = material.length ? material : rows;
  const worst = pool.reduce<ClaimFreshness | null>((a, b) => (!a || RANK[b.status] > RANK[a.status] ? b : a), null);
  const status: FreshnessStatus = worst?.status ?? 'unknown';
  const recommended_release = status === 'conflicted_by_newer_source' || (opts.require_dated_sources && status === 'unknown') ? 'human_review' : null;
  return {
    version: FRESHNESS_VERSION,
    status,
    cited_source_id: worst?.cited_source_id ?? null,
    newer_source_id: worst?.newer_source_id ?? null,
    conflict_type: worst?.conflict_type ?? null,
    explanation: worst?.explanation ?? 'no claims to date',
    claims: rows,
    sources: sources.map((s) => ({
      id: s.id,
      dated: dated(s),
      effective_date: s.effective_date ?? null,
      published_at: s.published_at ?? null,
      version: s.version ?? null,
      supersedes: s.supersedes ?? [],
      authority_rank: s.authority_rank ?? null,
    })),
    recommended_release,
    note: FRESHNESS_NOTE,
  };
}
