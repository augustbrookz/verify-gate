/**
 * One golden-set case, end to end: evaluate the answer, decide, fingerprint
 * the findings, and produce the ledger case. Shared by the Action (local mode)
 * and the hosted endpoint, so both produce byte-identical structures for the
 * same input.
 */
import { sha256Hex, type EngineOptions } from '@xyntherium/verify-core';
import type { GateClaim } from './claims';
import { resolvePolicy, type GatePolicy } from './defaults';
import { evaluateAnswer, type CaseSource, type ExpectedClaim } from './evaluate';
import { findingFingerprint } from './fingerprint';
import type { LedgerCase, LedgerFinding } from './ledger';
import { evaluateCase, type IntegrityIssue } from './policy';

export interface GateCaseInput {
  suite: string;
  case_id: string;
  location: { path: string; line: number | null };
  question: string;
  /** null when no answer could be obtained (the integrity issue says why). */
  answer: string | null;
  sources: (CaseSource & { sha256: string })[];
  expected: ExpectedClaim[];
  require_citations: boolean;
  policy: GatePolicy;
  policy_overrides: Record<string, unknown> | null;
  integrity: IntegrityIssue[];
  mode: 'local' | 'hosted';
  include_text: boolean;
  request_hash: string | null;
  response_hash: string | null;
  cache_key: string | null;
  engine?: EngineOptions;
}

/** What a report needs beyond the ledger: the texts, kept out of the ledger unless include_text. */
export interface CaseTexts {
  claims: Record<number, string>;
  quotes: Record<string, string>;
}

export interface GateCaseResult {
  ledger: LedgerCase;
  texts: CaseTexts;
  billable_units: number;
  cost_cents: number;
}

function stripText(c: GateClaim): GateClaim {
  const { text: _t, ...rest } = c;
  return {
    ...rest,
    spans: c.spans.map(({ quote: _q, ...s }) => s),
    qualifier_checks: c.qualifier_checks.map(({ claim_text: _a, source_text: _b, ...q }) => q),
  };
}

export function effectivePolicy(base: GatePolicy, overrides: Record<string, unknown> | null): GatePolicy {
  if (!overrides) return base;
  return resolvePolicy({ ...base, ...overrides }).policy;
}

export async function runGateCase(i: GateCaseInput): Promise<GateCaseResult> {
  const policy = effectivePolicy({ ...i.policy, require_citations: i.policy.require_citations || i.require_citations }, i.policy_overrides);
  const texts: CaseTexts = { claims: {}, quotes: {} };
  let claims: GateClaim[] = [];
  let cost = 0;
  let partial: string[] = [];
  const integrity = [...i.integrity];
  // A case whose sources changed or are missing is not evaluated: verdicts against
  // text nobody approved would be misleading. It holds.
  const blocked = integrity.some((x) => x.kind === 'source_hash_mismatch' || x.kind === 'source_missing');
  if (i.answer !== null && !blocked) {
    const ev = await evaluateAnswer({ question: i.question, answer: i.answer, sources: i.sources, expected: i.expected, policy, include_text: true, engine: i.engine });
    cost = ev.cost_cents;
    partial = ev.partial_reasons;
    claims = ev.claims;
    if (ev.partial && i.mode === 'hosted') integrity.push({ kind: 'verifier_error', detail: ev.partial_reasons.join('; ') || 'partial result' });
  } else if (i.answer === null && !integrity.length) {
    integrity.push({ kind: 'answer_missing', detail: 'no recorded answer and no endpoint response' });
  }
  for (const c of claims) {
    if (c.text) texts.claims[c.index] = c.text;
    for (const s of c.spans) if (s.quote) texts.quotes[s.quote_hash] = s.quote;
  }
  const d = evaluateCase({ claims, integrity, policy, mode: i.mode });
  const findings: LedgerFinding[] = d.findings.map((f) => {
    const c = f.claim_index === null ? null : claims.find((x) => x.index === f.claim_index) ?? null;
    return {
      ...f,
      fingerprint: findingFingerprint({ suite: i.suite, case_id: i.case_id, claim_text: c?.text ?? f.kind, verdict: f.verdict, source_hash: c?.spans[0]?.source_hash ?? null, qualifier_type: f.qualifier_type }),
    };
  });
  const units = i.mode === 'hosted' ? claims.filter((c) => c.present_in_answer).length : 0;
  const ledger: LedgerCase = {
    suite: i.suite,
    case_id: i.case_id,
    location: i.location,
    status: integrity.some((x) => x.kind === 'answer_missing' || x.kind === 'endpoint_error' || x.kind === 'endpoint_timeout') ? 'error' : 'checked',
    cache_key: i.cache_key,
    question_hash: sha256Hex(i.question),
    answer_hash: i.answer === null ? null : sha256Hex(i.answer),
    request_hash: i.request_hash,
    response_hash: i.response_hash,
    source_ids: i.sources.map((s) => s.id),
    claims: i.include_text ? claims : claims.map(stripText),
    findings,
    decision: d.decision,
    reasons: partial.length ? [...d.reasons, `partial: ${partial.join('; ')}`] : d.reasons,
    counts: d.counts,
    billable_units: units,
    error: integrity.find((x) => x.kind === 'endpoint_error' || x.kind === 'endpoint_timeout' || x.kind === 'answer_missing') ? { code: integrity.find((x) => x.kind.startsWith('endpoint') || x.kind === 'answer_missing')!.kind, message: integrity[0].detail } : null,
  };
  return { ledger, texts, billable_units: units, cost_cents: cost };
}

/** A cached case reused at zero units: same findings and decision, status "cached". */
export function cachedCase(prior: LedgerCase, now: { location: LedgerCase['location']; request_hash: string | null; response_hash: string | null }): LedgerCase {
  return { ...prior, status: 'cached', location: now.location, request_hash: now.request_hash, response_hash: now.response_hash, billable_units: 0 };
}
