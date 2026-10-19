/**
 * The Action's logic, separated from GitHub's I/O so it can be tested: load
 * fixtures, verify each through the SDK (the same /v1/verify contract), and
 * decide pass/fail against the configured threshold.
 */
import { readFileSync } from 'node:fs';
import { Xyntherium, type VerifyRequestBody, type VerifyResponseBody } from '../../verify-sdk/src/index';

export interface Fixture extends VerifyRequestBody {
  name?: string;
}

export interface ActionConfig {
  apiKey: string;
  fixturesPath: string;
  allowed: string[];
  maxFailures: number;
  baseUrl: string;
  concurrency: number;
  fetch?: typeof fetch;
}

export interface FixtureOutcome {
  name: string;
  recommendation: string | null;
  passed: boolean;
  problems: string[];
  error: string | null;
}

export function loadFixtures(path: string): Fixture[] {
  const raw = readFileSync(path, 'utf8').trim();
  const list: unknown = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (!Array.isArray(list) || !list.length) throw new Error(`${path}: expected a non-empty JSON array or JSONL file`);
  return list.map((f, i) => {
    const x = f as Fixture;
    if (!x.question || !x.answer || !Array.isArray(x.sources)) throw new Error(`${path}: fixture ${i + 1} needs question, answer and sources`);
    return x;
  });
}

export async function runFixtures(cfg: ActionConfig): Promise<{ outcomes: FixtureOutcome[]; failed: number; ok: boolean }> {
  const client = new Xyntherium({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) });
  const fixtures = loadFixtures(cfg.fixturesPath);
  const outcomes: FixtureOutcome[] = new Array(fixtures.length);
  let next = 0;
  const worker = async () => {
    while (next < fixtures.length) {
      const i = next++;
      const f = fixtures[i];
      const name = f.name ?? `fixture ${i + 1}`;
      try {
        const r: VerifyResponseBody = await client.verify({ question: f.question, answer: f.answer, sources: f.sources, ...(f.options ? { options: f.options } : {}) });
        const passed = cfg.allowed.includes(r.release_recommendation);
        const problems = r.claims
          .filter((c) => c.verdict !== 'supported')
          .map((c) => `${c.verdict}${c.failure_reason ? ` (${c.failure_reason})` : ''}: ${c.text}`);
        outcomes[i] = { name, recommendation: r.release_recommendation, passed, problems, error: null };
      } catch (e) {
        outcomes[i] = { name, recommendation: null, passed: false, problems: [], error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, 10)) }, worker));
  const failed = outcomes.filter((o) => !o.passed).length;
  return { outcomes, failed, ok: failed <= cfg.maxFailures };
}

export function summaryMarkdown(outcomes: FixtureOutcome[], ok: boolean, cfg: Pick<ActionConfig, 'allowed' | 'maxFailures'>): string {
  const rows = outcomes.map((o) => `| ${o.passed ? '✅' : '❌'} | ${o.name.replace(/\|/g, '\\|')} | ${o.recommendation ?? `error: ${o.error}`} | ${o.problems.slice(0, 3).join('<br>').replace(/\|/g, '\\|')} |`);
  return [
    `## Xyntherium Verify: ${ok ? 'passed' : 'failed'}`,
    '',
    `${outcomes.filter((o) => o.passed).length}/${outcomes.length} fixtures got ${cfg.allowed.join(' or ')} (up to ${cfg.maxFailures} allowed to fail).`,
    '',
    '| | Fixture | Release recommendation | Claims not supported |',
    '|---|---|---|---|',
    ...rows,
    '',
    '_Verdicts describe whether the supplied passages support each claim, not whether any claim is true in the world._',
  ].join('\n');
}
