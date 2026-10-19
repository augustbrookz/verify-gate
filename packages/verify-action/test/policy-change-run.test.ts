/**
 * Document change mode through the real runner: a pull request edits a policy
 * (30 → 14 days, plus "annual plans only") in a golden set that lives in a
 * subfolder (working-directory), with no code or prompt change.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { verifyLedger } from '@xyntherium/verify-policy';
import { runGate, type GateRunOptions } from '../src/gate/run';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const OLD = 'SOURCE-TEXT-MARKER. Annual plans can be cancelled for a full refund within 30 days of purchase. Monthly plans are not refundable. Refunds are issued to the original payment method within 5 business days of approval.';
const NEW = OLD.replace('within 30 days', 'within 14 days').replace('of approval.', 'of approval (annual plans only).');
const PROMO = 'Team plans get 20% off for three months.';

const TESTS = `tests:
  - id: annual-refund-window
    source_ids: [refunds]
    question: "Can I get a refund on an annual plan?"
    answer: "Annual plans can be cancelled for a full refund within 30 days of purchase."
    required_conditions:
      - { class: deadline, text: "within 30 days of purchase" }
  - id: refund-payment-method
    source_ids: [refunds]
    question: "How are refunds paid?"
    answer: "Refunds are issued to the original payment method within 5 business days of approval."
    required_conditions:
      - { class: deadline, text: "within 5 business days of approval" }
  - id: monthly-not-refundable
    source_ids: [refunds]
    question: "Are monthly plans refundable?"
    answer: "Monthly plans are not refundable."
    required_conditions:
      - { class: negation, text: "not refundable" }
`;
const config = (o: { hash: string; version: string | null; supersedes?: string; tests?: boolean; extra?: string }) => `version: 1
sources:
  - id: refunds
    path: kb/refunds.md
${o.version ? `    version: "${o.version}"\n` : ''}    sha256: ${o.hash}${o.supersedes ? `\n    supersedes: ["${o.supersedes}"]` : ''}
${o.extra ?? ''}${o.tests === false ? '' : TESTS}suites:
  - name: support
    cases:
      - id: annual-refund-window
        question: "Can I get a refund on an annual plan?"
        answer: "Annual plans can be cancelled for a full refund within 30 days of purchase."
        material_claims:
          - { claim: "Annual plans can be cancelled for a full refund within 30 days of purchase", materiality: critical, quote: "Annual plans can be cancelled for a full refund within 30 days of purchase.", source: refunds }
`;
const OLD_CONFIG = config({ hash: sha(OLD), version: '2026-10' });
const NEW_CONFIG = config({ hash: sha(NEW), version: '2026-11', supersedes: 'refunds@2026-10' });

function repo(cfg = NEW_CONFIG, text = NEW): { root: string; app: string } {
  const root = mkdtempSync(join(tmpdir(), 'xyn-dc-'));
  const app = join(root, 'app');
  mkdirSync(join(app, 'kb'), { recursive: true });
  writeFileSync(join(app, 'kb/refunds.md'), text);
  writeFileSync(join(app, 'kb/promotions.md'), PROMO);
  writeFileSync(join(app, 'verify-gate.yml'), cfg);
  return { root, app };
}

function fakeGitHub(o: { files: string[]; base: Record<string, string> }) {
  const calls: string[] = [];
  const checks: { name: string; conclusion: string; output: { title: string; summary: string } }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const m = init?.method ?? 'GET';
    calls.push(`${m} ${u.pathname}${u.search}`);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (u.pathname.endsWith('/files')) return json(o.files.map((filename) => ({ filename })));
    if (u.pathname.includes('/contents/')) {
      const p = decodeURIComponent(u.pathname.split('/contents/')[1]);
      return u.searchParams.get('ref') === 'base123' && o.base[p] !== undefined ? new Response(o.base[p], { status: 200 }) : new Response('{}', { status: 404 });
    }
    if (u.pathname.endsWith('/check-runs')) {
      checks.push(JSON.parse(String(init!.body)));
      return json({ id: 1 }, 201);
    }
    if (/\/issues\/\d+\/comments$/.test(u.pathname)) return m === 'GET' ? json([]) : json({ id: 9 }, 201);
    if (/\/issues\/\d+$/.test(u.pathname)) return json({ labels: [] });
    return json({}, 200);
  }) as unknown as typeof fetch;
  return { f, calls, checks };
}

const gh = { api_url: 'https://api.github.test', token: 'ghs_TOKEN', owner: 'acme', repo: 'bot', sha: 'head123', base_sha: 'base123', ref: 'refs/pull/7/merge', pull_number: 7, event_name: 'pull_request', actor: 'dev', run_id: '1' };
const BASE = { 'app/kb/refunds.md': OLD, 'app/verify-gate.yml': OLD_CONFIG, 'app/kb/promotions.md': PROMO };

function opts(r: { root: string; app: string }, over: Partial<GateRunOptions> = {}): GateRunOptions {
  return { root: r.app, repo_root: r.root, config_path: 'verify-gate.yml', mode: null, api_key: null, base_url: 'https://x.test', fail_on: ['block'], upload_sarif: false, comment_pr: true, artifact_path: '.xyntherium', signing_key: null, cache_dir: null, full_run: false, env: {}, github: null, log: () => {}, ...over };
}

describe('document change mode in a pull request', () => {
  it('re-runs only the linked tests: before → after, lost and newly required conditions, one unprotected change, its own check', async () => {
    const r0 = repo();
    writeFileSync(join(r0.app, 'kb/promotions.md'), PROMO.replace('20%', '25%'));
    const fg = fakeGitHub({ files: ['app/kb/refunds.md', 'app/kb/promotions.md', 'app/verify-gate.yml'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    const pc = r.policy_change!;
    expect(pc.title).toBe('Policy changed: 2 answers need review');
    expect(pc.tests.map((t) => [t.id, t.verdict_before, t.verdict_after, t.decision, t.reported])).toEqual([
      ['annual-refund-window', 'supported', 'contradicted', 'block', 'warn'],
      ['refund-payment-method', 'supported', 'supported', 'block', 'warn'],
      ['monthly-not-refundable', 'supported', 'supported', 'pass', 'pass'],
    ]);
    expect(pc.unprotected).toEqual([{ path: 'kb/promotions.md', source_id: null, reason: 'not_a_source', change_kind: 'real' }]);

    const check = fg.checks.find((c) => c.name === 'Verify Gate: policy change')!;
    expect(check).toMatchObject({ conclusion: 'neutral', output: { title: 'Policy changed: 2 answers need review' } });
    expect(check.output.summary).toContain('| `annual-refund-window` | supported → contradicted | ❌ lost deadline "within 30 days of purchase" (now: "within 14 days of purchase")');
    expect(check.output.summary).toContain('**Unprotected source change:** `kb/promotions.md`');
    expect(r.outputs['policy-changed-answers']).toBe('2');
    expect(r.exit_code).toBe(r.ledger!.decision.exit_code); // report-only: the check changes no exit code

    const stored = readFileSync(r.paths.policy_change, 'utf8');
    expect(stored).not.toMatch(/SOURCE-TEXT-MARKER|14 days|annual plans only|Annual plans can be cancelled/);
    expect(JSON.parse(stored)).toMatchObject({ mode: 'document_change', needs_review: 2, enforcement: 'report_only', method: 'code_only' });
  });

  it('enforce fails the job through the document change check alone', async () => {
    const r0 = repo(NEW_CONFIG.replace('tests:', 'policy_change: { enforcement: enforce }\ntests:'));
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f, fail_on: [] }));
    expect(r.ledger!.decision.exit_code).toBe(0);
    expect(r.exit_code).toBe(1);
    expect(fg.checks.find((c) => c.name === 'Verify Gate: policy change')!.conclusion).toBe('failure');
  });

  it('a changed source with no version holds its linked tests', async () => {
    const r0 = repo(config({ hash: sha(NEW), version: null }));
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    expect(r.policy_change!.tests.every((t) => t.decision === 'hold')).toBe(true);
  });

  it('changed files outside the working directory are not relevant: skipped, no check', async () => {
    const r0 = repo();
    const fg = fakeGitHub({ files: ['other/README.md', 'kb/refunds.md'], base: {} });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    expect(r.skipped).toBe(true);
    expect(r.policy_change).toBeNull();
  });

  it('verify-cli: no pull request, the base and the changed files come from git; an unpinned edit still holds the Gate', async () => {
    const r0 = repo(OLD_CONFIG, NEW);
    const r = await runGate(opts(r0, { base_text: async (p) => BASE[p as keyof typeof BASE] ?? null, changed_files: async () => ['app/kb/refunds.md'] }));
    expect(r.decision).toBe('hold'); // a changed source is never a silent re-baseline
    expect(r.policy_change!.needs_review).toBe(2);
    expect(r.policy_change!.changed_sources[0]).toMatchObject({ before_available: true, supersedes_previous: false });
  });

  it('without tests[], each suite case that uses the changed source is an implicit test', async () => {
    const r0 = repo(config({ hash: sha(NEW), version: '2026-11', tests: false }));
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: { ...BASE, 'app/verify-gate.yml': config({ hash: sha(OLD), version: '2026-10', tests: false }) } });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    expect(r.policy_change!.tests.map((t) => [t.id, t.kind, t.verdict_after, t.decision])).toEqual([['support/annual-refund-window', 'case', 'contradicted', 'block']]);
  });

  it('compares with the previous run’s verdict for the base version when the cache has it', async () => {
    const r0 = repo(OLD_CONFIG, OLD);
    const cache = join(r0.app, '.cache');
    await runGate(opts(r0, { cache_dir: cache })); // the previous run, on the base version: records each test's verdict
    writeFileSync(join(r0.app, 'kb/refunds.md'), NEW);
    writeFileSync(join(r0.app, 'verify-gate.yml'), NEW_CONFIG);
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f, cache_dir: cache }));
    expect(r.policy_change!.tests.map((t) => t.before_from)).toEqual(['previous_run', 'previous_run', 'previous_run']);
    expect(r.policy_change!.tests[0].verdict_before).toBe('supported');
  });

  it('the ledger carries the parity results (1.1.0): each changed source, hash-chained, without text', async () => {
    const r0 = repo();
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    const ledger = JSON.parse(readFileSync(r.paths.ledger, 'utf8'));
    expect(ledger.ledger_version).toBe('1.1.0');
    const changes = ledger.parity.filter((p: { record_type: string }) => p.record_type === 'source_change');
    expect(changes).toEqual([expect.objectContaining({ source_id: 'refunds', path: 'kb/refunds.md', kind: 'real', schema: 'source-document@1', before_text_sha256: sha(OLD), after_text_sha256: sha(NEW) })]);
    expect(changes[0].changes.map((c: { type: string; class: string | null }) => `${c.type}:${c.class}`)).toEqual(expect.arrayContaining(['condition_changed:deadline', 'condition_added:scope']));
    expect(ledger.chain.entries.filter((e: { kind: string }) => e.kind === 'parity')).toHaveLength(ledger.parity.length);
    expect(JSON.stringify(ledger.parity)).not.toMatch(/SOURCE-TEXT-MARKER|14 days|30 days|annual plans only/);
    expect(await verifyLedger(ledger)).toMatchObject({ ok: true, chain: 'valid' });
    const schema = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(new URL('../../../schemas/verify-gate-ledger-1.1.0.schema.json', import.meta.url), 'utf8')));
    expect(schema(ledger), JSON.stringify(schema.errors)).toBe(true);
    expect(schema({ ...ledger, ledger_version: '1.0.0' })).toBe(false);
  });

  it('a cosmetic-only edit of a source passes its linked tests and is recorded as cosmetic', async () => {
    const COSMETIC = OLD.replace('within 30 days', 'within thirty (30) days').replace('Monthly plans are not', 'Monthly plans are\nnot');
    const r0 = repo(config({ hash: sha(COSMETIC), version: '2026-11', supersedes: 'refunds@2026-10' }), COSMETIC);
    const fg = fakeGitHub({ files: ['app/kb/refunds.md'], base: BASE });
    const r = await runGate(opts(r0, { github: gh, fetch: fg.f }));
    expect(r.policy_change!.tests.map((t) => t.decision)).toEqual(['pass', 'pass', 'pass']);
    const ledger = JSON.parse(readFileSync(r.paths.ledger, 'utf8'));
    expect(ledger.parity.find((p: { record_type: string }) => p.record_type === 'source_change')).toMatchObject({ kind: 'cosmetic', changes: [] });
  });

  it('policy_change.enabled: false turns it off', async () => {
    const r0 = repo(OLD_CONFIG.replace('tests:', 'policy_change: { enabled: false }\ntests:'), NEW);
    const r = await runGate(opts(r0, { base_text: async () => OLD, changed_files: async () => ['app/kb/refunds.md'] }));
    expect(r.policy_change).toBeNull();
  });
});
