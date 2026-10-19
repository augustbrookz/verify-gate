/**
 * Snapshots and their comparison (State Parity Audit).
 *
 * A schema names every field and its mode:
 *   exact      compared for equality after canonicalisation by kind (numbers,
 *              dates, deadlines, conditions, citations, or any JSON value)
 *   tolerance  text compared after formatting is removed (canonical.ts)
 *   excluded   metadata: recorded in the snapshot, never compared
 *
 * captureSnapshot is a pure function of its arguments. Every value, including
 * the capture time, is an explicit parameter; nothing reads the clock, the
 * environment or other shared state, so the same inputs always give the same
 * snapshot and the same hashes. Each snapshot carries two SHA-256 digests of
 * RFC 8785 (JCS) bytes: `sha256` over everything, and `parity_sha256` over the
 * exact and tolerance fields only (what parity is decided on).
 */
import { jcs, sha256Hex } from '@xyntherium/verify-core';
import { canonicalCitations, canonicalDates, canonicalQuantities, toleranceText } from './canonical';
import { PARITY_VERSION, type Json } from './version';

export type FieldMode = 'exact' | 'tolerance' | 'excluded';
export type FieldKind = 'number' | 'date' | 'deadline' | 'condition' | 'citation' | 'text' | 'json';

export interface FieldSpec {
  name: string;
  mode: FieldMode;
  /** How an exact field is canonicalised (default json). Tolerance fields are text. */
  kind?: FieldKind;
}

export interface ParitySchema {
  id: string;
  version: string;
  fields: FieldSpec[];
}

export interface Snapshot {
  parity_version: typeof PARITY_VERSION;
  schema: { id: string; version: string };
  captured_at: string;
  label: string | null;
  exact: Record<string, Json>;
  tolerance: Record<string, string>;
  excluded: Record<string, Json>;
  parity_sha256: string;
  sha256: string;
}

export class ParityInputError extends Error {}

function canonicalExact(kind: FieldKind, v: unknown, field: string): Json {
  switch (kind) {
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s$€£%]/g, '')) : NaN;
      if (!Number.isFinite(n)) throw new ParityInputError(`${field}: not a number`);
      return Math.round(n * 1e6) / 1e6;
    }
    case 'date': {
      if (typeof v !== 'string') throw new ParityInputError(`${field}: a date must be a string`);
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const d = canonicalDates(v);
      if (!d.length) throw new ParityInputError(`${field}: no date found`);
      return d.join(',');
    }
    case 'deadline':
      return (Array.isArray(v) ? v.map(String) : [String(v ?? '')]).flatMap((x) => canonicalQuantities(x)).sort();
    case 'citation':
      return (Array.isArray(v) ? v.map(String) : [String(v ?? '')]).flatMap((x) => canonicalCitations(x)).sort();
    case 'condition':
      // Conditions are given as "class:text" strings or {class, text}; compared by class and tolerance wording.
      return (Array.isArray(v) ? v : [v])
        .filter((x) => x !== null && x !== undefined && x !== '')
        .map((x) => (typeof x === 'string' ? x : `${(x as { class: string }).class}:${(x as { text: string }).text}`))
        .map((x) => {
          const at = x.indexOf(':');
          return at > 0 ? `${x.slice(0, at)}:${toleranceText(x.slice(at + 1))}` : toleranceText(x);
        })
        .sort();
    case 'text':
      return toleranceText(String(v ?? ''));
    default:
      return JSON.parse(jcs(v as Json)) as Json;
  }
}

/** Capture a snapshot. Every schema field must be supplied (null is a value); unknown fields are refused. */
export function captureSnapshot(schema: ParitySchema, values: Record<string, unknown>, ctx: { captured_at: string; label?: string | null }): Snapshot {
  if (typeof ctx?.captured_at !== 'string' || !ctx.captured_at) throw new ParityInputError('captured_at is required (snapshots never read the clock)');
  const known = new Set(schema.fields.map((f) => f.name));
  for (const k of Object.keys(values)) if (!known.has(k)) throw new ParityInputError(`${k} is not a field of ${schema.id}@${schema.version}`);
  const exact: Record<string, Json> = {};
  const tolerance: Record<string, string> = {};
  const excluded: Record<string, Json> = {};
  for (const f of schema.fields) {
    if (!(f.name in values)) throw new ParityInputError(`${f.name} is required by ${schema.id}@${schema.version} (pass null for none)`);
    const v = values[f.name];
    if (f.mode === 'excluded') excluded[f.name] = v === undefined ? null : (JSON.parse(jcs(v as Json)) as Json);
    else if (f.mode === 'tolerance') tolerance[f.name] = v === null ? '' : toleranceText(String(v));
    else exact[f.name] = v === null ? null : canonicalExact(f.kind ?? 'json', v, f.name);
  }
  const core = { parity_version: PARITY_VERSION, schema: { id: schema.id, version: schema.version }, exact, tolerance };
  const parity_sha256 = sha256Hex(jcs(core as unknown as Json));
  const body = { ...core, captured_at: ctx.captured_at, label: ctx.label ?? null, excluded, parity_sha256 };
  return { ...body, sha256: sha256Hex(jcs(body as unknown as Json)) };
}

/** Recompute both digests; false if the snapshot was altered. */
export function verifySnapshot(s: Snapshot): boolean {
  const core = { parity_version: s.parity_version, schema: s.schema, exact: s.exact, tolerance: s.tolerance };
  if (sha256Hex(jcs(core as unknown as Json)) !== s.parity_sha256) return false;
  const { sha256: _h, ...body } = s;
  return sha256Hex(jcs(body as unknown as Json)) === s.sha256;
}

export interface FieldComparison {
  field: string;
  mode: FieldMode;
  status: 'equal' | 'changed' | 'excluded';
  before?: Json;
  after?: Json;
}

export interface SnapshotComparison {
  /** identical: every exact and tolerance field equal (the parity digests match). */
  status: 'identical' | 'different' | 'incomparable';
  fields: FieldComparison[];
  before_parity_sha256: string;
  after_parity_sha256: string;
}

export function compareSnapshots(a: Snapshot, b: Snapshot, schema: ParitySchema): SnapshotComparison {
  const base = { before_parity_sha256: a.parity_sha256, after_parity_sha256: b.parity_sha256 };
  if (a.schema.id !== b.schema.id || a.schema.version !== b.schema.version || a.schema.id !== schema.id) return { status: 'incomparable', fields: [], ...base };
  const fields: FieldComparison[] = schema.fields.map((f) => {
    if (f.mode === 'excluded') return { field: f.name, mode: f.mode, status: 'excluded' };
    if (f.mode === 'exact') {
      const x = a.exact[f.name] ?? null;
      const y = b.exact[f.name] ?? null;
      return jcs(x) === jcs(y) ? { field: f.name, mode: f.mode, status: 'equal' } : { field: f.name, mode: f.mode, status: 'changed', before: x, after: y };
    }
    // Tolerance values are stored with formatting already removed, so equal means within tolerance.
    const x = a.tolerance[f.name] ?? '';
    const y = b.tolerance[f.name] ?? '';
    return x === y ? { field: f.name, mode: f.mode, status: 'equal' } : { field: f.name, mode: f.mode, status: 'changed', before: x, after: y };
  });
  return { status: fields.some((f) => f.status === 'changed') ? 'different' : 'identical', fields, ...base };
}
