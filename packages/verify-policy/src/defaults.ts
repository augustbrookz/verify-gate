/**
 * Verify Gate policy: the shape, the safe defaults, and validation.
 *
 * The defaults are set for precision. A gate that blocks good changes gets
 * uninstalled, so out of the box only code-confirmed contradictions and
 * dropped qualifiers on material claims block; claims the sources cannot
 * resolve warn; model-dependent findings never block unless a repository opts
 * in; and a new installation starts report-only.
 *
 * This file is a rules file (scripts/rules-manifest.mjs): changing a default
 * needs a RULES_VERSION bump and a changelog entry.
 */

export const GATE_DECISIONS = ['pass', 'warn', 'hold', 'block'] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];

export const MATERIALITY = ['critical', 'high', 'medium', 'low'] as const;
export type Materiality = (typeof MATERIALITY)[number];

/** critical, high and medium claims are material; low claims are not. */
export function isMaterial(m: Materiality): boolean {
  return m !== 'low';
}

export interface GatePolicy {
  /** Contradicted claims tolerated per materiality before block. A missing key never blocks (warn). */
  max_contradicted: Partial<Record<Materiality, number>>;
  /** Unsupported claims tolerated per materiality before block. A missing key never blocks (warn). */
  max_unsupported: Partial<Record<Materiality, number>>;
  /** Block when supported / material claims falls below this. null = off. */
  min_material_supported_ratio: number | null;
  require_citations: boolean;
  treat_unverifiable_as: 'warn' | 'block' | 'hold' | 'pass';
  fail_on_material_qualifier_loss: boolean;
  /** Whether a finding that depends on a model judgement may block. */
  model_findings: 'warn' | 'block';
  /**
   * An expected material claim the answer no longer makes. Live answers are
   * reworded from run to run, so by default this warns; contradictions and
   * dropped qualifiers in what the answer does say are what block.
   */
  missing_expected_claim: 'warn' | 'block';
  /** Hosted mode: hold when more than this share of material claims the verifier tried stayed unresolved. */
  max_unresolved_ratio: number;
  /** report_only: decide and report, never fail the job. enforce: block and (optionally) hold fail it. */
  enforcement: 'report_only' | 'enforce';
  overrides: { enabled: boolean; label: string; require_team: string | null };
}

export const DEFAULT_POLICY: GatePolicy = Object.freeze({
  max_contradicted: { critical: 0, high: 0, medium: 0 },
  max_unsupported: { critical: 0, high: 0 },
  min_material_supported_ratio: null,
  require_citations: false,
  treat_unverifiable_as: 'warn',
  fail_on_material_qualifier_loss: true,
  model_findings: 'warn',
  missing_expected_claim: 'warn',
  max_unresolved_ratio: 0.5,
  enforcement: 'report_only',
  overrides: { enabled: true, label: 'verify-gate:override', require_team: null },
}) as GatePolicy;

const KEYS = new Set(Object.keys(DEFAULT_POLICY));

/** Merge a repository's policy block over the defaults, rejecting anything unknown or out of range. */
export function resolvePolicy(input: unknown): { policy: GatePolicy; errors: string[] } {
  const errors: string[] = [];
  const p = (input ?? {}) as Record<string, unknown>;
  if (typeof p !== 'object' || Array.isArray(p)) return { policy: clone(DEFAULT_POLICY), errors: ['policy must be a mapping'] };
  for (const k of Object.keys(p)) if (!KEYS.has(k)) errors.push(`policy.${k} is not a known setting`);
  const out = clone(DEFAULT_POLICY);
  const counts = (key: 'max_contradicted' | 'max_unsupported') => {
    const v = p[key];
    if (v === undefined) return;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      errors.push(`policy.${key} must map materiality to a count`);
      return;
    }
    const next: Partial<Record<Materiality, number>> = {};
    for (const [m, n] of Object.entries(v as Record<string, unknown>)) {
      if (!(MATERIALITY as readonly string[]).includes(m)) errors.push(`policy.${key}.${m}: materiality is one of ${MATERIALITY.join(', ')}`);
      else if (n === null) continue;
      else if (!Number.isInteger(n) || (n as number) < 0) errors.push(`policy.${key}.${m} must be a non-negative integer or null`);
      else next[m as Materiality] = n as number;
    }
    out[key] = next;
  };
  counts('max_contradicted');
  counts('max_unsupported');
  if (p.min_material_supported_ratio !== undefined) {
    const v = p.min_material_supported_ratio;
    if (v !== null && (typeof v !== 'number' || v < 0 || v > 1)) errors.push('policy.min_material_supported_ratio must be between 0 and 1, or null');
    else out.min_material_supported_ratio = v as number | null;
  }
  const bool = (k: 'require_citations' | 'fail_on_material_qualifier_loss') => {
    if (p[k] === undefined) return;
    if (typeof p[k] !== 'boolean') errors.push(`policy.${k} must be true or false`);
    else out[k] = p[k] as boolean;
  };
  bool('require_citations');
  bool('fail_on_material_qualifier_loss');
  const oneOf = <K extends 'treat_unverifiable_as' | 'model_findings' | 'missing_expected_claim' | 'enforcement'>(k: K, allowed: readonly GatePolicy[K][]) => {
    if (p[k] === undefined) return;
    if (!allowed.includes(p[k] as GatePolicy[K])) errors.push(`policy.${k} must be one of ${allowed.join(', ')}`);
    else out[k] = p[k] as GatePolicy[K];
  };
  oneOf('treat_unverifiable_as', ['warn', 'block', 'hold', 'pass']);
  oneOf('model_findings', ['warn', 'block']);
  oneOf('missing_expected_claim', ['warn', 'block']);
  oneOf('enforcement', ['report_only', 'enforce']);
  if (p.max_unresolved_ratio !== undefined) {
    const v = p.max_unresolved_ratio;
    if (typeof v !== 'number' || v < 0 || v > 1) errors.push('policy.max_unresolved_ratio must be between 0 and 1');
    else out.max_unresolved_ratio = v;
  }
  if (p.overrides !== undefined) {
    const o = p.overrides as Record<string, unknown>;
    if (!o || typeof o !== 'object') errors.push('policy.overrides must be a mapping');
    else {
      for (const k of Object.keys(o)) if (!['enabled', 'label', 'require_team'].includes(k)) errors.push(`policy.overrides.${k} is not a known setting`);
      if (o.enabled !== undefined) {
        if (typeof o.enabled !== 'boolean') errors.push('policy.overrides.enabled must be true or false');
        else out.overrides.enabled = o.enabled;
      }
      if (o.label !== undefined) {
        if (typeof o.label !== 'string' || !o.label.trim()) errors.push('policy.overrides.label must be a label name');
        else out.overrides.label = o.label.trim();
      }
      if (o.require_team !== undefined) {
        if (o.require_team !== null && (typeof o.require_team !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(o.require_team))) errors.push('policy.overrides.require_team must be "org/team-slug" or null');
        else out.overrides.require_team = o.require_team as string | null;
      }
    }
  }
  return { policy: out, errors };
}

function clone(p: GatePolicy): GatePolicy {
  return { ...p, max_contradicted: { ...p.max_contradicted }, max_unsupported: { ...p.max_unsupported }, overrides: { ...p.overrides } };
}
