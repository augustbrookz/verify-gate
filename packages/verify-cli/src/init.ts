/**
 * `xyntherium-verify init`: draft a starter golden set from the repository's
 * own documentation, so a team reaches a first real result in minutes.
 *
 * Reads README*, docs/ and any folders passed with --sources (Markdown and
 * plain text), picks 10–20 statements a support or docs bot is likely to be
 * asked about — sentences with numbers, deadlines, prices, conditions or
 * exceptions — and writes verify-gate.yml with each as a question, its exact
 * source passage (quote) and a material claim. Selection is deterministic and
 * uses no model. The file is marked `draft: true` ("review before trusting"):
 * the Gate reports but never enforces until a person approves the questions
 * and removes the flag.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { dump } from 'js-yaml';
import { conditionPhrases, type RequiredCondition } from '../../verify-policy/src/index';
import { globToRegExp } from '../../verify-action/src/gate/changes';
import { DEFAULT_POLICY_PATHS } from '../../verify-action/src/gate/config';

export interface DraftSource {
  id: string;
  path: string;
  text: string;
  sha256: string;
}

export interface DraftCase {
  id: string;
  question: string;
  source: string;
  quote: string;
  materiality: 'critical' | 'high' | 'medium';
}

const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.markdown', '.rst']);
const SIGNAL = /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:%|percent|days?|business days|hours?|weeks?|months?|years?|minutes?|GB|MB|users?|seats?)\b|\b(?:within|no later than|before|after|until|only if|unless|except|excluding|must|may not|cannot|required|eligible|refund|cancel|free|fee|price|limit)\b/i;

export function listDocs(root: string, extra: string[] = []): string[] {
  const out: string[] = [];
  for (const f of readdirSync(root)) if (/^readme/i.test(f) && TEXT_EXT.has(extname(f).toLowerCase())) out.push(f);
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || !existsSync(join(root, dir))) return;
    for (const name of readdirSync(join(root, dir)).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const rel = join(dir, name);
      const st = statSync(join(root, rel));
      if (st.isDirectory()) walk(rel, depth + 1);
      else if (TEXT_EXT.has(extname(name).toLowerCase()) && st.size < 500_000) out.push(rel);
    }
  };
  for (const d of ['docs', ...extra]) walk(d, 0);
  return [...new Set(out)].sort();
}

/** Plain sentences of a Markdown/text file, with their exact text (so the quote is verbatim). */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  const lines = text.replace(/```[\s\S]*?```/g, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(?:#|\||!\[|<|---|>\s*$)/.test(line)) continue;
    const body = line.replace(/^(?:[-*+]|\d+\.)\s+/, '');
    for (const s of body.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const t = s.trim();
      if (t.length >= 40 && t.length <= 300 && /[.!?]$/.test(t) && !/[`[\]]/.test(t) && t.split(/\s+/).length >= 7) out.push(t);
    }
  }
  return out;
}

function topicOf(sentence: string): string {
  const words = sentence.replace(/[.!?]$/, '').split(/\s+/);
  return words.slice(0, Math.min(8, words.length)).join(' ').replace(/[,;:]$/, '');
}

export function questionFor(sentence: string, title: string): string {
  const s = sentence.toLowerCase();
  if (/\brefund/.test(s)) return `What is the refund policy${title ? ` (${title})` : ''}?`;
  if (/\$\s?\d|\bprice|\bcost|\bfee/.test(s)) return `How much does it cost${title ? ` (${title})` : ''}: ${topicOf(sentence)}?`;
  if (/\b(within|no later than|before|after|until|days?|hours?|weeks?)\b/.test(s)) return `What is the deadline or time limit for: ${topicOf(sentence)}?`;
  if (/\b(only if|unless|except|eligible|required|must)\b/.test(s)) return `What are the conditions for: ${topicOf(sentence)}?`;
  return `What does ${title || 'the documentation'} say about: ${topicOf(sentence)}?`;
}

export function draftGoldenSet(root: string, o: { sources?: string[]; max?: number } = {}): { sources: DraftSource[]; cases: DraftCase[] } {
  const files = listDocs(root, o.sources ?? []);
  const sources: DraftSource[] = [];
  const candidates: { s: DraftSource; sentence: string; score: number; title: string }[] = [];
  const ids = new Set<string>();
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    let id = f.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'doc';
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    const src = { id, path: relative(root, join(root, f)), text, sha256: createHash('sha256').update(readFileSync(join(root, f))).digest('hex') };
    const title = (/^#\s+(.+)$/m.exec(text)?.[1] ?? '').trim().slice(0, 60);
    let used = false;
    for (const sentence of sentencesOf(text)) {
      if (!SIGNAL.test(sentence) || !text.includes(sentence)) continue;
      const score = (sentence.match(new RegExp(SIGNAL.source, 'gi')) ?? []).length + (/\d/.test(sentence) ? 2 : 0);
      candidates.push({ s: src, sentence, score, title });
      used = true;
    }
    if (used) sources.push(src);
  }
  // Highest-signal statements first; at most three per file so the set spans the docs.
  candidates.sort((a, b) => b.score - a.score || (a.s.path < b.s.path ? -1 : 1));
  const perFile = new Map<string, number>();
  const cases: DraftCase[] = [];
  for (const c of candidates) {
    if (cases.length >= (o.max ?? 20)) break;
    const n = perFile.get(c.s.id) ?? 0;
    if (n >= 3) continue;
    perFile.set(c.s.id, n + 1);
    const crit = /\$\s?\d|\b\d+\s?(?:days?|business days|hours?)\b|\brefund|\bfee\b/i.test(c.sentence);
    cases.push({ id: `${c.s.id}-${n + 1}`.slice(0, 120), question: questionFor(c.sentence, c.title), source: c.s.id, quote: c.sentence, materiality: crit ? 'critical' : 'high' });
  }
  return { sources: sources.filter((s) => cases.some((c) => c.source === s.id)), cases };
}

export function renderGoldenSet(d: { sources: DraftSource[]; cases: DraftCase[] }, o: { endpoint?: string | null } = {}): string {
  const doc = {
    version: 1,
    draft: true,
    mode: 'local',
    sources: d.sources.map((s) => ({ id: s.id, path: s.path, version: 'draft', sha256: s.sha256 })),
    ...(o.endpoint ? { endpoint: { url: o.endpoint, method: 'POST', headers: { Authorization: 'Bearer ${env.APP_API_TOKEN}' }, body: '{"question": "{{question}}"}', answer_path: '/answer' } } : {}),
    policy: { enforcement: 'report_only' },
    suites: [
      {
        name: 'starter',
        cases: d.cases.map((c) => ({
          id: c.id,
          question: c.question,
          ...(o.endpoint ? {} : { answer: c.quote }),
          sources: [c.source],
          material_claims: [{ claim: c.quote.replace(/[.!?]$/, ''), materiality: c.materiality, quote: c.quote, source: c.source }],
        })),
      },
    ],
  };
  const header = [
    '# Verify Gate golden set — DRAFT: review before trusting.',
    '# Drafted by `xyntherium-verify init` from this repository\'s documentation. A person must',
    '# check every question, passage and claim, then remove `draft: true` and set',
    '# `policy.enforcement: enforce` to let the Gate block. Until then it only reports.',
    o.endpoint ? '# Each case calls the endpoint below; set APP_API_TOKEN as a repository secret.' : '# Each case uses a recorded answer (the passage itself). Point an endpoint at your app to check live answers.',
    '# Evidence support for supplied sources only; not a compliance certification.',
    '',
  ].join('\n');
  return header + dump(doc, { lineWidth: 140, noRefs: true, quotingType: '"' });
}

export const WORKFLOW = `name: Verify Gate
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
  issue_comment:
    types: [created]
  schedule:
    - cron: '17 3 * * *' # nightly full run
permissions:
  contents: read
  pull-requests: write
  checks: write
  security-events: write
jobs:
  verify-gate:
    if: github.event_name != 'issue_comment' || (github.event.issue.pull_request && startsWith(github.event.comment.body, '/verify-override'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: .xyntherium/cache
          key: verify-gate-\${{ github.run_id }}
          restore-keys: verify-gate-
      - uses: augustbrookz/verify-gate@v0
        with:
          config: verify-gate.yml
          fail-on: block
          # api-key: \${{ secrets.XYN_API_KEY }}        # hosted mode only
          # signing-key: \${{ secrets.XYN_GATE_SIGNING_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: verify-gate
          path: |
            .xyntherium/verify-gate-ledger.json
            .xyntherium/verify-gate.sarif
            .xyntherium/verify-gate-summary.md
            .xyntherium/verify-gate-policy-change.json
        # Best effort: an artifact storage quota must not fail the job.
        continue-on-error: true
`;

// ---------------------------------------------------------------------------
// init --policy-gate: document change mode from the repository's policy and help docs
// ---------------------------------------------------------------------------

export interface DraftTest {
  id: string;
  source: string;
  question: string;
  answer: string;
  required_conditions: RequiredCondition[];
}

const POLICY_EXT = /\.(?:md|mdx|markdown|txt|html?|rst|adoc)$/i;
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', '.git', '.next']);

/** Files that look like policy or help content (the same patterns the unprotected-change warning uses). */
export function listPolicyDocs(root: string, patterns: string[] = DEFAULT_POLICY_PATHS): string[] {
  const res = patterns.map(globToRegExp);
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const name of readdirSync(join(root, dir)).sort()) {
      if (name.startsWith('.') || SKIP_DIR.has(name)) continue;
      const rel = dir ? `${dir}/${name}` : name;
      const st = statSync(join(root, rel));
      if (st.isDirectory()) walk(rel, depth + 1);
      else if (POLICY_EXT.test(name) && st.size < 500_000 && res.some((r) => r.test(rel))) out.push(rel);
    }
  };
  walk('', 0);
  return out;
}

/**
 * Draft sources, tests and required conditions from the policy docs: each
 * statement that carries a condition (a deadline, an eligibility rule, an
 * exception, a scope, a modality, a negation or a quantity) becomes a test whose
 * saved answer is the statement and whose required conditions are its
 * conditions, verbatim. Deterministic, no model. Always a draft.
 */
export function draftPolicyGate(root: string, o: { max?: number; perDoc?: number; patterns?: string[] } = {}): { sources: DraftSource[]; tests: DraftTest[] } {
  const sources: DraftSource[] = [];
  const tests: DraftTest[] = [];
  const ids = new Set<string>();
  for (const f of listPolicyDocs(root, o.patterns)) {
    if (tests.length >= (o.max ?? 20)) break;
    const bytes = readFileSync(join(root, f));
    const text = bytes.toString('utf8');
    let id = f.replace(/\.[^.]+$/, '').split('/').slice(-2).join('-').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'policy';
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    const title = (/^#\s+(.+)$/m.exec(text)?.[1] ?? '').trim().slice(0, 60);
    const picked = sentencesOf(text)
      .filter((s) => text.includes(s))
      .map((s) => ({ s, conds: conditionPhrases(s).filter((c, i, all) => all.findIndex((x) => x.text.toLowerCase() === c.text.toLowerCase()) === i) }))
      .filter((x) => x.conds.some((c) => c.class !== 'modality'))
      .slice(0, o.perDoc ?? 4);
    if (!picked.length) continue;
    sources.push({ id, path: f, text, sha256: createHash('sha256').update(bytes).digest('hex') });
    for (const [n, p] of picked.entries()) {
      if (tests.length >= (o.max ?? 20)) break;
      tests.push({ id: `${id}-${n + 1}`.slice(0, 120), source: id, question: questionFor(p.s, title), answer: p.s, required_conditions: p.conds.slice(0, 4) });
    }
  }
  return { sources: sources.filter((s) => tests.some((t) => t.source === s.id)), tests };
}

export function renderPolicyGate(d: { sources: DraftSource[]; tests: DraftTest[] }, o: { date?: string } = {}): string {
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  const doc = {
    version: 1,
    draft: true,
    mode: 'local',
    sources: d.sources.map((s) => ({ id: s.id, path: s.path, version: date, sha256: s.sha256 })),
    policy: { enforcement: 'report_only' },
    policy_change: { enforcement: 'report_only' },
    tests: d.tests.map((t) => ({ id: t.id, source_ids: [t.source], question: t.question, answer: t.answer, required_conditions: t.required_conditions.map((c) => ({ class: c.class, text: c.text })) })),
  };
  const header = [
    '# Verify Gate document change mode: DRAFT, review before trusting.',
    '# Drafted by `xyntherium init --policy-gate` from the policy and help docs in this repository.',
    '# Each test is a statement from a doc (the saved answer) and the conditions it must keep.',
    '# A person must check every question, answer and required condition, and set each',
    "# source's `version` to the policy's own version label, then remove `draft: true`.",
    '# When a source changes in a pull request, the tests linked to it re-run against the new',
    '# version: "Policy changed: N answers need review". Report-only until you set',
    '# `policy_change.enforcement: enforce`.',
    '# Evidence support for supplied sources only; not a compliance certification.',
    '',
  ].join('\n');
  return header + dump(doc, { lineWidth: 140, noRefs: true, quotingType: '"' });
}

