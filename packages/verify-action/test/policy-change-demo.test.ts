/**
 * The support-bot demo (examples/support-bot/demo/policy-change.patch): a pull
 * request that only edits policy text: the refund window goes from 30 to 14
 * days, refunds become "annual plans only", the golden set re-pins the source
 * and declares it supersedes version 2026-10, and kb/promotions.md (linked to
 * no test) changes too. The bot is unchanged and still answers "30 days".
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transport } from '../src/gate/endpoint';
import { runGate } from '../src/gate/run';

const EXAMPLE = new URL('../../../examples/support-bot/', import.meta.url).pathname;

describe('support-bot policy-change demo', () => {
  it('30 → 14 days and an added "annual plans only": the before/after table and one unprotected source change', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xyn-demo-'));
    const app = join(root, 'examples/support-bot');
    cpSync(EXAMPLE, app, { recursive: true, filter: (p) => !p.includes('.xyntherium') });
    const patch = join(app, 'demo/policy-change.patch');
    execFileSync('patch', ['-p1', '-s', '-i', patch], { cwd: app });
    const changedFiles = [...readFileSync(patch, 'utf8').matchAll(/^\+\+\+ b\/(\S+)/gm)].map((m) => `examples/support-bot/${m[1]}`);

    // The app under test, as bot/server.mjs serves it.
    const answers = JSON.parse(readFileSync(join(app, 'prompts/answers.json'), 'utf8')) as Record<string, string>;
    const transport: Transport = async ({ body }) => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ answer: answers[JSON.parse(body ?? '{}').question] ?? '' })) });

    const r = await runGate({
      root: app,
      repo_root: root,
      config_path: 'verify-gate.yml',
      mode: null,
      api_key: null,
      base_url: 'https://x.test',
      fail_on: ['block'],
      upload_sarif: false,
      comment_pr: false,
      artifact_path: '.xyntherium',
      signing_key: null,
      cache_dir: null,
      full_run: false,
      env: {},
      github: null,
      transport,
      // The base of the pull request: the example as committed; the changed files: the patch's.
      base_text: async (p) => readFileSync(join(EXAMPLE, p.replace(/^examples\/support-bot\//, '')), 'utf8'),
      changed_files: async () => changedFiles,
      log: () => {},
    });

    const pc = r.policy_change!;
    expect(changedFiles).toEqual(['examples/support-bot/kb/promotions.md', 'examples/support-bot/kb/refunds.md', 'examples/support-bot/verify-gate.yml']);
    expect(pc.title).toBe('Policy changed: 2 answers need review');
    expect(pc.enforcement).toBe('report_only');
    expect(pc.tests.map((t) => [t.id, `${t.verdict_before} → ${t.verdict_after}`, t.reported])).toEqual([
      ['annual-refund-window', 'supported → contradicted', 'warn'],
      ['refund-payment-method', 'supported → supported', 'warn'],
      ['monthly-not-refundable', 'supported → supported', 'pass'],
    ]);
    expect(pc.tests[0].conditions[0]).toMatchObject({ status: 'lost', text: 'within 30 days of purchase', now: 'within 14 days of purchase' });
    expect(pc.tests[0].superseded).toMatchObject({ version: '2026-10', newer_version: '2026-11' });
    expect(pc.tests[1].conditions.find((c) => c.status === 'newly_required')).toMatchObject({ class: 'scope', text: 'annual plans only', in_answer: false });
    // phone-support-scope links plans, which did not change: not re-run.
    expect(pc.tests.some((t) => t.id === 'phone-support-scope')).toBe(false);
    expect(pc.unprotected).toEqual([{ path: 'kb/promotions.md', source_id: null, reason: 'not_a_source', change_kind: 'real' }]);
    expect(r.markdown).toContain('| Test | Verdict before → after | Conditions | Decision | Source change |');
    expect(r.markdown.match(/Unprotected source change/g)).toHaveLength(1);

    // Separately, the Gate itself blocks: the unchanged bot still says 30 days, which the new pinned text contradicts.
    expect(r.decision).toBe('block');
    const annual = r.ledger!.cases.find((c) => c.case_id === 'annual-refund-window')!;
    expect(annual.findings.some((f) => f.rule === 'XYN-001' && f.decision === 'block')).toBe(true);
  });
});
