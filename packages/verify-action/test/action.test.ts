import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runFixtures, summaryMarkdown } from '../src/run';

const dir = mkdtempSync(join(tmpdir(), 'xyn-action-'));
const FIXTURES = join(dir, 'fixtures.jsonl');
writeFileSync(
  FIXTURES,
  [
    { name: 'refund ok', question: 'q', answer: 'Refunds take 10 business days.', sources: [{ id: 'kb', text: 'Refunds take 10 business days.' }] },
    { name: 'refund drops condition', question: 'q', answer: 'You get a full refund within 30 days.', sources: [{ id: 'kb', text: 'Annual plans get a full refund within 30 days.' }] },
  ]
    .map((f) => JSON.stringify(f))
    .join('\n'),
);

const reply = (answer: string) => ({
  release_recommendation: answer.startsWith('Refunds') ? 'allow' : 'revise',
  claims: answer.startsWith('Refunds') ? [] : [{ verdict: 'unsupported', failure_reason: 'qualifier_loss', text: answer }],
});

const fakeFetch = (async (_url: string, init: RequestInit) => new Response(JSON.stringify(reply(JSON.parse(String(init.body)).answer)), { status: 200 })) as unknown as typeof fetch;

describe('verify-action', () => {
  it('fails when a fixture is outside the allowed recommendations', async () => {
    const r = await runFixtures({ apiKey: 'k', fixturesPath: FIXTURES, allowed: ['allow'], maxFailures: 0, baseUrl: 'https://x', concurrency: 2, fetch: fakeFetch });
    expect(r.failed).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.outcomes[1].problems[0]).toContain('qualifier_loss');
    expect(summaryMarkdown(r.outcomes, r.ok, { allowed: ['allow'], maxFailures: 0 })).toContain('❌ | refund drops condition | revise');
  });

  it('passes within a configured failure threshold', async () => {
    const r = await runFixtures({ apiKey: 'k', fixturesPath: FIXTURES, allowed: ['allow'], maxFailures: 1, baseUrl: 'https://x', concurrency: 2, fetch: fakeFetch });
    expect(r.ok).toBe(true);
  });

  it('runs end to end as a bundled Action against an HTTP endpoint', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(reply(JSON.parse(body).answer)));
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const out = join(dir, 'out.txt');
    const summary = join(dir, 'summary.md');
    writeFileSync(out, '');
    writeFileSync(summary, '');
    // GitHub passes inputs as INPUT_<NAME> with hyphens kept (INPUT_API-KEY).
    const code = await new Promise<number>((resolve) => {
      const child = spawn('node', [new URL('../dist/index.js', import.meta.url).pathname], {
        env: { ...process.env, 'INPUT_API-KEY': 'xyn_test_action', INPUT_FIXTURES: FIXTURES, 'INPUT_BASE-URL': `http://127.0.0.1:${port}`, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary },
        stdio: 'pipe',
      });
      child.on('close', (c) => resolve(c ?? -1));
    });
    server.close();
    expect(code).toBe(1);
    expect(seen[0]).toBe('POST /v1/verify Bearer xyn_test_action');
    expect(readFileSync(out, 'utf8')).toContain('failed=1');
    expect(readFileSync(summary, 'utf8')).toContain('Xyntherium Verify: failed');
  });
});
