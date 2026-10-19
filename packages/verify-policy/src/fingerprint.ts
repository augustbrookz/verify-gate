/**
 * The stable identity of a finding across runs, for SARIF
 * partialFingerprints and for the result cache:
 *
 *   sha256(suite | case | normalized_claim | verdict | source_hash | qualifier_type)
 *
 * normalized_claim is the claim text after verify-core normalisation (NFKC,
 * quotes, dashes, whitespace), lower-cased, so a re-wrapped or re-quoted
 * answer keeps its fingerprint. source_hash is the first span's source sha256
 * (empty when the claim has no span).
 */
import { normalize, sha256Hex } from '@xyntherium/verify-core';

export function normalizedClaim(text: string): string {
  return normalize(text).toLowerCase();
}

export function findingFingerprint(o: { suite: string; case_id: string; claim_text: string; verdict: string | null; source_hash: string | null; qualifier_type: string | null }): string {
  return sha256Hex([o.suite, o.case_id, normalizedClaim(o.claim_text), o.verdict ?? '', o.source_hash ?? '', o.qualifier_type ?? ''].join('|'));
}

/** The cache key of a checked case: identical inputs reuse the prior verdict at zero units. */
export function caseCacheKey(o: { question: string; answer: string; source_hashes: string[]; config_hash: string; rules_version: string }): string {
  return sha256Hex([sha256Hex(o.question), sha256Hex(o.answer), [...o.source_hashes].sort().join(','), o.config_hash, o.rules_version].join('|'));
}
