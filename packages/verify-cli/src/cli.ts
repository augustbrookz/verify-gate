#!/usr/bin/env node
/**
 * xyntherium-verify — Verify Gate from a terminal.
 *
 *   init     draft a starter golden set from this repository's docs (draft: review before trusting)
 *            --policy-gate: document change mode (sources, tests, required conditions) from the policy and help docs
 *   pin      write each source's current sha256 into verify-gate.yml
 *   run      run the Gate locally (same engine as the GitHub Action)
 *   ledger verify <file>   check a Gate ledger offline: chain, JCS hash, Ed25519 signature
 *   keygen   create an Ed25519 key pair for signing ledgers
 *   workflow write .github/workflows/verify-gate.yml
 *
 * Exit codes: 0 ok / pass; 1 the Gate failed the run or a ledger did not verify; 2 usage error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ASSURANCE_SCOPE, generateKeyPair, INTEGRITY_NOT_TRUTH, publicKeyPem, b64Decode, verifyLedger } from '../../verify-policy/src/index';
import { runGate, type FailOn } from '../../verify-action/src/gate/run';
import { draftGoldenSet, draftPolicyGate, renderGoldenSet, renderPolicyGate, WORKFLOW } from './init';
import { pinSources } from './pin';

export const VERSION = '0.1.0';

interface Args {
  _: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) out.flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const HELP = `xyntherium-verify ${VERSION} — Verify Gate: fail the pull request when your AI's answers stop being supported by your approved sources.

Usage:
  xyntherium-verify init [--sources <dir,...>] [--endpoint <url>] [--out verify-gate.yml] [--pr] [--force]
  xyntherium-verify init --policy-gate [--out verify-gate.yml] [--max 20] [--pr] [--force]
      drafts document change mode from the repository's policy and help docs (draft: review before trusting)
  xyntherium-verify pin [--config verify-gate.yml]
  xyntherium-verify run [--config verify-gate.yml] [--mode local|hosted] [--fail-on block,hold] [--artifact-path .xyntherium] [--full] [--base <git-ref>]
      --base: the version a changed source is compared with for the policy-change check (default HEAD)
  xyntherium-verify ledger verify <ledger.json> [--public-key <key|file>] [--keys <keys.json|https-url>] [--allow-embedded-key] [--require-signature] [--json]
  xyntherium-verify keygen [--out <private-key-file>]
  xyntherium-verify workflow [--force]

${ASSURANCE_SCOPE.charAt(0).toUpperCase()}${ASSURANCE_SCOPE.slice(1)}
`;

type Out = { log: (s: string) => void; err: (s: string) => void };

async function readKeys(spec: string | true | undefined, cwd: string, fetchImpl: typeof fetch): Promise<{ key_id?: string; public_key: string }[]> {
  if (!spec || spec === true) return [];
  const raw = /^https:\/\//.test(spec) ? await (await fetchImpl(spec)).text() : readFileSync(resolve(cwd, spec), 'utf8');
  const doc = JSON.parse(raw) as { keys?: { key_id?: string; public_key: string }[] };
  return doc.keys ?? [];
}

/** Commit the drafted files on a new branch and open a pull request for a person to review. */
function openDraftPr(cwd: string, files: string[], title: string, body: string, prefix: string, out: Out): void {
  try {
    const branch = `${prefix}-${Date.now().toString(36)}`;
    const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
    git('checkout', '-b', branch);
    git('add', ...files);
    git('commit', '-m', `${title} (draft: review before trusting)`);
    git('push', '-u', 'origin', branch);
    execFileSync('gh', ['pr', 'create', '--title', title, '--body', body], { cwd, stdio: 'pipe' });
    out.log(`Opened a pull request from ${branch} for a person to review.`);
  } catch (e) {
    out.err(`Could not open the pull request automatically (${e instanceof Error ? e.message.split('\n')[0] : 'error'}). Commit the files and open it by hand.`);
  }
}

export async function main(argv: string[], o: { cwd?: string; out?: Out; env?: Record<string, string | undefined>; fetch?: typeof fetch } = {}): Promise<number> {
  const out = o.out ?? { log: (s) => process.stdout.write(`${s}\n`), err: (s) => process.stderr.write(`${s}\n`) };
  const cwd = o.cwd ?? process.cwd();
  const env = o.env ?? process.env;
  const a = parseArgs(argv);
  const [cmd, sub] = a._;
  const flag = (k: string) => (typeof a.flags[k] === 'string' ? (a.flags[k] as string) : undefined);

  if (!cmd || a.flags.help || cmd === 'help') {
    out.log(HELP);
    return cmd ? 0 : 2;
  }
  if (cmd === '--version' || a.flags.version) {
    out.log(VERSION);
    return 0;
  }

  if (cmd === 'init') {
    const target = join(cwd, flag('out') ?? 'verify-gate.yml');
    if (existsSync(target) && !a.flags.force) {
      out.err(`${target} exists; pass --force to replace it${a.flags['policy-gate'] ? ', or --out verify-gate.policy.yml and run with --config' : ''}`);
      return 2;
    }
    if (a.flags['policy-gate']) {
      const draft = draftPolicyGate(cwd, { max: Number(flag('max') ?? 20) });
      if (!draft.tests.length) {
        out.err('No policy or help docs with conditions were found (kb/, policies/, legal/, help/, docs/*policy*, *refund*.md, *terms*.md, *faq*.md …). Write tests[] by hand (see the README).');
        return 1;
      }
      writeFileSync(target, renderPolicyGate(draft));
      const wf = join(cwd, '.github/workflows/verify-gate.yml');
      if (!existsSync(wf)) {
        mkdirSync(dirname(wf), { recursive: true });
        writeFileSync(wf, WORKFLOW);
      }
      out.log(`Drafted ${draft.tests.length} test(s) with required conditions from ${draft.sources.length} policy doc(s) into ${flag('out') ?? 'verify-gate.yml'} — draft: review before trusting.`);
      out.log('Next: check every question, answer and required condition; set each source version to the policy\'s own label; then remove draft: true.');
      if (a.flags.pr) openDraftPr(cwd, [flag('out') ?? 'verify-gate.yml', '.github/workflows/verify-gate.yml'], 'Verify Gate: draft document change tests for review', 'Drafted by `xyntherium init --policy-gate` from the policy and help docs in this repository. **Draft: review before trusting.** Each test is a statement from a doc and the conditions it must keep; when a linked doc changes in a pull request, the Gate re-runs those tests against the new version ("Policy changed: N answers need review"). Report-only until `policy_change.enforcement: enforce`.', 'verify-gate/policy-gate', out);
      return 0;
    }
    const draft = draftGoldenSet(cwd, { sources: (flag('sources') ?? '').split(',').filter(Boolean), max: Number(flag('max') ?? 20) });
    if (draft.cases.length < 1) {
      out.err('No candidate statements found in README*, docs/ or --sources. Add documentation, or write verify-gate.yml by hand (see the README).');
      return 1;
    }
    writeFileSync(target, renderGoldenSet(draft, { endpoint: flag('endpoint') ?? null }));
    const wf = join(cwd, '.github/workflows/verify-gate.yml');
    if (!existsSync(wf)) {
      mkdirSync(dirname(wf), { recursive: true });
      writeFileSync(wf, WORKFLOW);
    }
    out.log(`Drafted ${draft.cases.length} case(s) from ${draft.sources.length} file(s) into ${flag('out') ?? 'verify-gate.yml'} — draft: review before trusting.`);
    out.log('Next: read every question and passage, then run `npx @xyntherium/verify-cli run` to see a first result.');
    if (a.flags.pr) openDraftPr(cwd, [flag('out') ?? 'verify-gate.yml', '.github/workflows/verify-gate.yml'], 'Verify Gate: draft golden set for review', 'Drafted by `xyntherium-verify init` from this repository\'s documentation. **Draft: review before trusting.** Check every question, passage and claim; then remove `draft: true` and set `policy.enforcement: enforce` when the Gate should block.', 'verify-gate/starter', out);
    return 0;
  }

  if (cmd === 'pin') {
    const cfg = join(cwd, flag('config') ?? 'verify-gate.yml');
    if (!existsSync(cfg)) {
      out.err(`${cfg} not found`);
      return 2;
    }
    const r = pinSources(readFileSync(cfg, 'utf8'), cwd);
    if (r.missing.length) out.err(`missing source file(s): ${r.missing.join(', ')}`);
    if (!r.changed.length) {
      out.log('Every source already matches its pinned sha256.');
      return r.missing.length ? 1 : 0;
    }
    writeFileSync(cfg, r.text);
    for (const c of r.changed) out.log(`pinned ${c.id}: ${c.from ? `${c.from.slice(0, 12)}… → ` : ''}${c.to.slice(0, 12)}…`);
    return r.missing.length ? 1 : 0;
  }

  if (cmd === 'run') {
    const failRaw = (flag('fail-on') ?? 'block').toLowerCase();
    const baseRef = flag('base') ?? 'HEAD';
    if (!/^[A-Za-z0-9._/@{}~^][A-Za-z0-9._/@{}~^-]*$/.test(baseRef)) {
      out.err('--base must be a git ref (a branch, tag or commit)');
      return 2;
    }
    const git = (args: string[], at: string) => execFileSync('git', args, { cwd: at, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4_000_000 });
    let gitRoot: string | null = null;
    try {
      gitRoot = git(['rev-parse', '--show-toplevel'], cwd).trim() || null;
    } catch {
      gitRoot = null;
    }
    const r = await runGate({
      root: cwd,
      repo_root: gitRoot,
      // A changed source is compared with its version at --base (default HEAD: the last commit).
      base_text: gitRoot
        ? async (p: string) => {
            try {
              return git(['show', `${baseRef}:${p}`], gitRoot!);
            } catch {
              return null;
            }
          }
        : null,
      // What changed against --base: tracked differences and new files.
      changed_files: gitRoot
        ? async () => {
            try {
              const diff = git(['diff', '--name-only', baseRef], gitRoot!).split('\n').filter(Boolean);
              const added = git(['ls-files', '--others', '--exclude-standard'], gitRoot!).split('\n').filter(Boolean);
              return [...new Set([...diff, ...added])];
            } catch {
              return null;
            }
          }
        : null,
      config_path: flag('config') ?? 'verify-gate.yml',
      mode: (flag('mode') as 'local' | 'hosted' | undefined) ?? null,
      api_key: env.XYN_API_KEY ?? null,
      base_url: flag('base-url') ?? env.XYN_BASE_URL ?? 'https://xyntherium.com',
      fail_on: (failRaw === 'none' ? [] : failRaw.split(',')) as FailOn[],
      upload_sarif: false,
      comment_pr: false,
      artifact_path: flag('artifact-path') ?? '.xyntherium',
      signing_key: env.XYN_GATE_SIGNING_KEY ?? null,
      cache_dir: flag('cache-dir') ?? '.xyntherium/cache',
      full_run: !!a.flags.full,
      env,
      github: null,
      log: out.log,
    });
    if (r.config_error) {
      out.err(r.config_error);
      return 1;
    }
    out.log(`\nDecision: ${r.decision}${r.ledger?.decision.title && r.ledger.decision.title !== r.decision ? ` (${r.ledger.decision.title})` : ''}. Report: ${r.paths.markdown}`);
    if (r.policy_change) out.log(`${r.policy_change.title} (${r.policy_change.enforcement === 'enforce' ? 'enforced' : 'report-only'}): ${r.paths.policy_change}`);
    return r.exit_code;
  }

  if (cmd === 'ledger' && sub === 'verify') {
    const file = a._[2];
    if (!file) {
      out.err('usage: xyntherium-verify ledger verify <ledger.json>');
      return 2;
    }
    let ledger: unknown;
    try {
      ledger = JSON.parse(readFileSync(resolve(cwd, file), 'utf8'));
    } catch (e) {
      out.err(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
    const trusted = await readKeys(a.flags.keys, cwd, o.fetch ?? fetch);
    const pk = flag('public-key');
    if (pk) trusted.push({ public_key: existsSync(resolve(cwd, pk)) ? readFileSync(resolve(cwd, pk), 'utf8') : pk });
    const check = await verifyLedger(ledger, { trusted_keys: trusted, allow_embedded_key: !!a.flags['allow-embedded-key'] });
    const failed = !check.ok || (!!a.flags['require-signature'] && check.signature !== 'valid');
    if (a.flags.json) out.log(JSON.stringify({ ...check, ok: !failed }, null, 2));
    else {
      out.log(`${failed ? 'FAIL' : 'OK'}  chain: ${check.chain}; signature: ${check.signature}${check.key_id ? ` (key ${check.key_id})` : ''}`);
      for (const p of check.problems) out.log(`  - ${p}`);
      if (a.flags['require-signature'] && check.signature === 'unsigned') out.log('  - the ledger is unsigned and --require-signature was given');
      for (const s of check.statements) out.log(`  ${s}`);
    }
    return failed ? 1 : 0;
  }

  if (cmd === 'keygen') {
    const k = await generateKeyPair();
    const pem = publicKeyPem(b64Decode(k.public_key));
    const outFile = flag('out');
    if (outFile) {
      writeFileSync(resolve(cwd, outFile), `${k.private_key}\n`, { mode: 0o600 });
      out.log(`Private key (base64url seed) written to ${outFile} (mode 600). Store it as the repository secret XYN_GATE_SIGNING_KEY, then delete the file.`);
    } else out.log('Private key: pass --out <file> to write it (it is never printed).');
    out.log(`key_id ${k.key_id}\nPublic key (share it; verifiers pass it with --public-key):\n${pem}`);
    return 0;
  }

  if (cmd === 'workflow') {
    const wf = join(cwd, '.github/workflows/verify-gate.yml');
    if (existsSync(wf) && !a.flags.force) {
      out.err(`${wf} exists; pass --force to replace it`);
      return 2;
    }
    mkdirSync(dirname(wf), { recursive: true });
    writeFileSync(wf, WORKFLOW);
    out.log(`Wrote ${wf}.`);
    return 0;
  }

  out.err(`unknown command: ${a._.join(' ')}\n\n${HELP}`);
  return 2;
}

export { INTEGRITY_NOT_TRUTH };
