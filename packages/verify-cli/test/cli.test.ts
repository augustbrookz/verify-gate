import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../verify-action/src/gate/config';
import { main, parseArgs } from '../src/cli';

const ROOT = new URL('../../..', import.meta.url).pathname;
const schema = new Ajv().compile(JSON.parse(readFileSync(join(ROOT, 'schemas/verify-gate.schema.json'), 'utf8')));

function docsRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xyn-cli-'));
  writeFileSync(join(dir, 'README.md'), '# Acme Help Center\n\nAcme answers support questions about plans and billing.\n\nAnnual plans can be cancelled for a full refund within 30 days of purchase.\n');
  mkdirSync(join(dir, 'docs/billing'), { recursive: true });
  writeFileSync(join(dir, 'docs/billing/pricing.md'), '# Pricing\n\nThe Team plan costs $49 per user per month when billed annually.\nOverage is billed at $0.02 per extra request after the first 10,000 requests each month.\n```\ncode block that must be ignored: The Team plan costs $1.\n```\n');
  writeFileSync(join(dir, 'docs/billing/refunds.md'), '# Refunds\n\n- Monthly plans are not refundable unless the service was unavailable for more than 24 hours.\n- Refunds are issued to the original payment method within 5 business days.\n');
  return dir;
}

function capture() {
  const lines: string[] = [];
  const errs: string[] = [];
  return { out: { log: (s: string) => lines.push(s), err: (s: string) => errs.push(s) }, lines, errs };
}

describe('xyntherium-verify', () => {
  it('parses flags', () => {
    expect(parseArgs(['ledger', 'verify', 'l.json', '--public-key', 'k', '--json', '--fail-on=block,hold'])).toEqual({ _: ['ledger', 'verify', 'l.json'], flags: { 'public-key': 'k', json: true, 'fail-on': 'block,hold' } });
  });

  it('init drafts 10–20-style starter cases from the docs: draft, verbatim quotes, schema-valid, plus a workflow', async () => {
    const dir = docsRepo();
    const c = capture();
    expect(await main(['init'], { cwd: dir, out: c.out })).toBe(0);
    const yamlText = readFileSync(join(dir, 'verify-gate.yml'), 'utf8');
    expect(yamlText).toMatch(/DRAFT: review before trusting/);
    const doc = load(yamlText) as { draft: boolean; suites: { cases: { material_claims: { quote: string; source: string }[] }[] }[]; sources: { id: string; path: string }[] };
    expect(doc.draft).toBe(true);
    expect(schema(doc), JSON.stringify(schema.errors)).toBe(true);
    const cfg = parseConfig(yamlText);
    expect(cfg.suites[0].cases.length).toBeGreaterThanOrEqual(4);
    for (const k of doc.suites[0].cases) {
      const mc = k.material_claims[0];
      const src = doc.sources.find((s) => s.id === mc.source)!;
      expect(readFileSync(join(dir, src.path), 'utf8')).toContain(mc.quote);
      expect(mc.quote).not.toMatch(/\$1\./); // never from a code block
    }
    expect(readFileSync(join(dir, '.github/workflows/verify-gate.yml'), 'utf8')).toMatch(/uses: augustbrookz\/verify-gate@v0/);
    expect(await main(['init'], { cwd: dir, out: capture().out })).toBe(2); // refuses to overwrite
  });

  it('quickstart: init then run gives a first real result in seconds, reported not enforced (draft)', async () => {
    const dir = docsRepo();
    const t0 = Date.now();
    expect(await main(['init'], { cwd: dir, out: capture().out })).toBe(0);
    const c = capture();
    const code = await main(['run'], { cwd: dir, out: c.out, env: {} });
    expect(code).toBe(0);
    expect(c.lines.join('\n')).toMatch(/Decision: pass/);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(readFileSync(join(dir, '.xyntherium/verify-gate-summary.md'), 'utf8')).toMatch(/draft: review before trusting/);
  });

  it('pin writes current hashes and nothing else', async () => {
    const dir = docsRepo();
    await main(['init'], { cwd: dir, out: capture().out });
    const before = readFileSync(join(dir, 'verify-gate.yml'), 'utf8');
    writeFileSync(join(dir, 'docs/billing/refunds.md'), readFileSync(join(dir, 'docs/billing/refunds.md'), 'utf8').replace('5 business days', '7 business days'));
    const held = capture();
    await main(['run'], { cwd: dir, out: held.out, env: {} });
    expect(held.lines.join('\n')).toMatch(/Decision: hold/);
    const c = capture();
    expect(await main(['pin'], { cwd: dir, out: c.out })).toBe(0);
    expect(c.lines[0]).toMatch(/^pinned docs-billing-refunds/);
    const after = readFileSync(join(dir, 'verify-gate.yml'), 'utf8');
    const diff = after.split('\n').filter((l, i) => l !== before.split('\n')[i]);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatch(/sha256: [0-9a-f]{64}/);
  });

  it('ledger verify: OK on an untouched signed ledger, FAIL on a tampered one, --require-signature on unsigned', async () => {
    const dir = docsRepo();
    await main(['init'], { cwd: dir, out: capture().out });
    const k = capture();
    await main(['keygen', '--out', 'gate.key'], { cwd: dir, out: k.out });
    const keyText = readFileSync(join(dir, 'gate.key'), 'utf8').trim();
    expect(k.lines.join('\n')).not.toContain(keyText);
    const pem = k.lines.join('\n').slice(k.lines.join('\n').indexOf('-----BEGIN PUBLIC KEY-----'));
    writeFileSync(join(dir, 'gate.pub'), pem);
    await main(['run'], { cwd: dir, out: capture().out, env: { XYN_GATE_SIGNING_KEY: keyText } });
    const ok = capture();
    expect(await main(['ledger', 'verify', '.xyntherium/verify-gate-ledger.json', '--public-key', 'gate.pub'], { cwd: dir, out: ok.out })).toBe(0);
    expect(ok.lines[0]).toMatch(/^OK {2}chain: valid; signature: valid/);
    expect(ok.lines.join('\n')).toMatch(/does not establish that the instruction, evidence, claims/);
    const l = JSON.parse(readFileSync(join(dir, '.xyntherium/verify-gate-ledger.json'), 'utf8'));
    expect(l.cases[0].claims[0].verdict).toBe('supported');
    l.cases[0].claims[0].verdict = 'contradicted'; // a real change: this run's claims are supported
    l.decision.decision = 'block';
    writeFileSync(join(dir, 'tampered.json'), JSON.stringify(l));
    const bad = capture();
    expect(await main(['ledger', 'verify', 'tampered.json', '--public-key', 'gate.pub'], { cwd: dir, out: bad.out })).toBe(1);
    expect(bad.lines[0]).toMatch(/^FAIL/);
    await main(['run'], { cwd: dir, out: capture().out, env: {} });
    expect(await main(['ledger', 'verify', '.xyntherium/verify-gate-ledger.json'], { cwd: dir, out: capture().out })).toBe(0);
    expect(await main(['ledger', 'verify', '.xyntherium/verify-gate-ledger.json', '--require-signature'], { cwd: dir, out: capture().out })).toBe(1);
  });

  it('ledger verify reads a keys document (as served at /v1/gate/keys)', async () => {
    const dir = docsRepo();
    await main(['init'], { cwd: dir, out: capture().out });
    const k = capture();
    await main(['keygen', '--out', 'gate.key'], { cwd: dir, out: k.out });
    const keyText = readFileSync(join(dir, 'gate.key'), 'utf8').trim();
    await main(['run'], { cwd: dir, out: capture().out, env: { XYN_GATE_SIGNING_KEY: keyText } });
    const ledger = JSON.parse(readFileSync(join(dir, '.xyntherium/verify-gate-ledger.json'), 'utf8'));
    writeFileSync(join(dir, 'keys.json'), JSON.stringify({ keys: [{ key_id: ledger.signing.key_id, alg: 'Ed25519', public_key: ledger.signature.public_key }] }));
    expect(await main(['ledger', 'verify', '.xyntherium/verify-gate-ledger.json', '--keys', 'keys.json', '--require-signature'], { cwd: dir, out: capture().out })).toBe(0);
  });
});

describe('init --policy-gate and document change mode from a terminal', () => {
  const policyRepo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyn-pg-'));
    mkdirSync(join(dir, 'kb'));
    writeFileSync(join(dir, 'kb/refunds.md'), '# Refund policy\n\nAnnual plans can be cancelled for a full refund within 30 days of purchase.\nRefunds are issued to the original payment method within 5 business days of approval.\n');
    writeFileSync(join(dir, 'kb/promotions.md'), '# Promotions\n\nNew Team customers get 20% off their first three months, except on add-on seats.\n');
    writeFileSync(join(dir, 'README.md'), '# App\n\nNothing about policies here.\n');
    return dir;
  };

  it('drafts sources, tests and required conditions from the policy docs, marked draft, schema-valid', async () => {
    const dir = policyRepo();
    const c = capture();
    expect(await main(['init', '--policy-gate'], { cwd: dir, out: c.out })).toBe(0);
    const text = readFileSync(join(dir, 'verify-gate.yml'), 'utf8');
    expect(text).toMatch(/DRAFT, review before trusting/);
    const doc = load(text) as { draft: boolean; sources: { id: string; path: string; version: string }[]; tests: { id: string; source_ids: string[]; answer: string; required_conditions: { class: string; text: string }[] }[] };
    expect(doc.draft).toBe(true);
    expect(schema(doc)).toBe(true);
    expect(doc.sources.map((s) => s.path).sort()).toEqual(['kb/promotions.md', 'kb/refunds.md']);
    expect(doc.sources.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.version))).toBe(true);
    const refund = doc.tests.find((t) => t.answer.startsWith('Annual plans'))!;
    expect(refund.required_conditions).toContainEqual({ class: 'deadline', text: 'within 30 days of purchase' });
    const promo = doc.tests.find((t) => t.answer.startsWith('New Team'))!;
    expect(promo.required_conditions.map((x) => x.class)).toContain('exception');
    for (const t of doc.tests) for (const rc of t.required_conditions) expect(readFileSync(join(dir, doc.sources.find((s) => s.id === t.source_ids[0])!.path), 'utf8')).toContain(rc.text);
    expect(parseConfig(text).tests.length).toBe(doc.tests.length);
    expect(c.lines.join('\n')).toMatch(/draft: review before trusting/);
  });

  it('an uncommitted policy edit: run compares with HEAD and prints "Policy changed: N answers need review"', async () => {
    const dir = policyRepo();
    await main(['init', '--policy-gate'], { cwd: dir, out: capture().out });
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
    writeFileSync(join(dir, 'kb/refunds.md'), readFileSync(join(dir, 'kb/refunds.md'), 'utf8').replace('within 30 days', 'within 14 days'));
    const c = capture();
    await main(['run', '--fail-on', 'none'], { cwd: dir, out: c.out, env: {} });
    expect(c.lines.join('\n')).toMatch(/Policy changed: 1 answer needs review \(report-only\)/);
    const report = JSON.parse(readFileSync(join(dir, '.xyntherium/verify-gate-policy-change.json'), 'utf8'));
    expect(report.tests.find((t: { decision: string }) => t.decision === 'block')).toBeTruthy();
  });
});

describe('init drafting (found in the outside-repository trial, 2026-10-19)', () => {
  it('does not split a sentence after "p.m." or "e.g.", so a drafted answer keeps its whole condition', async () => {
    const { sentencesOf, questionFor } = await import('../src/init');
    const s = sentencesOf('Express shipping costs $15 and delivers within 2 business days if the order is placed before 1 p.m. Eastern time. Standard shipping is free on orders over $50 within the contiguous United States.');
    expect(s[0]).toBe('Express shipping costs $15 and delivers within 2 business days if the order is placed before 1 p.m. Eastern time.');
    expect(s).toHaveLength(2);
    expect(questionFor(s[0], 'Shipping')).not.toMatch(/within 2\?$/);
  });
});
