import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { jcs, sha256Hex } from '@xyntherium/verify-core';
import { detectSourceChange, sourceChangeRecord, triageDisagreement, triageRecord, type Json } from '@xyntherium/verify-parity';
import {
  ASSURANCE_SCOPE,
  buildLedger,
  engineInfo,
  evaluateAnswer,
  evaluateCase,
  findingFingerprint,
  generateKeyPair,
  keyIdOf,
  publicRaw,
  resolvePolicy,
  runOutcome,
  sign,
  signedBytes,
  signLedger,
  verify,
  verifyLedger,
  type GateLedgerV1,
  type LedgerCase,
  type RunInfo,
} from '../src/index';

const policy = resolvePolicy({ enforcement: 'enforce' }).policy;

async function sampleLedger(): Promise<GateLedgerV1> {
  const sources = [{ id: 'refunds', text: 'Annual plans can be cancelled for a full refund within 30 days of purchase.' }];
  const answers = ['Annual plans can be cancelled for a full refund within 30 days of purchase.', 'Annual plans can be cancelled for a full refund within 60 days of purchase.'];
  const cases: LedgerCase[] = [];
  for (const [i, answer] of answers.entries()) {
    const ev = await evaluateAnswer({ question: 'refunds?', answer, sources, expected: [], policy });
    const d = evaluateCase({ claims: ev.claims, integrity: [], policy, mode: 'local' });
    cases.push({
      suite: 'support',
      case_id: `case-${i}`,
      location: { path: 'verify-gate.yml', line: 10 + i },
      status: 'checked',
      cache_key: null,
      question_hash: 'q',
      answer_hash: 'a',
      request_hash: null,
      response_hash: null,
      source_ids: ['refunds'],
      claims: ev.claims,
      findings: d.findings.map((f) => ({ ...f, fingerprint: findingFingerprint({ suite: 'support', case_id: `case-${i}`, claim_text: answer, verdict: f.verdict, source_hash: ev.claims[0].spans[0]?.source_hash ?? null, qualifier_type: f.qualifier_type }) })),
      decision: d.decision,
      reasons: d.reasons,
      counts: d.counts,
      billable_units: 0,
      error: null,
    });
  }
  const run: RunInfo = {
    run_id: '00000000-0000-4000-8000-0000000000aa',
    created_at: '2026-10-18T00:00:00.000Z',
    gate_version: '0.1.0',
    mode: 'local',
    trigger: 'pull_request',
    repository: 'acme/support-bot',
    commit_sha: 'abc123',
    ref: 'refs/pull/7/merge',
    pull_request: 7,
    workflow_run_id: '1',
    actor: 'octocat',
    config: { path: 'verify-gate.yml', sha256: 'c'.repeat(64), schema_version: '1' },
    engine: engineInfo(),
    policy,
    endpoint: null,
    sources: [{ id: 'refunds', path: 'policies/refunds.md', version: '2026-10', sha256: 'd'.repeat(64), status: 'ok' }],
    sampling: { total_cases: 2, selected_cases: 2, max_cases_per_run: null, sample_rate: null, full_run: true },
    cost: { billable_units: 0, cached_cases: 0, estimated_monthly_units: null },
    include_text: false,
  };
  const outcome = runOutcome('block', { enforcement: 'enforce', fail_on: ['block'], override: null });
  return buildLedger({ run, cases, decision: { ...outcome, enforcement: 'enforce', fail_on: ['block'], reasons: ['block: 1 finding(s)'], override: null } });
}

describe('Gate ledger v1.0.0', () => {
  it('carries the exact assurance scope, a full hash chain and a summary', async () => {
    const l = await sampleLedger();
    expect(l.assurance_scope).toBe(ASSURANCE_SCOPE);
    expect(l.chain.entries.map((e) => e.kind)).toEqual(['run', 'case', 'case', 'decision']);
    expect(l.chain.head).toBe(l.chain.entries[3].entry_hash);
    expect(l.summary.decisions).toEqual({ pass: 1, warn: 0, hold: 0, block: 1 });
    expect(l.summary.findings_by_rule['XYN-001']).toBe(1);
    const check = await verifyLedger(l);
    expect(check).toMatchObject({ ok: true, chain: 'valid', signature: 'unsigned' });
  });

  it('signs over JCS minus the signature, binds the key id, and verifies offline', async () => {
    const keys = await generateKeyPair();
    const signed = await signLedger(await sampleLedger(), keys.private_key, 'repository-secret');
    expect(signed.signing).toMatchObject({ alg: 'Ed25519', key_id: keys.key_id, key_source: 'repository-secret' });
    expect(signed.signing.note).toMatch(/cryptographically signed by the configured verifier key/);
    const check = await verifyLedger(signed, { trusted_keys: [{ public_key: keys.public_key }] });
    expect(check).toMatchObject({ ok: true, chain: 'valid', signature: 'valid', key_id: keys.key_id });
    expect(check.statements.join(' ')).toMatch(/does not establish that the instruction, evidence, claims/);
  });

  it('detects any change after signing: a verdict, a decision, a source hash, the scope', async () => {
    const keys = await generateKeyPair();
    const signed = await signLedger(await sampleLedger(), keys.private_key, 'repository-secret');
    const trusted = { trusted_keys: [{ public_key: keys.public_key }] };
    const mutations: ((l: GateLedgerV1) => void)[] = [
      (l) => (l.cases[1].claims[0].verdict = 'supported'),
      (l) => (l.decision.decision = 'pass'),
      (l) => (l.run.sources[0].sha256 = 'e'.repeat(64)),
      (l) => ((l as { assurance_scope: string }).assurance_scope = 'certified compliant'),
      (l) => (l.signing.key_id = '0000000000000000'),
    ];
    for (const m of mutations) {
      const copy = structuredClone(signed);
      m(copy);
      const check = await verifyLedger(copy, trusted);
      expect(check.ok, JSON.stringify(check.problems)).toBe(false);
    }
  });

  it('refuses a key it was not given, unless asked only for internal consistency', async () => {
    const keys = await generateKeyPair();
    const other = await generateKeyPair();
    const signed = await signLedger(await sampleLedger(), keys.private_key, 'xyntherium-managed');
    expect(await verifyLedger(signed, { trusted_keys: [{ public_key: other.public_key }] })).toMatchObject({ ok: false, signature: 'untrusted_key' });
    const embedded = await verifyLedger(signed, { allow_embedded_key: true });
    expect(embedded).toMatchObject({ ok: true, signature: 'valid' });
    expect(embedded.statements[0]).toMatch(/internal consistency only, origin not established/);
  });

  it('accepts PEM, raw base64url and hex keys, and interoperates with node:crypto', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pemPriv = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const pemPub = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const msg = new TextEncoder().encode('verify gate');
    const s = await sign(msg, pemPriv);
    expect(await verify(msg, s.signature, pemPub)).toBe(true);
    expect(s.key_id).toBe(keyIdOf(publicRaw(pemPub)));
    const hex = Buffer.from(publicRaw(pemPub)).toString('hex');
    expect(await verify(msg, s.signature, hex)).toBe(true);
    expect(await verify(new TextEncoder().encode('verify gat3'), s.signature, pemPub)).toBe(false);
  });

  it('signed bytes are stable: re-serialising the ledger with other key order changes nothing', async () => {
    const l = await sampleLedger();
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
    const shuffled = reverseKeys(l) as GateLedgerV1;
    expect(Object.keys(shuffled)[0]).not.toBe(Object.keys(l)[0]);
    expect(Buffer.from(signedBytes(shuffled)).toString()).toBe(Buffer.from(signedBytes(l)).toString());
  });
});

describe('Gate ledger v1.1.0 (verify-parity records)', () => {
  const change = detectSourceChange({ before: 'Refunds within 30 days of purchase.', after: 'Refunds within 14 days of purchase.', captured_at: '2026-10-18T00:00:00.000Z', include_text: true });
  const runs = [
    { run_id: 'previous', outcome: 'supported', sources: { refunds: 'a'.repeat(64) } },
    { run_id: 'this', outcome: 'contradicted', sources: { refunds: 'b'.repeat(64) } },
  ];
  const parity = [sourceChangeRecord(change, { source_id: 'refunds', path: 'policies/refunds.md', include_text: false }), triageRecord('annual-refund-window', runs, triageDisagreement(runs))];
  const withParity = async () => {
    const l = await sampleLedger();
    return buildLedger({ run: l.run, cases: l.cases, decision: l.decision, parity });
  };

  it('chains each parity record between the cases and the decision', async () => {
    const l = await withParity();
    expect(l.ledger_version).toBe('1.1.0');
    expect(l.parity).toEqual(parity);
    expect(l.chain.entries.map((e) => e.kind)).toEqual(['run', 'case', 'case', 'parity', 'parity', 'decision']);
    expect(l.chain.entries[3].payload_hash).toBe(sha256Hex(jcs(parity[0] as unknown as Json)));
    expect(await verifyLedger(l)).toMatchObject({ ok: true, chain: 'valid' });
  });

  it('without parity records the ledger stays 1.0.0', async () => {
    const l = await sampleLedger();
    expect(l.ledger_version).toBe('1.0.0');
    expect('parity' in l).toBe(false);
  });

  it('detects a changed, dropped or smuggled parity record after signing', async () => {
    const keys = await generateKeyPair();
    const signed = await signLedger(await withParity(), keys.private_key, 'repository-secret');
    const trusted = { trusted_keys: [{ public_key: keys.public_key }] };
    expect(await verifyLedger(signed, trusted)).toMatchObject({ ok: true, signature: 'valid' });
    const mutations: ((l: GateLedgerV1) => void)[] = [
      (l) => ((l.parity![0] as { kind: string }).kind = 'cosmetic'),
      (l) => (l.parity = l.parity!.slice(1)),
      (l) => delete l.parity,
      (l) => ((l as { ledger_version: string }).ledger_version = '1.0.0'),
    ];
    for (const m of mutations) {
      const copy = structuredClone(signed);
      m(copy);
      expect((await verifyLedger(copy, trusted)).ok).toBe(false);
    }
    const unsigned = await sampleLedger();
    expect((await verifyLedger({ ...unsigned, parity })).ok).toBe(false); // a 1.0.0 ledger carries no parity records
  });
});
