/**
 * A Verify Gate run, end to end. GitHub I/O is injected so the whole run is
 * testable; main.ts wires it to the Actions environment and verify-cli to a
 * terminal.
 *
 *   1. Load verify-gate.yml; resolve and hash every source.
 *   2. Cost control: skip when no relevant file changed; sample large suites.
 *   3. Per case: the recorded answer or the endpoint's; the cache; then
 *      local evaluation (code, no key) or one hosted call for all cases.
 *   4. Decide; apply a valid override to a block (never to a hold).
 *   5. Build the ledger, sign it if a key is configured.
 *   6. Write ledger, SARIF and Markdown to disk FIRST. When a source changed,
 *      the policy-change check re-checks every saved answer that uses it
 *      against the new text (report-only by default; its own file and check).
 *   7. Then the job summary, PR comment, check runs and SARIF upload — each
 *      optional, each failure a note.
 *
 * Logs carry ids, hashes and decisions only: never a header, a source, a
 * question or an answer.
 */
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative, sep } from 'node:path';
import {
  buildLedger,
  buildSarif,
  cachedCase,
  caseCacheKey,
  assessPolicyChange,
  checkOverride,
  documentTestVerdict,
  effectivePolicy,
  engineInfo,
  parseOverrideComment,
  renderPolicyChange,
  GATE_VERSION,
  POLICY_VERSION,
  renderReport,
  runGateCase,
  runOutcome,
  signLedger,
  worst,
  type CaseTexts,
  type GateLedgerV1,
  type IntegrityIssue,
  type LedgerCase,
  type ChangedSourceInput,
  type DocumentTestInput,
  type OverrideRecord,
  type PolicyChangeReport,
  type RunInfo,
  type UnprotectedChange,
} from '../../../verify-policy/src/index';
import { RULES_VERSION } from '../../../verify-core/src/index';
import { detectSourceChange, documentParityHash } from '../../../verify-parity/src/index';
import { DocResultStore, ResultCache } from './cache';
import { globToRegExp, relevantChanges, relevantPatterns } from './changes';
import { ConfigError, envRefs, parseConfig, type CaseSpec, type EndpointSpec, type GateConfig } from './config';
import { callEndpoint, endpointFingerprint, EndpointError, type Transport } from './endpoint';
import { GitHub, type GitHubContext } from './github';
import { estimateMonthlyUnits, selectCases } from './sampling';
import { resolveSources, type ResolvedSource } from './sources';

export type FailOn = 'block' | 'hold' | 'warn';

export interface GateRunOptions {
  root: string;
  /** The repository root, when `root` is a subfolder (working-directory). Defaults to `root`. */
  repo_root?: string | null;
  /**
   * Reads a file (path relative to the repository root) as it was before the
   * change: the pull request's base commit. Defaults to the GitHub contents API
   * at the base commit; verify-cli passes `git show <base>:<path>`.
   */
  base_text?: ((repoPath: string) => Promise<string | null>) | null;
  /** Files changed against the base (repository paths), when there is no pull request to ask; verify-cli passes git's list. */
  changed_files?: (() => Promise<string[] | null>) | null;
  config_path: string;
  mode: 'local' | 'hosted' | null;
  api_key: string | null;
  base_url: string;
  fail_on: FailOn[];
  upload_sarif: boolean;
  comment_pr: boolean;
  artifact_path: string;
  signing_key: string | null;
  cache_dir: string | null;
  full_run: boolean;
  env: Record<string, string | undefined>;
  github: GitHubContext | null;
  now?: () => Date;
  transport?: Transport;
  fetch?: typeof fetch;
  run_id?: string;
  log?: (line: string) => void;
  mask?: (secret: string) => void;
  check_name?: string;
  endpoint_backoff_ms?: number;
}

export interface GateRunResult {
  ledger: GateLedgerV1 | null;
  exit_code: 0 | 1;
  decision: string;
  paths: { ledger: string; sarif: string; markdown: string; policy_change: string };
  outputs: { decision: string; 'ledger-path': string; 'sarif-path': string; 'claims-total': string; 'material-failures': string; 'policy-changed-answers': string };
  notes: string[];
  policy_change: PolicyChangeReport | null;
  skipped: boolean;
  markdown: string;
  config_error: string | null;
}

/** Cached verdicts are reused only under the same verification rules and Gate policy. */
const CACHE_VERSION = `gate-${GATE_VERSION}+rules-${RULES_VERSION}+policy-${POLICY_VERSION}`;

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const keyOf = (c: { suite: string; case_id?: string; id?: string }) => `${c.suite}/${c.case_id ?? c.id}`;

function integrityFor(c: CaseSpec, sources: Map<string, ResolvedSource>): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  for (const id of c.sources) {
    const s = sources.get(id);
    if (!s) continue;
    if (s.status === 'hash_mismatch') out.push({ kind: 'source_hash_mismatch', detail: s.detail ?? s.spec.path, source_id: id });
    if (s.status === 'missing') out.push({ kind: 'source_missing', detail: s.detail ?? s.spec.path, source_id: id });
  }
  return out;
}

interface HostedReply {
  ledger: GateLedgerV1;
  texts: Record<string, CaseTexts>;
}

/** Hosted mode: every non-cached case in one call to POST /v1/gate/verify-run. */
async function hostedRun(o: GateRunOptions, body: unknown): Promise<HostedReply> {
  const f = o.fetch ?? fetch;
  const url = `${o.base_url.replace(/\/+$/, '')}/v1/gate/verify-run`;
  let last = 'no attempt';
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      res = await f(url, { method: 'POST', headers: { authorization: `Bearer ${o.api_key}`, 'content-type': 'application/json', 'user-agent': 'xyntherium-verify-gate/0.1.0', 'idempotency-key': (body as { run: RunInfo }).run.run_id }, body: JSON.stringify(body) });
    } catch {
      last = 'network error';
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    if (res.ok) return (await res.json()) as HostedReply;
    if (res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      const quota = res.status === 429 && /quota/i.test(await res.text().catch(() => ''));
      if (quota) throw Object.assign(new Error('the Verify quota is exhausted'), { kind: 'quota_exhausted' as const });
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), { kind: 'verifier_error' as const });
  }
  throw Object.assign(new Error(`the verifier was unavailable (${last})`), { kind: 'verifier_unavailable' as const });
}

export async function runGate(o: GateRunOptions): Promise<GateRunResult> {
  const log = o.log ?? ((l: string) => process.stdout.write(`${l}\n`));
  const now = o.now ?? (() => new Date());
  const notes: string[] = [];
  const artifactDir = isAbsolute(o.artifact_path) ? o.artifact_path : join(o.root, o.artifact_path);
  const paths = { ledger: join(artifactDir, 'verify-gate-ledger.json'), sarif: join(artifactDir, 'verify-gate.sarif'), markdown: join(artifactDir, 'verify-gate-summary.md'), policy_change: join(artifactDir, 'verify-gate-policy-change.json') };
  const rel = (p: string) => relative(o.root, p) || p;
  for (const s of [o.api_key, o.signing_key]) if (s) o.mask?.(s);

  // 1. Config.
  let cfg: GateConfig;
  let yamlText: string;
  try {
    yamlText = readFileSync(join(o.root, o.config_path), 'utf8');
    cfg = parseConfig(yamlText);
  } catch (e) {
    const msg = e instanceof ConfigError ? e.message : `cannot read ${o.config_path}: ${e instanceof Error ? e.message : String(e)}`;
    log(`::error::${msg.split('\n').join(' ')}`);
    const md = `## Verify Gate: ⏸️ hold — the golden set could not be read\n\n${msg.replace(/</g, '&lt;')}\n\n> Assurance scope: evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.`;
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(paths.markdown, `${md}\n`);
    return { ledger: null, exit_code: 1, decision: 'hold', paths, outputs: { decision: 'hold', 'ledger-path': '', 'sarif-path': '', 'claims-total': '0', 'material-failures': '0', 'policy-changed-answers': '0' }, notes: [msg], skipped: false, markdown: md, config_error: msg, policy_change: null };
  }
  const mode: 'local' | 'hosted' = o.mode ?? cfg.mode ?? 'local';
  if (mode === 'hosted' && !o.api_key) throw new Error('hosted mode needs an api-key (local mode needs none)');
  for (const e of [cfg.endpoint, ...cfg.suites.map((s) => s.endpoint)]) for (const name of envRefs(e)) if (o.env[name]) o.mask?.(o.env[name]!);
  const policy = cfg.draft ? { ...cfg.policy, enforcement: 'report_only' as const } : cfg.policy;
  if (cfg.draft) notes.push('draft golden set: reporting only until a person approves it (remove draft: true)');

  // Sources.
  const resolved = resolveSources(cfg.sources, o.root);
  const byId = new Map(resolved.map((s) => [s.spec.id, s]));
  for (const s of resolved) if (s.status !== 'ok') log(`source ${s.spec.id}: ${s.status}`);

  // 2. Cost control. Changed files are repository paths; the golden set's paths
  // are relative to `root`, which may be a subfolder (working-directory).
  const gh = o.github ? new GitHub(o.github, o.fetch) : null;
  const scheduled = o.github?.event_name === 'schedule';
  const fullRun = o.full_run || scheduled;
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const rawPrefix = o.repo_root ? relative(real(o.repo_root), real(o.root)).split(sep).join('/') : '';
  const prefix = rawPrefix.startsWith('..') || isAbsolute(rawPrefix) ? '' : rawPrefix;
  const toRoot = (f: string): string | null => {
    const g = f.replace(/^\.\//, '');
    return !prefix ? g : g.startsWith(`${prefix}/`) ? g.slice(prefix.length + 1) : null;
  };
  const repoPath = (p: string) => (prefix ? posix.join(prefix, p) : p).replace(/^\.\//, '');
  let skipped: string | null = null;
  let changedInRoot: string[] | null = null;
  if (gh?.available && o.github?.pull_number) {
    try {
      const changed = await gh.changedFiles();
      changedInRoot = changed === null ? null : changed.map(toRoot).filter((f): f is string => f !== null);
      const hits = relevantChanges(changedInRoot, relevantPatterns({ config_path: o.config_path, source_paths: cfg.sources.map((s) => s.path), paths: cfg.paths }));
      if (!fullRun && hits !== null && hits.length === 0) skipped = 'no relevant changes';
    } catch (e) {
      notes.push(`changed files could not be listed (${e instanceof Error ? e.message : 'error'}); running every selected case`);
    }
  }
  if (changedInRoot === null && o.changed_files) {
    try {
      const changed = await o.changed_files();
      changedInRoot = changed === null ? null : changed.map(toRoot).filter((f): f is string => f !== null);
    } catch {
      changedInRoot = null;
    }
  }
  const allCases = cfg.suites.flatMap((s) => s.cases.map((c) => ({ ...c, endpoint: s.endpoint ?? cfg.endpoint })));
  const selected = skipped ? [] : selectCases(allCases, { max_cases_per_run: cfg.cost.max_cases_per_run, sample_rate: cfg.cost.sample_rate, seed: o.github?.sha ?? 'local', full_run: fullRun });
  const cache = o.cache_dir && cfg.cost.cache ? new ResultCache(isAbsolute(o.cache_dir) ? o.cache_dir : join(o.root, o.cache_dir)) : null;

  const runId = o.run_id ?? randomUUID();
  const firstEndpoint: EndpointSpec | null = cfg.endpoint ?? cfg.suites.find((s) => s.endpoint)?.endpoint ?? null;

  // 3. Answers, cache, evaluation.
  interface Prepared {
    spec: (typeof allCases)[number];
    answer: string | null;
    integrity: IntegrityIssue[];
    request_hash: string | null;
    response_hash: string | null;
    cache_key: string | null;
    cached: LedgerCase | null;
  }
  const prepared: Prepared[] = await pool(selected, cfg.concurrency, async (c) => {
    const integrity = integrityFor(c, byId);
    let answer = c.answer;
    let request_hash: string | null = null;
    let response_hash: string | null = null;
    if (answer === null && c.endpoint && !integrity.length) {
      try {
        const r = await callEndpoint(c.endpoint, c.question, { env: o.env, network_mode: cfg.network_mode, transport: o.transport, backoff_ms: o.endpoint_backoff_ms });
        answer = r.answer;
        request_hash = r.request_hash;
        response_hash = r.response_hash;
      } catch (e) {
        const err = e instanceof EndpointError ? e : new EndpointError('endpoint_error', 'endpoint call failed');
        integrity.push({ kind: err.code, detail: err.message });
      }
    }
    const sourceHashes = c.sources.map((id) => byId.get(id)?.sha256 ?? 'missing');
    const cache_key = answer !== null ? caseCacheKey({ question: c.question, answer, source_hashes: sourceHashes, config_hash: cfg.sha256, rules_version: CACHE_VERSION }) : null;
    // Local mode only: in hosted mode the ledger is signed by Xyntherium's key, so
    // results are never supplied by the client; the server keeps its own cache.
    const prior = mode === 'local' && cache_key && cache && !integrity.length ? cache.get(cache_key, CACHE_VERSION) : null;
    return { spec: c, answer, integrity, request_hash, response_hash, cache_key, cached: prior };
  });

  const texts: Record<string, CaseTexts> = {};
  let cases: LedgerCase[] = [];
  let hostedLedger: GateLedgerV1 | null = null;
  const sourcesFor = (c: CaseSpec) => c.sources.map((id) => byId.get(id)!).filter((s) => s.text !== null).map((s) => ({ id: s.spec.id, text: s.text!, sha256: s.sha256!, ...(s.spec.effective_date ? { effective_date: s.spec.effective_date } : {}) }));

  const run: RunInfo = {
    run_id: runId,
    created_at: now().toISOString(),
    gate_version: '0.1.0',
    mode,
    trigger: o.github?.event_name || 'cli',
    repository: o.github ? `${o.github.owner}/${o.github.repo}` : null,
    commit_sha: o.github?.sha || null,
    ref: o.github?.ref || null,
    pull_request: o.github?.pull_number ?? null,
    workflow_run_id: o.github?.run_id ?? null,
    actor: o.github?.actor ?? null,
    config: { path: o.config_path, sha256: cfg.sha256, schema_version: cfg.version },
    engine: engineInfo(),
    policy,
    endpoint: firstEndpoint ? { fingerprint: endpointFingerprint(firstEndpoint), method: firstEndpoint.method } : null,
    sources: resolved.map((s) => ({ id: s.spec.id, path: s.spec.path, version: s.spec.version, sha256: s.sha256 ?? '', status: s.status })),
    sampling: { total_cases: allCases.length, selected_cases: selected.length, max_cases_per_run: cfg.cost.max_cases_per_run, sample_rate: cfg.cost.sample_rate, full_run: fullRun },
    cost: { billable_units: 0, cached_cases: prepared.filter((p) => p.cached).length, estimated_monthly_units: null },
    include_text: cfg.ledger.include_text,
  };

  // Override facts are gathered before deciding, so hosted mode can sign them too.
  let overrideCandidate: { actor: string; reason: string; timestamp: string; label_applied_by: string; label_perm: string; author_perm: string; teams: string[] } | null = null;
  if (gh?.available && o.github?.pull_number && policy.overrides.enabled) {
    try {
      const applier = await gh.labelApplier(policy.overrides.label);
      if (applier) {
        const comments = await gh.recentComments();
        const last = [...comments].reverse().find((c) => parseOverrideComment(c.body) !== null);
        if (last) {
          const teams = policy.overrides.require_team && (await gh.inTeam(policy.overrides.require_team, last.author)) ? [policy.overrides.require_team] : [];
          overrideCandidate = { actor: last.author, reason: parseOverrideComment(last.body)!, timestamp: last.created_at, label_applied_by: applier, label_perm: await gh.permissionOf(applier), author_perm: await gh.permissionOf(last.author), teams };
        } else notes.push(`the "${policy.overrides.label}" label is applied, but no /verify-override <reason> comment was found`);
      }
    } catch (e) {
      notes.push(`override facts could not be read (${e instanceof Error ? e.message : 'error'})`);
    }
  }

  // 3b. Document change mode: a source the golden set names changed (in the
  // pull request, against its base version, or against its pin). Re-run the
  // tests linked to it; verify-parity classifies each change (real or cosmetic)
  // and triages a disagreement with the previous run. Computed before the
  // ledger so its parity records are hash-chained into it (ledger 1.1.0).
  let policyChange: PolicyChangeReport | null = null;
  const norm = (p: string) => p.replace(/^\.\//, '');
  const readBase =
    o.base_text ??
    (gh?.available && o.github?.base_sha
      ? (p: string) => gh.fileAt(p, o.github!.base_sha!)
      : null);
  const baseCache = new Map<string, string | null>();
  const safeRead = async (p: string): Promise<string | null> => {
    if (!readBase) return null;
    if (baseCache.has(p)) return baseCache.get(p)!;
    let t: string | null = null;
    try {
      t = await readBase(p);
    } catch (e) {
      notes.push(`policy change: ${p} could not be read at the base (${e instanceof Error ? e.message : 'error'})`);
    }
    baseCache.set(p, t);
    return t;
  };
  const changedSources: ResolvedSource[] = [];
  if (cfg.policy_change.enabled) {
    for (const s of resolved) {
      if (s.status === 'hash_mismatch' || (changedInRoot?.includes(norm(s.spec.path)) ?? false)) changedSources.push(s);
      // No pull-request file list (verify-cli, a push): compare with the base version itself.
      else if (changedInRoot === null && readBase) {
        const before = await safeRead(repoPath(s.spec.path));
        if (before !== null && before !== (s.text ?? '')) changedSources.push(s);
      }
    }
  }
  // The tests: tests[] when the golden set has them, else each suite case (implicit).
  const docTests: DocumentTestInput[] = cfg.tests.length
    ? cfg.tests.map((t) => ({ id: t.id, kind: 'test' as const, location: { path: o.config_path, line: t.line }, question: t.question, answer: t.answer, expected: [], source_ids: t.source_ids, required_conditions: t.required_conditions }))
    : allCases.map((c) => ({ id: `${c.suite}/${c.id}`, kind: 'case' as const, location: { path: o.config_path, line: c.line }, question: c.question, answer: c.answer, expected: c.material_claims, source_ids: c.sources, required_conditions: [] }));
  // Unprotected: a policy-like file (or a source) changed and no test is linked to it.
  const linked = new Set(docTests.flatMap((t) => t.source_ids));
  const policyLike = cfg.policy_change.policy_paths.map(globToRegExp);
  const docExt = /\.(?:md|mdx|markdown|txt|html?|rst|adoc)$/i;
  const unprotected: UnprotectedChange[] = [];
  if (cfg.policy_change.enabled && changedInRoot) {
    for (const f of [...new Set(changedInRoot)].sort()) {
      if (norm(f) === norm(o.config_path)) continue;
      const src = cfg.sources.find((x) => norm(x.path) === norm(f));
      const entry: UnprotectedChange | null = src ? (linked.has(src.id) ? null : { path: f, source_id: src.id, reason: 'no_linked_tests' }) : docExt.test(f) && policyLike.some((r) => r.test(f)) ? { path: f, source_id: null, reason: 'not_a_source' } : null;
      if (!entry) continue;
      // A cosmetic edit (formatting only) is noted, not warned.
      const before = await safeRead(repoPath(f));
      const abs = join(o.root, f);
      const after = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
      entry.change_kind = before !== null && after !== null ? (detectSourceChange({ before, after, captured_at: run.created_at }).kind === 'real' ? 'real' : 'cosmetic') : 'unknown';
      unprotected.push(entry);
    }
  }
  // Previous-version results: the verdict a test had in the previous Gate run on the base version (cache).
  const docStore = o.cache_dir && cfg.cost.cache ? new DocResultStore(isAbsolute(o.cache_dir) ? o.cache_dir : join(o.root, o.cache_dir)) : null;
  // Keyed by the test (and rules), not by the source: the stored entry records which source
  // snapshots the verdict was made on, so a mismatch can be triaged (verify-parity, Use 2).
  const docKey = (testId: string) => {
    const t = docTests.find((x) => x.id === testId);
    return createHash('sha256').update(JSON.stringify([testId, t?.answer ?? null, t?.required_conditions ?? [], CACHE_VERSION])).digest('hex');
  };
  const snapshotsOf = (t: DocumentTestInput) => Object.fromEntries(t.source_ids.map((id) => [id, byId.get(id)?.text != null ? documentParityHash(byId.get(id)!.text!, run.created_at) : 'missing']));
  if (changedSources.length || unprotected.length) {
    let baseCfg: GateConfig | null = null;
    const baseYaml = await safeRead(repoPath(o.config_path));
    if (baseYaml !== null) {
      try {
        baseCfg = parseConfig(baseYaml);
      } catch {
        baseCfg = null;
      }
    }
    const changed: ChangedSourceInput[] = [];
    for (const s of changedSources) {
      const before = await safeRead(repoPath(s.spec.path));
      const after = s.text;
      const old = baseCfg?.sources.find((x) => x.id === s.spec.id);
      changed.push({
        id: s.spec.id,
        path: s.spec.path,
        // The same text on both sides says nothing about what was approved before.
        before: before !== null && after !== null && before === after ? null : before,
        after,
        versioned: s.spec.version !== null,
        version_before: old?.version ?? null,
        version_after: s.spec.version,
        ...(old?.effective_date ? { effective_date_before: old.effective_date } : {}),
        ...(s.spec.effective_date ? { effective_date_after: s.spec.effective_date } : {}),
        supersedes: s.spec.supersedes ?? [],
      });
    }
    policyChange = await assessPolicyChange({
      changed,
      tests: docTests,
      current: resolved.filter((x) => x.text !== null).map((x) => ({ id: x.spec.id, text: x.text! })),
      unprotected,
      enforcement: cfg.policy_change.enforcement,
      include_text: true,
      // The ledger carries text only when the golden set asks for it.
      record_text: cfg.ledger.include_text,
      captured_at: run.created_at,
      previous: docStore ? (id) => docStore.get(docKey(id)) : undefined,
    });
    if (docStore) {
      for (const t of policyChange.tests) {
        const spec = docTests.find((x) => x.id === t.id);
        if (spec && t.verdict_after && t.decision !== 'hold') docStore.set(docKey(t.id), t.verdict_after, snapshotsOf(spec), run.created_at);
      }
    }
  }

  // Record every linked test's verdict on this version, so the next change compares with it.
  if (docStore && cfg.tests.length) {
    const reported = new Set(policyChange?.tests.map((t) => t.id) ?? []);
    const cur = resolved.filter((x) => x.text !== null && x.status === 'ok').map((x) => ({ id: x.spec.id, text: x.text! }));
    for (const t of docTests) {
      if (reported.has(t.id) || t.source_ids.some((id) => byId.get(id)?.status !== 'ok')) continue;
      const v = await documentTestVerdict(t, cur);
      if (v) docStore.set(docKey(t.id), v, snapshotsOf(t), run.created_at);
    }
    docStore.save();
  }

  if (mode === 'local') {
    cases = await pool(prepared, cfg.concurrency, async (p) => {
      const loc = { path: o.config_path, line: p.spec.line };
      if (p.cached) return cachedCase(p.cached, { location: loc, request_hash: p.request_hash, response_hash: p.response_hash });
      const r = await runGateCase({
        suite: p.spec.suite,
        case_id: p.spec.id,
        location: loc,
        question: p.spec.question,
        answer: p.answer,
        sources: sourcesFor(p.spec),
        expected: p.spec.material_claims,
        require_citations: p.spec.require_citations,
        policy,
        policy_overrides: p.spec.policy_overrides,
        integrity: p.integrity,
        mode: 'local',
        include_text: cfg.ledger.include_text,
        request_hash: p.request_hash,
        response_hash: p.response_hash,
        cache_key: p.cache_key,
      });
      texts[keyOf(r.ledger)] = r.texts;
      return r.ledger;
    });
  } else {
    const toCheck = prepared.filter((p) => !p.cached);
    try {
      const reply = await hostedRun(o, {
        run,
        policy,
        include_text: cfg.ledger.include_text,
        config_sha256: cfg.sha256,
        override_request: overrideCandidate,
        parity_records: policyChange?.parity_records ?? [],
        cases: toCheck.map((p) => ({
          suite: p.spec.suite,
          case_id: p.spec.id,
          location: { path: o.config_path, line: p.spec.line },
          question: p.spec.question,
          answer: p.answer,
          sources: sourcesFor(p.spec),
          material_claims: p.spec.material_claims,
          require_citations: p.spec.require_citations,
          policy_overrides: p.spec.policy_overrides,
          integrity: p.integrity,
          request_hash: p.request_hash,
          response_hash: p.response_hash,
        })),
      });
      hostedLedger = reply.ledger;
      cases = reply.ledger.cases;
      Object.assign(texts, reply.texts ?? {});
    } catch (e) {
      const kind = ((e as { kind?: string }).kind ?? 'verifier_unavailable') as IntegrityIssue['kind'];
      notes.push(`hosted verifier: ${e instanceof Error ? e.message : 'error'}`);
      // The checker could not complete: every case holds, never passes.
      cases = await pool(prepared, cfg.concurrency, async (p) =>
        (
          await runGateCase({
            suite: p.spec.suite,
            case_id: p.spec.id,
            location: { path: o.config_path, line: p.spec.line },
            question: p.spec.question,
            answer: null,
            sources: sourcesFor(p.spec),
            expected: [],
            require_citations: false,
            policy,
            policy_overrides: null,
            integrity: [...p.integrity, { kind, detail: e instanceof Error ? e.message : 'error' }],
            mode: 'hosted',
            include_text: false,
            request_hash: p.request_hash,
            response_hash: p.response_hash,
            cache_key: p.cache_key,
          })
        ).ledger,
      );
    }
  }
  if (skipped) {
    cases = allCases.map((c) => ({
      suite: c.suite,
      case_id: c.id,
      location: { path: o.config_path, line: c.line },
      status: 'skipped',
      cache_key: null,
      question_hash: createHash('sha256').update(c.question).digest('hex'),
      answer_hash: null,
      request_hash: null,
      response_hash: null,
      source_ids: c.sources,
      claims: [],
      findings: [],
      decision: 'pass',
      reasons: ['skipped: no relevant changes'],
      counts: { claims: 0, material: 0, supported_material: 0, deterministic_findings: 0, model_findings: 0 },
      billable_units: 0,
      error: null,
    }));
  }
  if (mode === 'local') for (const c of cases) if (cache && c.cache_key && c.status === 'checked') cache.set(c.cache_key, CACHE_VERSION, c, run.created_at);
  cache?.save();

  // 4. Decide; overrides.
  const decision = worst(cases.filter((c) => c.status !== 'skipped').map((c) => c.decision));
  let override: OverrideRecord | null = hostedLedger?.decision.override ?? null;
  if (!hostedLedger && overrideCandidate) {
    const ok = checkOverride({ decision, policy, label_applied_by: overrideCandidate.label_applied_by, label_applier_permission: overrideCandidate.label_perm as never, comment_author: overrideCandidate.actor, comment_author_permission: overrideCandidate.author_perm as never, reason: overrideCandidate.reason, author_teams: overrideCandidate.teams });
    if (ok.ok) {
      override = {
        actor: overrideCandidate.actor,
        reason: overrideCandidate.reason,
        timestamp: overrideCandidate.timestamp,
        overridden_claims: cases.flatMap((c) => c.findings.filter((f) => f.decision === 'block').map((f) => ({ suite: c.suite, case_id: c.case_id, claim_index: f.claim_index, rule: f.rule }))),
      };
    } else notes.push(`override not applied: ${ok.error}`);
  }

  // 5. Ledger.
  const cachedCount = cases.filter((c) => c.status === 'cached').length;
  run.cost = {
    billable_units: cases.reduce((n, c) => n + c.billable_units, 0),
    cached_cases: cachedCount,
    estimated_monthly_units:
      mode === 'hosted'
        ? estimateMonthlyUnits({ cases_per_pr_run: selected.length, full_suite_cases: allCases.length, prs_per_day: cfg.cost.expected_prs_per_day, nightly_full_run: cfg.cost.max_cases_per_run !== null || cfg.cost.sample_rate !== null, cache_hit_rate: selected.length ? cachedCount / selected.length : 0 })
        : 0,
  };
  let ledger: GateLedgerV1;
  if (hostedLedger) {
    ledger = hostedLedger;
  } else {
    const outcome = runOutcome(decision, { enforcement: policy.enforcement, fail_on: o.fail_on, override });
    ledger = buildLedger({
      run,
      cases,
      parity: policyChange?.parity_records ?? [],
      decision: { ...outcome, title: skipped ? 'skipped: no relevant changes' : outcome.title, enforcement: policy.enforcement, fail_on: o.fail_on, reasons: [...new Set(cases.flatMap((c) => c.reasons))].slice(0, 20), override },
    });
    if (o.signing_key) {
      try {
        ledger = await signLedger(ledger, o.signing_key, 'repository-secret');
      } catch (e) {
        notes.push(`the signing key could not be used (${e instanceof Error ? e.message : 'error'}); the ledger is unsigned`);
      }
    }
  }

  // 6. Artifacts first.
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(paths.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  const sarif = buildSarif(ledger, { config_path: o.config_path, texts });
  writeFileSync(paths.sarif, `${JSON.stringify(sarif, null, 2)}\n`);
  let markdown = renderReport(ledger, { ledger_path: rel(paths.ledger), texts, skipped_reason: skipped, draft: cfg.draft, github_notes: notes });
  writeFileSync(paths.markdown, `${markdown}\n`);
  // 6b. Document change mode: its report (computed before the ledger, step 3b).
  if (policyChange) {
    const stored = cfg.ledger.include_text
      ? policyChange
      : {
          ...policyChange,
          changed_sources: policyChange.changed_sources.map((c) => ({ ...c, change: c.change ? { ...c.change, changes: c.change.changes.map((x) => ({ ...x, before: null, after: null })) } : null })),
          tests: policyChange.tests.map(({ diff: _d, ...t }) => ({ ...t, conditions: t.conditions.map(({ text: _t, now: _n, was: _w, ...c }) => c) })),
        };
    writeFileSync(paths.policy_change, `${JSON.stringify(stored, null, 2)}\n`);
    markdown = `${markdown}\n\n${renderPolicyChange(policyChange)}`;
    writeFileSync(paths.markdown, `${markdown}\n`);
    log(`policy change: ${policyChange.title}; ${policyChange.unprotected.filter((u) => u.change_kind !== 'cosmetic').length} unprotected source change(s); ${policyChange.parity_records.length} parity record(s) (${policyChange.enforcement})`);
  }


  log(`verify-gate: ${cases.length} case(s), decision ${ledger.decision.decision}${ledger.decision.override ? ` (overridden by ${ledger.decision.override.actor})` : ''}; ledger ${rel(paths.ledger)} (${ledger.signing.alg === 'Ed25519' ? `signed, key ${ledger.signing.key_id}` : 'unsigned'})`);
  for (const c of cases) log(`  ${c.suite}/${c.case_id}: ${c.status === 'skipped' ? 'skipped' : c.decision}${c.findings.length ? ` [${[...new Set(c.findings.filter((f) => f.decision !== 'pass').map((f) => f.rule))].join(',')}]` : ''}`);

  // 7. GitHub surfaces, each optional.
  const ghNotes: string[] = [];
  if (o.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(o.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
    } catch {
      ghNotes.push('job summary not written');
    }
  }
  if (gh?.available) {
    if (o.comment_pr && o.github?.pull_number) {
      try {
        await gh.upsertComment(markdown);
      } catch (e) {
        ghNotes.push(`PR comment not posted (${e instanceof Error ? e.message : 'error'}; needs pull-requests: write)`);
      }
    }
    try {
      await gh.checkRun({ name: o.check_name ?? 'Verify Gate', conclusion: ledger.decision.conclusion, title: ledger.decision.title, summary: markdown });
    } catch (e) {
      ghNotes.push(`check run not created (${e instanceof Error ? e.message : 'error'}; needs checks: write)`);
    }
    if (policyChange) {
      try {
        await gh.checkRun({ name: `${o.check_name ?? 'Verify Gate'}: policy change`, conclusion: policyChange.conclusion, title: policyChange.title, summary: renderPolicyChange(policyChange) });
      } catch (e) {
        ghNotes.push(`policy-change check run not created (${e instanceof Error ? e.message : 'error'}; needs checks: write)`);
      }
    }
    if (o.upload_sarif) {
      try {
        await gh.uploadSarif(sarif);
      } catch (e) {
        ghNotes.push(`SARIF not uploaded (${e instanceof Error ? e.message : 'error'}; needs security-events: write and code scanning enabled)`);
      }
    }
  } else if (o.github) ghNotes.push('no GitHub token: PR comment, check run and SARIF upload skipped');
  if (ghNotes.length) {
    for (const n of ghNotes) log(`::warning::${n}`);
    markdown = renderReport(ledger, { ledger_path: rel(paths.ledger), texts, skipped_reason: skipped, draft: cfg.draft, github_notes: [...notes, ...ghNotes] });
    if (policyChange) markdown = `${markdown}\n\n${renderPolicyChange(policyChange)}`;
    writeFileSync(paths.markdown, `${markdown}\n`);
  }

  const claimsTotal = cases.reduce((n, c) => n + c.claims.length, 0);
  const policyFails = policyChange?.conclusion === 'failure';
  return {
    ledger,
    exit_code: ledger.decision.exit_code === 1 || policyFails ? 1 : 0,
    decision: ledger.decision.decision,
    paths,
    outputs: { decision: skipped ? 'pass' : ledger.decision.decision, 'ledger-path': rel(paths.ledger), 'sarif-path': rel(paths.sarif), 'claims-total': String(claimsTotal), 'material-failures': String(ledger.summary.material_failures), 'policy-changed-answers': String(policyChange?.needs_review ?? 0) },
    notes: [...notes, ...ghNotes],
    skipped: !!skipped,
    markdown,
    config_error: null,
    policy_change: policyChange,
  };
}
