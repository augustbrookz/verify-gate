/**
 * GitHub Actions entry for Verify Gate v0.1: reads INPUT_*, masks every
 * secret, runs the Gate, writes GITHUB_OUTPUT. The v1 `fixtures` input still
 * works (deprecated) when no verify-gate.yml exists.
 */
import { appendFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contextFromEnv } from './gate/github';
import { runGate, type FailOn } from './gate/run';
import { runFixtures, summaryMarkdown } from './run';

const input = (name: string, fallback = '') => (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? fallback).trim();
const bool = (name: string, fallback: boolean) => {
  const v = input(name, String(fallback)).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
};
const mask = (s: string) => {
  for (const line of s.split(/\r?\n/)) if (line.trim()) process.stdout.write(`::add-mask::${line.trim()}\n`);
};

function setOutputs(o: Record<string, string>) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(o).map(([k, v]) => `${k}=${v.replace(/\r?\n/g, ' ')}`).join('\n') + '\n');
}

async function legacy(apiKey: string): Promise<void> {
  process.stdout.write('::warning::The fixtures input is deprecated; move to verify-gate.yml (see the README). It keeps working.\n');
  const cfg = {
    apiKey,
    fixturesPath: input('fixtures'),
    allowed: input('allowed-recommendations', 'allow').split(',').map((s) => s.trim()).filter(Boolean),
    maxFailures: Number(input('max-failures', '0')) || 0,
    baseUrl: input('base-url', 'https://xyntherium.com'),
    concurrency: Number(input('concurrency', '4')) || 4,
  };
  const { outcomes, failed, ok } = await runFixtures(cfg);
  for (const o of outcomes) process.stdout.write(`${o.passed ? 'PASS' : 'FAIL'} ${o.name}: ${o.recommendation ?? o.error}\n`);
  setOutputs({ total: String(outcomes.length), passed: String(outcomes.length - failed), failed: String(failed) });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(outcomes, ok, cfg)}\n`);
  if (!ok) {
    process.stdout.write(`::error::${failed} fixture(s) were not released (allowed: ${cfg.allowed.join(', ')}; max failures ${cfg.maxFailures})\n`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const apiKey = input('api-key');
  const signingKey = input('signing-key');
  const token = input('github-token');
  for (const s of [apiKey, signingKey, token]) if (s) mask(s);
  // A golden set can live in a subfolder (a monorepo app): paths in it are relative to working-directory.
  const root = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd(), input('working-directory', '.') || '.');
  const configPath = input('config', 'verify-gate.yml');
  if (input('fixtures') && !existsSync(join(root, configPath))) {
    if (!apiKey) throw new Error('api-key is required for the fixtures input');
    return legacy(apiKey);
  }
  const modeIn = input('mode');
  if (modeIn && modeIn !== 'local' && modeIn !== 'hosted') throw new Error('mode must be local or hosted');
  const failOnRaw = input('fail-on', 'block').toLowerCase();
  const failOn = (failOnRaw === 'none' ? [] : failOnRaw.split(',').map((s) => s.trim()).filter(Boolean)) as FailOn[];
  for (const f of failOn) if (!['block', 'hold', 'warn'].includes(f)) throw new Error(`fail-on: unknown value "${f}" (use block, hold, warn or none)`);
  const r = await runGate({
    root,
    repo_root: process.env.GITHUB_WORKSPACE ?? null,
    config_path: configPath,
    mode: (modeIn || null) as 'local' | 'hosted' | null,
    api_key: apiKey || null,
    base_url: input('base-url', 'https://xyntherium.com'),
    fail_on: failOn,
    upload_sarif: bool('upload-sarif', true),
    comment_pr: bool('comment-pr', true),
    artifact_path: input('artifact-path', '.xyntherium'),
    signing_key: signingKey || null,
    cache_dir: input('cache-dir', '.xyntherium/cache') || null,
    full_run: bool('full-run', false),
    env: process.env,
    github: contextFromEnv(process.env, token || null),
    mask,
  });
  setOutputs(r.outputs);
  if (r.exit_code === 1) {
    process.stdout.write(`::error::Verify Gate: ${r.config_error ? 'the golden set could not be read' : r.decision} (see the job summary and ${r.outputs['ledger-path'] || 'the log'})\n`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  process.stdout.write(`::error::${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
