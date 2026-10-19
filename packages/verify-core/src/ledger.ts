/**
 * Evidence ledger: an append-only, hash-chained record per account.
 *
 * Each entry commits to a payload (hashes of the question, answer and every
 * source, plus each claim's verdict, rule and span offsets — never the text
 * itself) and to the previous entry. Changing any past entry changes every
 * hash after it.
 *
 *   payload_hash = sha256(canonical_json(payload))
 *   entry_hash   = sha256(prev_hash_or_GENESIS + "|" + payload_hash + "|" + seq + "|" + request_id)
 *
 * Postgres computes entry_hash with the same formula when it appends
 * (append_verify_ledger), so a chain can be checked with either.
 */
import type { ClaimResult, VersionInfo } from './contract';
import { canonicalJson, sha256Hex } from './hash';
import { normalizeRulesVersion } from './rules-version';

export const GENESIS = 'GENESIS';

export interface LedgerPayload {
  schema_version: string;
  request_id: string;
  created_at: string;
  question_hash: string;
  answer_hash: string;
  sources: { id: string; hash: string }[];
  release_recommendation: string;
  overall_status: string;
  /** Semver of the rules that produced the verdicts. Inside the hashed payload, so it cannot change without breaking the chain. */
  rules_version: string;
  claims: {
    index: number;
    claim_hash: string;
    verdict: string;
    failure_reason: string | null;
    rule_id: string;
    resolved_by: string;
    spans: { source_id: string; start: number; end: number; source_hash: string; role: string }[];
  }[];
  versions: VersionInfo;
}

export function buildLedgerPayload(input: {
  schema_version: string;
  request_id: string;
  created_at: string;
  question: string;
  answer: string;
  sources: { id: string; hash: string }[];
  release_recommendation: string;
  overall_status: string;
  claims: ClaimResult[];
  versions: VersionInfo;
}): LedgerPayload {
  return {
    schema_version: input.schema_version,
    request_id: input.request_id,
    created_at: input.created_at,
    question_hash: sha256Hex(input.question),
    answer_hash: sha256Hex(input.answer),
    sources: input.sources.map((s) => ({ id: s.id, hash: s.hash })),
    release_recommendation: input.release_recommendation,
    overall_status: input.overall_status,
    rules_version: normalizeRulesVersion(input.versions.rules),
    claims: input.claims.map((c) => ({
      index: c.index,
      claim_hash: sha256Hex(c.text),
      verdict: c.verdict,
      failure_reason: c.failure_reason,
      rule_id: c.provenance.rule_id,
      resolved_by: c.resolved_by,
      spans: c.provenance.spans.map((s) => ({ source_id: s.source_id, start: s.start, end: s.end, source_hash: s.source_hash, role: s.role })),
    })),
    versions: input.versions,
  };
}

export function payloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

export function entryHash(prevHash: string | null, payloadHashHex: string, seq: number, requestId: string): string {
  return sha256Hex(`${prevHash ?? GENESIS}|${payloadHashHex}|${seq}|${requestId}`);
}

export interface LedgerEntry {
  seq: number;
  request_id: string;
  payload: unknown;
  payload_hash: string;
  prev_hash: string | null;
  entry_hash: string;
}

export interface ChainCheck {
  ok: boolean;
  checked: number;
  problems: string[];
}

/**
 * Verify a contiguous run of entries (ascending seq). The first entry's
 * prev_hash is taken on trust when it is not GENESIS: retention may have
 * removed older entries.
 */
export function verifyChain(entries: LedgerEntry[]): ChainCheck {
  const problems: string[] = [];
  let prev: LedgerEntry | null = null;
  for (const e of entries) {
    const ph = payloadHash(e.payload);
    if (ph !== e.payload_hash) problems.push(`seq ${e.seq}: payload_hash does not match payload`);
    const eh = entryHash(e.prev_hash, e.payload_hash, e.seq, e.request_id);
    if (eh !== e.entry_hash) problems.push(`seq ${e.seq}: entry_hash does not match its fields`);
    if (prev) {
      if (e.seq !== prev.seq + 1) problems.push(`seq ${e.seq}: gap after ${prev.seq}`);
      if (e.prev_hash !== prev.entry_hash) problems.push(`seq ${e.seq}: prev_hash does not link to seq ${prev.seq}`);
    } else if (e.seq === 1 && e.prev_hash !== null && e.prev_hash !== GENESIS) {
      problems.push('seq 1: prev_hash must be GENESIS');
    }
    prev = e;
  }
  return { ok: problems.length === 0, checked: entries.length, problems };
}
