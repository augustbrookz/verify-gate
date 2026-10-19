import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKeyPair, verifyLedger } from '../../verify-policy/src/index';
import { globToRegExp, relevantChanges } from '../src/gate/changes';
import { ConfigError, parseConfig } from '../src/gate/config';
import { callEndpoint, EndpointError, fillTemplate, isBlockedAddress, pointer, type Transport } from '../src/gate/endpoint';
import { runGate, type GateRunOptions } from '../src/gate/run';
import { selectCases } from '../src/gate/sampling';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const REFUNDS = 'PRIVATE-SOURCE-MARKER. Annual plans can be cancelled for a full refund within 30 days of purchase. Monthly plans are not refundable. Refunds are issued to the original payment method within 5 business days.';

function repo(over: { config?: (h: string) => string; files?: Record<string, string> } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'xyn-gate-'));
  mkdirSync(join(dir, 'policies'), { recursive: true });
  writeFileSync(join(dir, 'policies/refunds.md'), REFUNDS);
  for (const [p, t] of Object.entries(over.files ?? {})) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), t);
  }
  const cfg = (over.config ?? defaultConfig)(sha(REFUNDS));
  writeFileSync(join(dir, 'verify-gate.yml'), cfg);
  return dir;
}

const defaultConfig = (h: string) => `version: 1
sources:
  - id: refunds
    path: policies/refunds.md
    version: "2026-10"
    sha256: ${h}
policy:
  enforcement: enforce
suites:
  - name: support
    cases:
      - id: annual-window
        question: "PRIVATE-QUESTION-MARKER can I get a refund on an annual plan?"
        answer: "Annual plans can be cancelled for a full refund within 30 days of purchase."
        material_claims:
          - claim: "Annual plans can be cancelled for a full refund within 30 days of purchase"
            materiality: critical
      - id: planted-window
        question: "How long is the refund window?"
        answer: "PRIVATE-ANSWER-MARKER. Annual plans can be cancelled for a full refund within 60 days of purchase."
`;

function opts(root: string, over: Partial<GateRunOptions> = {}): GateRunOptions & { lines: string[] } {
  const lines: string[] = [];
  return {
    root,
    config_path: 'verify-gate.yml',
    mode: null,
    api_key: null,
    base_url: 'https://xyntherium.test',
    fail_on: ['block'],
    upload_sarif: true,
    comment_pr: true,
    artifact_path: '.xyntherium',
    signing_key: null,
    cache_dir: null,
    full_run: false,
    env: {},
    github: null,
    log: (l) => lines.push(l),
    lines,
    ...over,
  };
}

/** A fake GitHub API recording every call; `fail` makes every write fail. */
function fakeGitHub(o: { fail?: boolean; files?: string[]; labels?: string[]; labeledBy?: string; comments?: { user: string; body: string }[]; perms?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const sarifs: { commit_sha: string; ref: string }[] = [];
  const comments: { id: number; body: string; user: { login: string } }[] = (o.comments ?? []).map((c, i) => ({ id: i + 1, body: c.body, user: { login: c.user }, created_at: '2026-10-18T00:00:00Z' })) as never;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const m = init?.method ?? 'GET';
    calls.push(`${m} ${u.pathname}`);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (o.fail && m !== 'GET') return new Response('nope', { status: 403 });
    if (u.pathname.endsWith('/files')) return json((o.files ?? ['policies/refunds.md']).map((filename) => ({ filename })));
    if (/\/issues\/\d+\/comments$/.test(u.pathname) && m === 'GET') return json(comments);
    if (/\/issues\/\d+\/comments$/.test(u.pathname) && m === 'POST') {
      comments.push({ id: 99, body: JSON.parse(String(init!.body)).body, user: { login: 'github-actions[bot]' } });
      return json({ id: 99 }, 201);
    }
    if (/\/issues\/comments\/\d+$/.test(u.pathname)) return json({});
    if (/\/issues\/\d+\/events$/.test(u.pathname)) return json(o.labeledBy ? [{ event: 'labeled', label: { name: 'verify-gate:override' }, actor: { login: o.labeledBy } }] : []);
    if (/\/issues\/\d+$/.test(u.pathname)) return json({ labels: (o.labels ?? []).map((name) => ({ name })) });
    if (u.pathname.includes('/collaborators/')) return json({ role_name: o.perms?.[decodeURIComponent(u.pathname.split('/')[5])] ?? 'read' });
    if (u.pathname.endsWith('/check-runs')) return json({ id: 1 }, 201);
    if (u.pathname.endsWith('/code-scanning/sarifs')) {
      const b = JSON.parse(String(init!.body)) as { commit_sha: string; ref: string };
      sarifs.push(b);
      // GitHub's rule: a refs/pull/N/merge ref needs the merge commit, not the head commit.
      if (/^refs\/pull\/\d+\/merge$/.test(b.ref) && b.commit_sha === 'abc') return json({ message: 'commit_sha does not match ref' }, 400);
      return json({ id: 'x' }, 202);
    }
    return json({ message: 'not found' }, 404);
  }) as unknown as typeof fetch;
  return { f, calls, comments, sarifs };
}

const gh = { api_url: 'https://api.github.test', token: 'ghs_TOKEN', owner: 'acme', repo: 'support-bot', sha: 'abc', ref: 'refs/pull/7/merge', ref_sha: 'merge123', pull_number: 7, event_name: 'pull_request', actor: 'dev', run_id: '1' };

describe('verify-gate.yml', () => {
  it('parses a valid golden set and records each case line for SARIF', () => {
    const c = parseConfig(defaultConfig('a'.repeat(64)));
    expect(c.suites[0].cases.map((x) => [x.id, x.line])).toEqual([
      ['annual-window', 12],
      ['planted-window', 18],
    ]);
    expect(c.policy.enforcement).toBe('enforce');
    expect(c.suites[0].cases[0].material_claims[0]).toMatchObject({ materiality: 'critical' });
  });

  it.each([
    ['a URL source', (h: string) => defaultConfig(h).replace('policies/refunds.md', 'https://example.com/refunds'), /never fetches sources/],
    ['an unpinned source', (h: string) => defaultConfig(h).replace(`    sha256: ${h}\n`, ''), /sha256 is required/],
    ['a credential written into a header', (h: string) => defaultConfig(h).replace('policy:', 'endpoint:\n  url: https://bot.example.com/ask\n  headers:\n    Authorization: "Bearer sk-live-123"\n  body: \'{"q": "{{question}}"}\'\npolicy:'), /must reference an environment variable/],
    ['an unknown policy key', (h: string) => defaultConfig(h).replace('enforcement: enforce', 'enforce: true'), /policy.enforce is not a known setting/],
    ['a path outside the repository', (h: string) => defaultConfig(h).replace('policies/refunds.md', '../secrets.md'), /stay inside it/],
  ])('rejects %s', (_n, mk, re) => {
    expect(() => parseConfig(mk('a'.repeat(64)))).toThrow(ConfigError);
    try {
      parseConfig(mk('a'.repeat(64)));
    } catch (e) {
      expect((e as ConfigError).message).toMatch(re);
    }
  });
});

describe('endpoint safety', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00:ec2::254', 'fe80::1', '::ffff:10.0.0.1', '224.0.0.1'])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  const base = { url: 'https://bot.example.com/ask', method: 'POST' as const, headers: { authorization: 'Bearer ${env.BOT_TOKEN}' }, body: '{"message": "{{question}}"}', answer_path: '/answer', timeout_ms: 5_000, max_response_bytes: 10_000, retries: 2 };

  it('JSON-escapes the question and expands env refs, retries 503 then succeeds', async () => {
    const seen: { body: string | null; headers: Record<string, string> }[] = [];
    let n = 0;
    const t: Transport = async (r) => {
      seen.push({ body: r.body, headers: r.headers });
      return ++n < 2 ? { status: 503, headers: {}, body: Buffer.from('') } : { status: 200, headers: {}, body: Buffer.from(JSON.stringify({ answer: 'ok "answer"' })) };
    };
    const r = await callEndpoint(base, 'say "hi"\n', { env: { BOT_TOKEN: 's3cret' }, network_mode: 'public', transport: t, backoff_ms: 1 });
    expect(r.answer).toBe('ok "answer"');
    expect(r.attempts).toBe(2);
    expect(JSON.parse(seen[0].body!)).toEqual({ message: 'say "hi"\n' });
    expect(seen[0].headers.authorization).toBe('Bearer s3cret');
  });

  it('refuses plain http, IP-literal private hosts and redirects; does not retry a 4xx', async () => {
    const ok: Transport = async () => ({ status: 200, headers: {}, body: Buffer.from('{"answer":"x"}') });
    await expect(callEndpoint({ ...base, url: 'http://bot.example.com/ask' }, 'q', { env: {}, network_mode: 'public', transport: ok })).rejects.toThrow(/must use https/);
    await expect(callEndpoint({ ...base, url: 'https://169.254.169.254/latest' }, 'q', { env: {}, network_mode: 'public', transport: ok })).rejects.toThrow(/private, loopback or metadata/);
    let calls = 0;
    const redirect: Transport = async () => (calls++, { status: 302, headers: { location: 'http://10.0.0.1' }, body: Buffer.from('') });
    await expect(callEndpoint(base, 'q', { env: {}, network_mode: 'public', transport: redirect })).rejects.toThrow(/redirects are not followed/);
    calls = 0;
    const notFound: Transport = async () => (calls++, { status: 404, headers: {}, body: Buffer.from('') });
    await expect(callEndpoint(base, 'q', { env: {}, network_mode: 'public', transport: notFound, backoff_ms: 1 })).rejects.toThrow(EndpointError);
    expect(calls).toBe(1);
  });

  it('blocks a hostname that resolves to loopback at connect time (public), allows it with network_mode: local', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ answer: 'from local' }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const e = { ...base, url: `http://localhost:${port}/ask`, headers: {} };
    await expect(callEndpoint({ ...e, url: `https://localhost:${port}/ask` }, 'q', { env: {}, network_mode: 'public', backoff_ms: 1 })).rejects.toThrow();
    const r = await callEndpoint(e, 'q', { env: {}, network_mode: 'local' });
    expect(r.answer).toBe('from local');
    server.close();
  });

  it('templates and JSON pointers', () => {
    expect(fillTemplate('https://x/ask?q={{question}}', 'a b&c', 'url')).toBe('https://x/ask?q=a%20b%26c');
    expect(fillTemplate('{"q": {{question}}}', 'x', 'json')).toBe('{"q": "x"}');
    expect(pointer({ data: { reply: [{ text: 'hi' }] } }, '/data/reply/0/text')).toBe('hi');
  });
});

describe('Gate run (local mode)', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.length);

  it('blocks a planted number with a deterministic finding; writes ledger, SARIF and Markdown', async () => {
    const root = repo();
    const o = opts(root);
    const r = await runGate(o);
    expect(r.decision).toBe('block');
    expect(r.exit_code).toBe(1);
    expect(r.outputs).toMatchObject({ decision: 'block', 'ledger-path': '.xyntherium/verify-gate-ledger.json', 'sarif-path': '.xyntherium/verify-gate.sarif', 'material-failures': '1' });
    const ledger = JSON.parse(readFileSync(r.paths.ledger, 'utf8'));
    expect(ledger.cases.map((c: { decision: string }) => c.decision)).toEqual(['pass', 'block']);
    const f = ledger.cases[1].findings.find((x: { rule: string }) => x.rule === 'XYN-001');
    expect(f).toMatchObject({ rule: 'XYN-001', decision: 'block', deterministic: true });
    expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const sarif = JSON.parse(readFileSync(r.paths.sarif, 'utf8'));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.rules.map((x: { id: string }) => x.id)).toEqual(['XYN-001', 'XYN-002', 'XYN-003', 'XYN-004', 'XYN-005', 'XYN-006']);
    const result = sarif.runs[0].results.find((x: { ruleId: string }) => x.ruleId === 'XYN-001');
    expect(result).toMatchObject({ level: 'error', locations: [{ physicalLocation: { artifactLocation: { uri: 'verify-gate.yml' }, region: { startLine: 18 } } }] });
    expect(result.partialFingerprints['xyntheriumFinding/v1']).toBe(f.fingerprint);
    // The unresolved marker sentence is a warning, not an error.
    expect(sarif.runs[0].results.find((x: { ruleId: string }) => x.ruleId === 'XYN-005')?.level).toBe('warning');
    const md = readFileSync(r.paths.markdown, 'utf8');
    expect(md).toMatch(/Deterministic findings \(reproduce identically\)/);
    expect(md).toMatch(/Assurance scope: evidence support for supplied sources only/);
    expect((await verifyLedger(ledger)).ok).toBe(true);
  });

  it('logs ids, hashes and decisions only: no question, answer, source text or token', async () => {
    const root = repo();
    const o = opts(root, { github: gh, ...{ fetch: fakeGitHub().f } });
    await runGate(o);
    const all = o.lines.join('\n');
    for (const secret of ['PRIVATE-SOURCE-MARKER', 'PRIVATE-QUESTION-MARKER', 'PRIVATE-ANSWER-MARKER', 'ghs_TOKEN', 'Annual plans']) expect(all).not.toContain(secret);
    // The ledger holds hashes, not text, unless include_text is set.
    const ledger = readFileSync(join(root, '.xyntherium/verify-gate-ledger.json'), 'utf8');
    for (const secret of ['PRIVATE-SOURCE-MARKER', 'PRIVATE-QUESTION-MARKER', 'PRIVATE-ANSWER-MARKER']) expect(ledger).not.toContain(secret);
  });

  it('report-only never fails the job, and says it would block', async () => {
    const root = repo({ config: (h) => defaultConfig(h).replace('enforcement: enforce', 'enforcement: report_only') });
    const r = await runGate(opts(root));
    expect(r.exit_code).toBe(0);
    expect(r.ledger!.decision).toMatchObject({ decision: 'block', conclusion: 'neutral', title: 'report-only: would block' });
  });

  it('a changed source holds the case, and fails the job only when fail-on includes hold', async () => {
    const root = repo();
    writeFileSync(join(root, 'policies/refunds.md'), REFUNDS.replace('30 days', '14 days'));
    const r1 = await runGate(opts(root));
    expect(r1.decision).toBe('hold');
    expect(r1.exit_code).toBe(0);
    expect(r1.ledger!.cases[0].findings[0]).toMatchObject({ rule: 'XYN-006', kind: 'source_hash_mismatch', decision: 'hold' });
    expect(r1.ledger!.run.sources[0].status).toBe('hash_mismatch');
    const r2 = await runGate(opts(root, { fail_on: ['block', 'hold'] }));
    expect(r2.exit_code).toBe(1);
  });

  it('a missing source holds (the case abstains)', async () => {
    const root = repo();
    writeFileSync(join(root, 'policies/refunds.md'), '');
    expect((await runGate(opts(root))).decision).toBe('hold');
  });

  it('refuses a source that is a symlink out of the repository', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'xyn-outside-'));
    writeFileSync(join(outside, 'secret.md'), REFUNDS);
    const root = repo();
    symlinkSync(join(outside, 'secret.md'), join(root, 'policies/link.md'));
    writeFileSync(join(root, 'verify-gate.yml'), defaultConfig(sha(REFUNDS)).replace('policies/refunds.md', 'policies/link.md'));
    const r = await runGate(opts(root));
    expect(r.ledger!.run.sources[0].status).toBe('missing');
    expect(r.decision).toBe('hold');
  });

  it('writes artifacts before GitHub reporting, and missing permissions never change the decision', async () => {
    const root = repo();
    const fg = fakeGitHub({ fail: true });
    const r = await runGate(opts(root, { github: gh, fetch: fg.f }));
    expect(r.decision).toBe('block');
    expect(existsSync(r.paths.ledger) && existsSync(r.paths.sarif) && existsSync(r.paths.markdown)).toBe(true);
    expect(r.notes.join(' ')).toMatch(/PR comment not posted[\s\S]*check run not created[\s\S]*SARIF not uploaded/);
  });

  it('upserts one PR comment (updates it on the next run), creates a check run and uploads SARIF', async () => {
    const root = repo();
    const fg = fakeGitHub();
    await runGate(opts(root, { github: gh, fetch: fg.f }));
    await runGate(opts(root, { github: gh, fetch: fg.f }));
    expect(fg.calls.filter((c) => c === 'POST /repos/acme/support-bot/issues/7/comments')).toHaveLength(1);
    expect(fg.calls.filter((c) => c.startsWith('PATCH /repos/acme/support-bot/issues/comments/'))).toHaveLength(1);
    expect(fg.calls).toContain('POST /repos/acme/support-bot/check-runs');
    expect(fg.calls).toContain('POST /repos/acme/support-bot/code-scanning/sarifs');
    // SARIF goes to the merge ref with the merge commit (GITHUB_SHA), not the head commit.
    expect(fg.sarifs[0]).toMatchObject({ ref: 'refs/pull/7/merge', commit_sha: 'merge123' });
  });

  it('skips when no relevant file changed', async () => {
    const root = repo();
    const fg = fakeGitHub({ files: ['README.md', 'src/unrelated.ts'] });
    const r = await runGate(opts(root, { github: gh, fetch: fg.f }));
    expect(r.skipped).toBe(true);
    expect(r.exit_code).toBe(0);
    expect(r.markdown).toMatch(/skipped: no relevant changes/);
    const fg2 = fakeGitHub({ files: ['policies/refunds.md'] });
    expect((await runGate(opts(root, { github: gh, fetch: fg2.f }))).skipped).toBe(false);
  });

  it('applies a valid override: neutral, exit 0, recorded in the signed ledger', async () => {
    const root = repo();
    const keys = await generateKeyPair();
    const fg = fakeGitHub({ labels: ['verify-gate:override'], labeledBy: 'maintainer', comments: [{ user: 'maintainer', body: '/verify-override the pricing page update ships on Monday' }], perms: { maintainer: 'maintain' } });
    const r = await runGate(opts(root, { github: gh, fetch: fg.f, signing_key: keys.private_key }));
    expect(r.exit_code).toBe(0);
    expect(r.ledger!.decision).toMatchObject({ decision: 'block', conclusion: 'neutral', title: 'Overridden by maintainer' });
    expect(r.ledger!.decision.override).toMatchObject({ actor: 'maintainer', reason: 'the pricing page update ships on Monday' });
    expect(r.ledger!.decision.override!.overridden_claims[0]).toMatchObject({ suite: 'support', case_id: 'planted-window', rule: 'XYN-001' });
    expect(await verifyLedger(r.ledger, { trusted_keys: [{ public_key: keys.public_key }] })).toMatchObject({ ok: true, signature: 'valid' });
  });

  it('refuses an override from someone without write access, and never overrides a hold', async () => {
    const fg = fakeGitHub({ labels: ['verify-gate:override'], labeledBy: 'outsider', comments: [{ user: 'outsider', body: '/verify-override trust me on this one' }], perms: { outsider: 'read' } });
    const r = await runGate(opts(repo(), { github: gh, fetch: fg.f }));
    expect(r.exit_code).toBe(1);
    expect(r.notes.join(' ')).toMatch(/override not applied/);
    const held = repo();
    writeFileSync(join(held, 'policies/refunds.md'), 'changed');
    const fg2 = fakeGitHub({ labels: ['verify-gate:override'], labeledBy: 'maintainer', comments: [{ user: 'maintainer', body: '/verify-override please let this through' }], perms: { maintainer: 'admin' } });
    const r2 = await runGate(opts(held, { github: gh, fetch: fg2.f, fail_on: ['block', 'hold'] }));
    expect(r2.decision).toBe('hold');
    expect(r2.ledger!.decision.override).toBeNull();
    expect(r2.exit_code).toBe(1);
  });

  it('reuses identical cases from the cache at zero units, marked cached', async () => {
    const root = repo();
    const o = opts(root, { cache_dir: '.xyntherium/cache' });
    await runGate(o);
    const r = await runGate(opts(root, { cache_dir: '.xyntherium/cache' }));
    expect(r.ledger!.cases.map((c) => c.status)).toEqual(['cached', 'cached']);
    expect(r.ledger!.run.cost.cached_cases).toBe(2);
    expect(r.decision).toBe('block');
  });

  it('a draft golden set reports but never enforces', async () => {
    const root = repo({ config: (h) => `draft: true\n${defaultConfig(h)}` });
    const r = await runGate(opts(root));
    expect(r.exit_code).toBe(0);
    expect(r.markdown).toMatch(/draft: review before trusting/);
  });

  it('an invalid golden set fails loudly as a hold, with the reasons', async () => {
    const root = repo({ config: () => 'version: 2\nsuites: []\n' });
    const r = await runGate(opts(root));
    expect(r.exit_code).toBe(1);
    expect(r.config_error).toMatch(/version must be 1/);
  });

  it('calls the endpoint per case (network_mode: local) and records request/response hashes', async () => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const q = JSON.parse(body).message as string;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ answer: q.includes('window') ? 'Annual plans can be cancelled for a full refund within 30 days of purchase.' : 'Monthly plans are refundable.' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const cfg = (h: string) => `version: 1
network_mode: local
sources:
  - { id: refunds, path: policies/refunds.md, sha256: ${h} }
endpoint:
  url: http://127.0.0.1:${port}/ask
  headers: { Authorization: "Bearer \${env.BOT_TOKEN}" }
  body: '{"message": "{{question}}"}'
policy: { enforcement: enforce }
suites:
  - name: live
    cases:
      - { id: window, question: "What is the refund window?" }
      - { id: monthly, question: "Are monthly plans refundable?" }
`;
    const masked: string[] = [];
    const r = await runGate(opts(repo({ config: cfg }), { env: { BOT_TOKEN: 'bot-secret-value' }, mask: (s) => masked.push(s) }));
    server.close();
    expect(masked).toContain('bot-secret-value');
    expect(r.ledger!.cases.every((c) => /^[0-9a-f]{64}$/.test(c.request_hash ?? '') && /^[0-9a-f]{64}$/.test(c.response_hash ?? ''))).toBe(true);
    expect(r.ledger!.run.endpoint?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r.ledger)).not.toContain('bot-secret-value');
    // "Monthly plans are refundable." against "... not refundable." is under the 5-token template minimum:
    // unresolved (warn), never supported — the pinned known limitation.
    expect(r.decision).toBe('warn');
    expect(r.ledger!.cases[1].claims[0].verdict).toBe('unverifiable');
  });

  it('hosted mode with the verifier unavailable holds every case, never passes', async () => {
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const r = await runGate(opts(repo(), { mode: 'hosted', api_key: 'xyn_live_KEY', fetch: down, fail_on: ['block', 'hold'] }));
    expect(r.decision).toBe('hold');
    expect(r.ledger!.cases.every((c) => c.decision === 'hold')).toBe(true);
    expect(r.exit_code).toBe(1);
  }, 20_000);
});

describe('cost control helpers', () => {
  it('globs', () => {
    expect(globToRegExp('prompts/**').test('prompts/a/b.txt')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/x/a.ts')).toBe(false);
    expect(globToRegExp('**/answers.json').test('a/b/answers.json')).toBe(true);
    expect(relevantChanges(null, ['x'])).toBeNull();
    expect(relevantChanges(['docs/a.md', 'prompts/system.txt'], ['prompts/**'])).toEqual(['prompts/system.txt']);
  });

  it('samples deterministically per commit', () => {
    const cases = Array.from({ length: 200 }, (_, i) => ({ suite: 's', id: `c${i}` }));
    const a = selectCases(cases, { max_cases_per_run: 20, sample_rate: 0.5, seed: 'abc', full_run: false });
    const b = selectCases(cases, { max_cases_per_run: 20, sample_rate: 0.5, seed: 'abc', full_run: false });
    expect(a).toEqual(b);
    expect(a.length).toBe(20);
    expect(selectCases(cases, { max_cases_per_run: 20, sample_rate: 0.5, seed: 'abc', full_run: true })).toHaveLength(200);
    expect(selectCases(cases, { max_cases_per_run: 20, sample_rate: null, seed: 'def', full_run: false })).not.toEqual(a);
  });
});

describe('the GitHub context from the Actions environment', () => {
  it('keeps the head commit for check runs and the merge commit for SARIF on a pull request', async () => {
    const { contextFromEnv } = await import('../src/gate/github');
    const ctx = contextFromEnv({ GITHUB_REPOSITORY: 'acme/support-bot', GITHUB_REF: 'refs/pull/7/merge', GITHUB_SHA: 'merge123', XYN_HEAD_SHA: 'head456', GITHUB_EVENT_NAME: 'pull_request' }, 'ghs_x');
    expect(ctx).toMatchObject({ sha: 'head456', ref: 'refs/pull/7/merge', ref_sha: 'merge123', pull_number: 7 });
  });
});
