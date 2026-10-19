/**
 * Verify Gate ledger, version 1.0.0.
 *
 * One JSON document per run. Every part is hash-chained with verify-core's
 * ledger formula, so the existing chain still applies:
 *
 *   payload_hash = sha256(JCS(payload))
 *   entry_hash   = sha256(prev_hash_or_GENESIS | payload_hash | seq | run_id)
 *
 *   seq 1          the run header (ids, commit, config hash, engine and rules
 *                  versions, policy, sources with sha256, sampling, cost)
 *   seq 2 … n+1    each case, in order
 *   then           each parity record (ledger 1.1.0 only): a source change
 *                  detected (real or cosmetic, conditions named) or a
 *                  disagreement triaged (verify-parity)
 *   last           the summary and the decision (including any override)
 *
 * A run with no parity records is ledger 1.0.0, byte for byte as before.
 *
 * The ledger is then signed with Ed25519 over the RFC 8785 (JCS) bytes of the
 * whole document minus its `signature` member. The key id is inside the signed
 * bytes, so a signature cannot be re-attributed to another key. The wording is
 * "cryptographically signed by the configured verifier key"; a valid
 * signature establishes integrity and origin, not that any claim is true.
 *
 * No claim text, answer, prompt or source text is in the ledger unless
 * run.include_text is true: hashes, offsets and statuses only.
 */
import { CORE_VERSION, entryHash, jcs, jcsBytes, RULES_VERSION, SCHEMA_VERSION, sha256Hex } from '@xyntherium/verify-core';
import type { ParityRecord } from '@xyntherium/verify-parity';
import type { GateClaim } from './claims';
import type { GateDecision, GatePolicy } from './defaults';
import { POLICY_VERSION } from './version';
import { keyIdOf, publicRaw, sign, verify } from './ed25519';
import type { CaseDecision, Finding, OverrideRecord } from './policy';
import { ASSURANCE_SCOPE, SIGNATURE_WORDING } from './scope';
import type { RuleId } from './taxonomy';

export const LEDGER_VERSION = '1.0.0' as const;
/** The ledger version of a run that carries parity records. */
export const LEDGER_VERSION_PARITY = '1.1.0' as const;
export type LedgerVersion = typeof LEDGER_VERSION | typeof LEDGER_VERSION_PARITY;
export const GATE_VERSION = '0.1.0' as const;
export const INTEGRITY_NOT_TRUTH =
  'A valid signature establishes integrity and origin for the signed record. It does not establish that the instruction, evidence, claims, policy, action, or outcome is true, lawful, complete, authorized, or appropriate.' as const;

export interface LedgerSource {
  id: string;
  path: string;
  version: string | null;
  sha256: string;
  status: 'ok' | 'hash_mismatch' | 'missing';
}

export interface RunInfo {
  run_id: string;
  created_at: string;
  gate_version: string;
  mode: 'local' | 'hosted';
  trigger: string;
  repository: string | null;
  commit_sha: string | null;
  ref: string | null;
  pull_request: number | null;
  workflow_run_id: string | null;
  actor: string | null;
  config: { path: string; sha256: string; schema_version: string };
  engine: { core_version: string; rules_version: string; policy_version: string; verify_schema: string };
  policy: GatePolicy;
  endpoint: { fingerprint: string; method: string } | null;
  sources: LedgerSource[];
  sampling: { total_cases: number; selected_cases: number; max_cases_per_run: number | null; sample_rate: number | null; full_run: boolean };
  cost: { billable_units: number; cached_cases: number; estimated_monthly_units: number | null };
  include_text: boolean;
}

export interface LedgerFinding extends Finding {
  fingerprint: string;
}

export interface LedgerCase {
  suite: string;
  case_id: string;
  location: { path: string; line: number | null };
  status: 'checked' | 'cached' | 'error' | 'skipped';
  cache_key: string | null;
  question_hash: string;
  answer_hash: string | null;
  request_hash: string | null;
  response_hash: string | null;
  source_ids: string[];
  claims: GateClaim[];
  findings: LedgerFinding[];
  decision: GateDecision;
  reasons: string[];
  counts: CaseDecision['counts'];
  billable_units: number;
  error: { code: string; message: string } | null;
}

export interface LedgerSummary {
  cases_total: number;
  cases_checked: number;
  cases_cached: number;
  cases_errored: number;
  cases_skipped: number;
  claims_total: number;
  claims_by_verdict: Record<string, number>;
  material_failures: number;
  findings_by_rule: Record<RuleId, number>;
  deterministic_findings: number;
  model_findings: number;
  decisions: Record<GateDecision, number>;
}

export interface LedgerDecision {
  decision: GateDecision;
  enforcement: GatePolicy['enforcement'];
  fail_on: ('block' | 'hold' | 'warn')[];
  exit_code: 0 | 1;
  conclusion: 'success' | 'neutral' | 'failure';
  title: string;
  reasons: string[];
  /**
   * In hosted mode the GitHub facts behind an override (label applier,
   * permissions) are checked by the Action and reported to the verifier, which
   * cannot check them itself: reported_by says so inside the signed record.
   */
  override: (OverrideRecord & { reported_by?: 'verify-gate-action' }) | null;
}

export interface ChainEntry {
  seq: number;
  kind: 'run' | 'case' | 'parity' | 'decision';
  payload_hash: string;
  prev_hash: string | null;
  entry_hash: string;
}

export interface GateLedgerV1 {
  ledger_version: LedgerVersion;
  kind: 'verify-gate-run';
  assurance_scope: typeof ASSURANCE_SCOPE;
  run: RunInfo;
  cases: LedgerCase[];
  summary: LedgerSummary;
  decision: LedgerDecision;
  /** Ledger 1.1.0: parity results (verify-parity), hash-chained between the cases and the decision. */
  parity?: ParityRecord[];
  chain: { algorithm: 'sha256'; formula: string; prev_run_hash: string | null; entries: ChainEntry[]; head: string };
  signing: { alg: 'Ed25519' | 'none'; key_id: string | null; key_source: 'repository-secret' | 'xyntherium-managed' | 'none'; wording: typeof SIGNATURE_WORDING; note: string };
  signature: { value: string; public_key: string } | null;
}

const FORMULA = 'entry_hash = sha256(prev_hash_or_GENESIS | payload_hash | seq | run_id); payload_hash = sha256(JCS(payload))';

export function engineInfo(): RunInfo['engine'] {
  return { core_version: CORE_VERSION, rules_version: RULES_VERSION, policy_version: POLICY_VERSION, verify_schema: SCHEMA_VERSION };
}

export function summarize(cases: LedgerCase[]): LedgerSummary {
  const claims = cases.flatMap((c) => c.claims);
  const findings = cases.flatMap((c) => c.findings);
  const byVerdict: Record<string, number> = {};
  for (const c of claims) {
    const k = c.present_in_answer ? (c.verdict ?? 'none') : 'missing';
    byVerdict[k] = (byVerdict[k] ?? 0) + 1;
  }
  const byRule = { 'XYN-001': 0, 'XYN-002': 0, 'XYN-003': 0, 'XYN-004': 0, 'XYN-005': 0, 'XYN-006': 0 } as Record<RuleId, number>;
  for (const f of findings) byRule[f.rule]++;
  const decisions = { pass: 0, warn: 0, hold: 0, block: 0 } as Record<GateDecision, number>;
  for (const c of cases) if (c.status !== 'skipped') decisions[c.decision]++;
  return {
    cases_total: cases.length,
    cases_checked: cases.filter((c) => c.status === 'checked').length,
    cases_cached: cases.filter((c) => c.status === 'cached').length,
    cases_errored: cases.filter((c) => c.status === 'error').length,
    cases_skipped: cases.filter((c) => c.status === 'skipped').length,
    claims_total: claims.length,
    claims_by_verdict: Object.fromEntries(Object.entries(byVerdict).sort()),
    material_failures: findings.filter((f) => f.decision === 'block').length,
    findings_by_rule: byRule,
    deterministic_findings: findings.filter((f) => f.deterministic).length,
    model_findings: findings.filter((f) => !f.deterministic).length,
    decisions,
  };
}

function chainOf(run: RunInfo, cases: LedgerCase[], parity: ParityRecord[], tail: { summary: LedgerSummary; decision: LedgerDecision }, prevRunHash: string | null): GateLedgerV1['chain'] {
  const parts: { kind: ChainEntry['kind']; payload: unknown }[] = [
    { kind: 'run', payload: run },
    ...cases.map((c) => ({ kind: 'case' as const, payload: c })),
    ...parity.map((p) => ({ kind: 'parity' as const, payload: p })),
    { kind: 'decision', payload: tail },
  ];
  const entries: ChainEntry[] = [];
  let prev: string | null = prevRunHash;
  parts.forEach((p, i) => {
    const payload_hash = sha256Hex(jcs(p.payload));
    const seq = i + 1;
    const entry_hash = entryHash(prev, payload_hash, seq, run.run_id);
    entries.push({ seq, kind: p.kind, payload_hash, prev_hash: prev, entry_hash });
    prev = entry_hash;
  });
  return { algorithm: 'sha256', formula: FORMULA, prev_run_hash: prevRunHash, entries, head: entries[entries.length - 1].entry_hash };
}

export function buildLedger(o: { run: RunInfo; cases: LedgerCase[]; decision: LedgerDecision; prev_run_hash?: string | null; parity?: ParityRecord[] }): GateLedgerV1 {
  const summary = summarize(o.cases);
  const parity = o.parity ?? [];
  return {
    ledger_version: parity.length ? LEDGER_VERSION_PARITY : LEDGER_VERSION,
    kind: 'verify-gate-run',
    assurance_scope: ASSURANCE_SCOPE,
    run: o.run,
    cases: o.cases,
    summary,
    decision: o.decision,
    ...(parity.length ? { parity } : {}),
    chain: chainOf(o.run, o.cases, parity, { summary, decision: o.decision }, o.prev_run_hash ?? null),
    signing: { alg: 'none', key_id: null, key_source: 'none', wording: SIGNATURE_WORDING, note: 'unsigned: no signing key was configured' },
    signature: null,
  };
}

/** The bytes a signature covers: JCS of the ledger without its signature member. */
export function signedBytes(ledger: GateLedgerV1): Uint8Array {
  const { signature: _drop, ...rest } = ledger;
  return jcsBytes(rest);
}

export async function signLedger(ledger: GateLedgerV1, privateKey: string, keySource: 'repository-secret' | 'xyntherium-managed'): Promise<GateLedgerV1> {
  // The key id goes into the signed bytes first, then the signature is made over them.
  const { public_key, key_id } = await sign(new Uint8Array(0), privateKey);
  const withSigning: GateLedgerV1 = {
    ...ledger,
    signing: { alg: 'Ed25519', key_id, key_source: keySource, wording: SIGNATURE_WORDING, note: `${SIGNATURE_WORDING} (${keySource === 'repository-secret' ? 'a key from this repository’s secrets' : 'a Xyntherium-managed key; public keys at https://xyntherium.com/v1/gate/keys'})` },
    signature: null,
  };
  const s = await sign(signedBytes(withSigning), privateKey);
  return { ...withSigning, signature: { value: s.signature, public_key } };
}

export interface LedgerCheck {
  ok: boolean;
  chain: 'valid' | 'invalid';
  signature: 'valid' | 'invalid' | 'unsigned' | 'untrusted_key';
  key_id: string | null;
  problems: string[];
  statements: string[];
}

/**
 * Check a ledger offline: shape, assurance scope, every chain link, and the
 * signature. A signature checked only against the key embedded in the file
 * proves internal consistency, not origin: pass trusted keys for that.
 */
export async function verifyLedger(raw: unknown, o: { trusted_keys?: { key_id?: string; public_key: string }[]; allow_embedded_key?: boolean } = {}): Promise<LedgerCheck> {
  const problems: string[] = [];
  const statements = [`Checks integrity and origin only. ${INTEGRITY_NOT_TRUTH}`, `Assurance scope: ${ASSURANCE_SCOPE}`];
  const l = raw as GateLedgerV1;
  if (!l || typeof l !== 'object') return { ok: false, chain: 'invalid', signature: 'unsigned', key_id: null, problems: ['not a JSON object'], statements };
  if (l.ledger_version !== LEDGER_VERSION && l.ledger_version !== LEDGER_VERSION_PARITY) problems.push(`ledger_version is ${String(l.ledger_version)}, expected ${LEDGER_VERSION} or ${LEDGER_VERSION_PARITY}`);
  if (l.ledger_version === LEDGER_VERSION && l.parity !== undefined) problems.push(`a ${LEDGER_VERSION} ledger carries no parity records`);
  if (l.ledger_version === LEDGER_VERSION_PARITY && !(Array.isArray(l.parity) && l.parity.length)) problems.push(`a ${LEDGER_VERSION_PARITY} ledger carries parity records`);
  if (l.kind !== 'verify-gate-run') problems.push('kind must be verify-gate-run');
  if (l.assurance_scope !== ASSURANCE_SCOPE) problems.push('assurance_scope is missing or altered');
  let chainOk = true;
  try {
    const expected = chainOf(l.run, l.cases ?? [], Array.isArray(l.parity) ? l.parity : [], { summary: l.summary, decision: l.decision }, l.chain?.prev_run_hash ?? null);
    const got = l.chain?.entries ?? [];
    if (got.length !== expected.entries.length) {
      chainOk = false;
      problems.push(`chain has ${got.length} entries, expected ${expected.entries.length}`);
    }
    expected.entries.forEach((e, i) => {
      const g = got[i];
      if (!g) return;
      if (g.payload_hash !== e.payload_hash) {
        chainOk = false;
        problems.push(`seq ${e.seq} (${e.kind}): payload_hash does not match its content`);
      }
      if (g.prev_hash !== e.prev_hash || g.entry_hash !== e.entry_hash) {
        chainOk = false;
        problems.push(`seq ${e.seq} (${e.kind}): entry_hash does not link`);
      }
    });
    if (l.chain?.head !== expected.head) {
      chainOk = false;
      problems.push('chain head does not match the last entry');
    }
    const recomputed = summarize(l.cases ?? []);
    if (jcs(recomputed) !== jcs(l.summary)) problems.push('summary does not match the cases');
  } catch (e) {
    chainOk = false;
    problems.push(`chain could not be recomputed: ${e instanceof Error ? e.message : String(e)}`);
  }

  let signature: LedgerCheck['signature'] = 'unsigned';
  const keyId = l.signing?.key_id ?? null;
  if (l.signature && l.signing?.alg === 'Ed25519') {
    const trusted = (o.trusted_keys ?? []).map((k) => {
      try {
        const raw = publicRaw(k.public_key);
        return { key_id: k.key_id ?? keyIdOf(raw), public_key: k.public_key, raw_id: keyIdOf(raw) };
      } catch {
        return null;
      }
    }).filter((k): k is { key_id: string; public_key: string; raw_id: string } => !!k && k.raw_id === k.key_id);
    const match = trusted.find((k) => k.key_id === keyId);
    const embeddedId = (() => {
      try {
        return keyIdOf(publicRaw(l.signature!.public_key));
      } catch {
        return null;
      }
    })();
    const key = match?.public_key ?? (o.allow_embedded_key && embeddedId === keyId ? l.signature.public_key : null);
    if (!key) {
      signature = 'untrusted_key';
      problems.push(`signed with key ${keyId}, which is not among the trusted keys${o.allow_embedded_key ? '' : ' (pass --public-key or --keys, or --allow-embedded-key to check consistency only)'}`);
    } else {
      const ok = await verify(signedBytes(l), l.signature.value, key);
      signature = ok ? 'valid' : 'invalid';
      if (!ok) problems.push('signature does not verify: the ledger was changed after signing, or a different key signed it');
      else statements.unshift(`${SIGNATURE_WORDING} ${keyId}${match ? '' : ' (embedded key: internal consistency only, origin not established)'}.`);
    }
  } else if (l.signing?.alg === 'Ed25519' && !l.signature) {
    signature = 'invalid';
    problems.push('signing says Ed25519 but the signature is missing');
  }
  // "unsigned" is reported, not failed: `ledger verify --require-signature` makes it fatal.
  const ok = problems.length === 0 && chainOk && (signature === 'valid' || signature === 'unsigned');
  return { ok, chain: chainOk ? 'valid' : 'invalid', signature, key_id: keyId, problems, statements };
}
