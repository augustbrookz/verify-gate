/**
 * Document change mode (the policy-change check). A policy edit can make an
 * answer the team already approved wrong without any code or prompt change.
 * When a pull request changes a file listed under `sources`, only the tests
 * linked to it are re-run against the new version and compared with their
 * previous-version result.
 *
 * A test is `tests[]` in verify-gate.yml — {id, source_ids[], question,
 * answer?, required_conditions[] {class, text}} — or, when a golden set has
 * no tests[], each suite case that uses the changed source (its recorded
 * answer or expected claims; no required conditions).
 *
 * Per test, in code (no model, no units, identical every run):
 *   - the saved answer's verdict before → after (before: the previous Gate
 *     run's result when the cache has it, else recomputed from the base
 *     version);
 *   - each required condition kept or lost (no longer stated by the new
 *     version), and conditions the new version adds to the passages the test
 *     relies on, newly required and missing from the saved answer;
 *   - the source diff excerpt (sentence-aligned).
 *
 * Decisions (precedence hold > block > human_review > pass):
 *   hold          a linked source changed and is unreadable or unversioned
 *                 (no `version`): never a silent pass
 *   block         a required condition is lost, a newly required condition is
 *                 missing from the saved answer, or the new version
 *                 contradicts the saved answer; reported as warn while
 *                 report-only (the default)
 *   human_review  the saved answer matched the old version and is no longer
 *                 supported: with `supersedes`, the newer version conflicts
 *                 (source freshness); without it, nothing is presumed to
 *                 replace the old version and a person decides
 *   pass          still supported; the change is recorded
 * Separately, warn "unprotected source change": a policy-like file changed
 * and no test is linked to it.
 */
import { claimFreshness, contentStems, coverage, sha256Hex, splitSentences, type ClaimResult, type DatedSource, type Verdict } from '@xyntherium/verify-core';
import {
  conditionPhrases,
  containsText as contains,
  detectSourceChange,
  documentParityHash,
  normText as norm,
  sentenceDiff,
  sourceChangeRecord,
  triageDisagreement,
  triageRecord,
  type ConditionClass,
  type ParityRecord,
  type RequiredCondition,
  type SourceChange,
  type TriagePolicy,
} from '@xyntherium/verify-parity';
import type { GateClaim } from './claims';
import { DEFAULT_POLICY } from './defaults';
import { evaluateAnswer, type CaseSource, type ExpectedClaim } from './evaluate';
import { ASSURANCE_SCOPE } from './scope';

// The condition extractor and sentence diff live in verify-parity; re-exported for compatibility.
export { CONDITION_CLASSES, conditionClass, conditionPhrases, sentenceDiff, type ConditionClass, type Hunk, type RequiredCondition } from '@xyntherium/verify-parity';

export const POLICY_CHANGE_VERSION = '0.2.0' as const;


export type DocDecision = 'pass' | 'human_review' | 'block' | 'hold';
/** What the check shows: block is reported as warn while report-only. */
export type ReportedDecision = DocDecision | 'warn';

export interface DocumentTestInput {
  id: string;
  kind: 'test' | 'case';
  location: { path: string; line: number | null };
  question: string;
  /** The saved answer; for a test without one, the base version's sentences that carry its required conditions. */
  answer: string | null;
  /** Expected claims (suite cases), checked with their declared quotes. */
  expected: ExpectedClaim[];
  source_ids: string[];
  required_conditions: RequiredCondition[];
}

export interface ChangedSourceInput {
  id: string;
  path: string;
  /** The pull request's base version; null when it could not be read. */
  before: string | null;
  /** The pull request's version; null when the file was removed, emptied or is unreadable. */
  after: string | null;
  /** Whether verify-gate.yml gives this source a `version`. */
  versioned: boolean;
  version_before: string | null;
  version_after: string | null;
  effective_date_before?: string;
  effective_date_after?: string;
  /** The new version's supersedes list ("refunds@2026-10"). */
  supersedes: string[];
}

export interface UnprotectedChange {
  path: string;
  source_id: string | null;
  /** verify-parity's reading of the edit, when both versions could be read: a cosmetic edit is noted, not warned. */
  change_kind?: 'real' | 'cosmetic' | 'unknown';
  reason: 'not_a_source' | 'no_linked_tests';
}

export interface ConditionResult {
  class: ConditionClass;
  /** kept / lost: a required condition. newly_required: a class of condition the old sentence did not have. changed: same class, reworded or a new value. */
  status: 'kept' | 'lost' | 'newly_required' | 'changed';
  /** Whether the saved answer states it (null without an answer). */
  in_answer: boolean | null;
  text_hash: string;
  /** Text fields only when the report includes text. */
  text?: string;
  /** For a lost condition: what the aligned sentence of the new version says instead. */
  now?: string;
  /** For a changed condition: what the old sentence said. */
  was?: string;
}

export interface DocumentTestResult {
  id: string;
  kind: 'test' | 'case';
  location: { path: string; line: number | null };
  question_hash: string;
  changed_sources: string[];
  decision: DocDecision;
  reported: ReportedDecision;
  verdict_before: Verdict | null;
  verdict_after: Verdict | null;
  before_from: 'previous_run' | 'recomputed' | 'unavailable';
  conditions: ConditionResult[];
  superseded: { source_id: string; version: string | null; newer_version: string | null; explanation: string } | null;
  /** Why, without source or answer text. */
  reasons: string[];
  answer_hash: string | null;
  diff?: { source_id: string; before: string | null; after: string | null }[];
  /** The linked sources changed only cosmetically (verify-parity), so the test passes however code reads the new wording. */
  cosmetic_source_change?: true;
  /** When the previous run's verdict and the recomputed one disagree: did they see the same source snapshots? */
  triage?: { kind: 'infrastructure_fault' | 'genuine_disagreement'; route: string; explanation: string };
}

export interface PolicyChangeReport {
  version: typeof POLICY_CHANGE_VERSION;
  mode: 'document_change';
  changed_sources: {
    id: string;
    path: string;
    sha256_before: string | null;
    sha256_after: string | null;
    versioned: boolean;
    version_before: string | null;
    version_after: string | null;
    supersedes_previous: boolean;
    before_available: boolean;
    /** verify-parity: real or cosmetic, with the changed conditions named (text only when the report includes text). */
    change: Pick<SourceChange, 'kind' | 'counts' | 'changes'> | null;
  }[];
  tests: DocumentTestResult[];
  unprotected: UnprotectedChange[];
  needs_review: number;
  title: string;
  enforcement: 'report_only' | 'enforce';
  conclusion: 'success' | 'neutral' | 'failure';
  method: 'code_only';
  note: string;
  assurance_scope: typeof ASSURANCE_SCOPE;
  /** Every parity result of this check, for the hash-chained Gate ledger. */
  parity_records: ParityRecord[];
}

export const POLICY_CHANGE_NOTE =
  'Each linked test was re-checked in code against the changed source; no answer was regenerated and no model was used. A finding means a person should review the golden set; it is no judgement of the new text.' as const;

export function policyChangeTitle(n: number): string {
  return `Policy changed: ${n} answer${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} review`;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

function aggregate(claims: GateClaim[]): Verdict | null {
  const present = claims.filter((c) => c.present_in_answer && c.verdict !== null);
  if (!present.length) return claims.length ? 'unverifiable' : null;
  if (present.some((c) => c.verdict === 'contradicted')) return 'contradicted';
  if (present.some((c) => c.verdict === 'unsupported')) return 'unsupported';
  if (present.some((c) => c.verdict === 'unverifiable')) return 'unverifiable';
  return 'supported';
}

async function verdictOf(answer: string | null, expected: ExpectedClaim[], sources: CaseSource[]): Promise<Verdict | null> {
  if (answer === null || !sources.length) return null;
  const ev = await evaluateAnswer({ question: '', answer, sources, expected, policy: { ...DEFAULT_POLICY, require_citations: false }, include_text: true });
  return aggregate(ev.claims);
}

/**
 * A test's verdict against the given sources, as document change mode computes it: the
 * Gate records it on every run, so the next change compares with the previous result.
 */
export async function documentTestVerdict(t: DocumentTestInput, sources: CaseSource[]): Promise<Verdict | null> {
  const linked = sources.filter((s) => t.source_ids.includes(s.id));
  let answer = t.answer ?? (t.expected.length ? t.expected.map((e) => (/[.!?]$/.test(e.claim.trim()) ? e.claim.trim() : `${e.claim.trim()}.`)).join(' ') : null);
  if (answer === null && t.required_conditions.length) {
    const carriers = linked.flatMap((s) => splitSentences(s.text).map((x) => x.text.trim())).filter((x) => t.required_conditions.some((rc) => contains(x, rc.text)));
    answer = carriers.length ? carriers.join(' ') : null;
  }
  return verdictOf(answer, t.expected, linked);
}

const versionId = (id: string, version: string | null) => `${id}@${version ?? 'previous'}`;

/** Whether the new version declares that it replaces the base version. */
export function supersedesPrevious(s: Pick<ChangedSourceInput, 'id' | 'version_before' | 'supersedes'>): boolean {
  return s.supersedes.some((x) => (s.version_before ? x === versionId(s.id, s.version_before) : x.startsWith(`${s.id}@`)));
}

async function freshnessFor(answer: string, s: ChangedSourceInput): Promise<DocumentTestResult['superseded']> {
  if (!supersedesPrevious(s) || s.before === null || s.after === null) return null;
  const oldId = versionId(s.id, s.version_before);
  const ev = await evaluateAnswer({ question: '', answer, sources: [{ id: oldId, text: s.before }], expected: [], policy: DEFAULT_POLICY, include_text: true });
  const supported = ev.claims.find((c) => c.verdict === 'supported');
  if (!supported) return null;
  const asResult = { index: 0, text: supported.text ?? answer, provenance: { spans: supported.spans } } as unknown as Pick<ClaimResult, 'index' | 'text' | 'provenance'>;
  const sources: DatedSource[] = [
    { id: oldId, text: s.before, ...(s.version_before ? { version: s.version_before } : {}), ...(s.effective_date_before ? { effective_date: s.effective_date_before } : {}) },
    { id: s.id, text: s.after, supersedes: [oldId], ...(s.version_after ? { version: s.version_after } : {}), ...(s.effective_date_after ? { effective_date: s.effective_date_after } : {}) },
  ];
  return { source_id: s.id, version: s.version_before, newer_version: s.version_after, explanation: claimFreshness(asResult, sources).explanation };
}

const clip = (s: string | null, n = 240) => (s === null ? null : s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function assessPolicyChange(input: {
  changed: ChangedSourceInput[];
  tests: DocumentTestInput[];
  /** Every source's text in the pull request's version (unchanged sources too). */
  current: CaseSource[];
  unprotected?: UnprotectedChange[];
  enforcement: 'report_only' | 'enforce';
  include_text: boolean;
  /** When this check runs (snapshots never read the clock). */
  captured_at: string;
  /** Text in the parity records (they go into the ledger); defaults to include_text. */
  record_text?: boolean;
  /** The previous Gate run's verdict for a test, and the source snapshots it saw, when the cache has it. */
  previous?: (testId: string) => { verdict: Verdict; sources: Record<string, string> } | null;
  /** How a genuine disagreement (same snapshots, different verdicts) is routed. */
  triage_policy?: TriagePolicy;
}): Promise<PolicyChangeReport> {
  const byId = new Map(input.changed.map((s) => [s.id, s]));
  const at = input.captured_at;
  const parityRecords: ParityRecord[] = [];
  // Use 1: each changed source, real or cosmetic, with the changed conditions named.
  const changeOf = new Map<string, SourceChange>();
  for (const s of input.changed) {
    if (s.before === null || s.after === null) continue;
    const c = detectSourceChange({ before: s.before, after: s.after, captured_at: at, include_text: true });
    changeOf.set(s.id, c);
    parityRecords.push(sourceChangeRecord(c, { source_id: s.id, path: s.path, include_text: input.record_text ?? input.include_text }));
  }
  const current = new Map(input.current.map((s) => [s.id, s]));
  const results: DocumentTestResult[] = [];
  for (const t of input.tests) {
    const touched = t.source_ids.filter((id) => byId.has(id));
    if (!touched.length) continue; // only tests linked to a changed source re-run
    const changed = touched.map((id) => byId.get(id)!);
    const reasons: string[] = [];
    const afterSources = t.source_ids.flatMap((id) => (byId.has(id) ? (byId.get(id)!.after === null ? [] : [{ id, text: byId.get(id)!.after! }]) : current.has(id) ? [current.get(id)!] : []));
    const beforeKnown = changed.every((s) => s.before !== null);
    const beforeSources = beforeKnown ? t.source_ids.flatMap((id) => (byId.has(id) ? [{ id, text: byId.get(id)!.before! }] : current.has(id) ? [current.get(id)!] : [])) : null;
    const afterText = afterSources.map((s) => s.text).join('\n');

    // The saved answer: recorded, the expected claims, or the base sentences that carry the required conditions.
    let answer = t.answer ?? (t.expected.length ? t.expected.map((e) => (/[.!?]$/.test(e.claim.trim()) ? e.claim.trim() : `${e.claim.trim()}.`)).join(' ') : null);
    if (answer === null && beforeSources && t.required_conditions.length) {
      const carriers = beforeSources.flatMap((s) => splitSentences(s.text).map((x) => x.text.trim())).filter((x) => t.required_conditions.some((rc) => contains(x, rc.text)));
      answer = carriers.length ? carriers.join(' ') : null;
    }

    // Hunks of the changed sources, and the ones that bear on this test.
    const hunks = changed.flatMap((s) => (s.before !== null && s.after !== null ? sentenceDiff(s.before, s.after).map((h) => ({ source_id: s.id, ...h })) : []));
    const anchor = answer ?? [t.question, ...t.required_conditions.map((c) => c.text)].join(' ');
    const relevant = hunks.filter((h) => {
      const text = h.after ?? h.before ?? '';
      if (h.before && t.required_conditions.some((rc) => contains(h.before!, rc.text))) return true;
      // Both ways: the passage is about what the answer says, not merely sharing a few words with it.
      return Math.min(coverage(contentStems(anchor), contentStems(text)), coverage(contentStems(text), contentStems(anchor))) >= 0.5;
    });

    // Required conditions: kept or lost (no longer stated by the new version).
    const conditions: ConditionResult[] = [];
    const lostReplacements = new Set<string>();
    for (const rc of t.required_conditions) {
      const kept = afterSources.length > 0 && contains(afterText, rc.text);
      let now: string | undefined;
      if (!kept) {
        const h = relevant.find((x) => x.before && contains(x.before, rc.text) && x.after);
        if (h?.after) {
          const repl = conditionPhrases(h.after).find((p) => p.class === rc.class && !contains(h.before!, p.text));
          now = repl?.text ?? clip(h.after, 160)!;
          if (repl) lostReplacements.add(norm(repl.text));
        }
      }
      conditions.push({ class: rc.class, status: kept ? 'kept' : 'lost', in_answer: answer === null ? null : contains(answer, rc.text), text_hash: sha256Hex(rc.text), ...(input.include_text ? { text: rc.text, ...(now ? { now } : {}) } : {}) });
    }
    // Conditions the new version adds to the passages this test relies on. Within a changed
    // sentence, a condition is newly required only when the old sentence had no condition of
    // that class; the same class reworded or with a new value is "changed" (a person looks).
    const seen = new Set<string>();
    for (const h of relevant) {
      if (!h.after) continue;
      const oldPhrases = h.before ? conditionPhrases(h.before) : [];
      for (const p of conditionPhrases(h.after)) {
        if (h.before && contains(h.before, p.text)) continue;
        if (lostReplacements.has(norm(p.text)) || seen.has(norm(p.text))) continue;
        if (t.required_conditions.some((rc) => contains(rc.text, p.text) || contains(p.text, rc.text))) continue;
        seen.add(norm(p.text));
        const was = oldPhrases.find((o) => o.class === p.class);
        conditions.push({
          class: p.class,
          status: was ? 'changed' : 'newly_required',
          in_answer: answer === null ? null : contains(answer, p.text),
          text_hash: sha256Hex(p.text),
          ...(input.include_text ? { text: p.text, ...(was ? { was: was.text } : {}) } : {}),
        });
      }
    }

    // Verdicts.
    const prior = input.previous?.(t.id) ?? null;
    const recomputed = beforeSources ? await verdictOf(answer, t.expected, beforeSources) : null;
    let verdict_before = prior?.verdict ?? recomputed;
    let before_from: DocumentTestResult['before_from'] = prior ? 'previous_run' : beforeSources ? 'recomputed' : 'unavailable';
    // Use 2: the previous run and the recomputation disagree. Did they see the same source snapshots?
    let triage: DocumentTestResult['triage'];
    let genuineRoute: string | null = null;
    if (prior && recomputed && prior.verdict !== recomputed && beforeSources) {
      const seen = Object.fromEntries(beforeSources.map((s) => [s.id, documentParityHash(s.text, at)]));
      const runs = [
        { run_id: 'previous_run', outcome: prior.verdict, sources: prior.sources },
        { run_id: 'recomputed', outcome: recomputed, sources: seen },
      ];
      const tr = triageDisagreement(runs, input.triage_policy);
      parityRecords.push(triageRecord(t.id, runs, tr));
      if (tr.kind === 'infrastructure_fault') {
        // REEVAL: the previous result was made on a different snapshot; use the re-evaluation.
        verdict_before = recomputed;
        before_from = 'recomputed';
        triage = { kind: tr.kind, route: tr.route, explanation: tr.explanation };
      } else if (tr.kind === 'genuine_disagreement') {
        genuineRoute = tr.route;
        triage = { kind: tr.kind, route: tr.route, explanation: tr.explanation };
      }
    }
    const verdict_after = await verdictOf(answer, t.expected, afterSources);

    // Freshness: the saved answer matched the old version; does a declared newer version conflict?
    let superseded: DocumentTestResult['superseded'] = null;
    if (answer !== null && verdict_before === 'supported' && verdict_after !== 'supported') {
      for (const s of changed) superseded = (await freshnessFor(answer, s)) ?? superseded;
    }

    // Decide.
    let decision: DocDecision = 'pass';
    const unreadable = changed.filter((s) => s.after === null).map((s) => s.id);
    const unversioned = changed.filter((s) => !s.versioned).map((s) => s.id);
    if (unreadable.length) reasons.push(`source unreadable or removed: ${unreadable.join(', ')}`);
    if (unversioned.length) reasons.push(`source has no version in verify-gate.yml: ${unversioned.join(', ')}`);
    const lost = conditions.filter((c) => c.status === 'lost');
    const missingNew = conditions.filter((c) => c.status === 'newly_required' && c.in_answer === false);
    if (unreadable.length || unversioned.length) decision = 'hold';
    else if (lost.length || missingNew.length || verdict_after === 'contradicted') {
      decision = 'block';
      if (lost.length) reasons.push(`${lost.length} required condition(s) lost: ${lost.map((c) => c.class).join(', ')}`);
      if (missingNew.length) reasons.push(`${missingNew.length} condition(s) newly required by the new version and missing from the saved answer: ${missingNew.map((c) => c.class).join(', ')}`);
      if (verdict_after === 'contradicted') reasons.push('the new version contradicts the saved answer');
    } else if (verdict_after !== null && verdict_after !== 'supported' && (verdict_before === null || verdict_before === 'supported')) {
      decision = 'human_review';
      reasons.push(superseded ? 'the saved answer matches the old version, and the newer version that supersedes it conflicts' : `the saved answer is ${verdict_after} against the new version, and nothing declares that it replaces the old one`);
    } else if (conditions.some((c) => c.status === 'changed' && c.in_answer === false)) {
      decision = 'human_review';
      reasons.push(`a condition the saved answer relies on was reworded or changed: ${conditions.filter((c) => c.status === 'changed').map((c) => c.class).join(', ')}`);
    } else if (verdict_after === null && answer === null && !t.required_conditions.length) {
      decision = 'human_review';
      reasons.push('the test has no saved answer and no required conditions to check');
    }
    // A cosmetic change (verify-parity: formatting only; every condition, value, date,
    // negation, modality and citation equal) cannot have made a saved answer wrong. Code may
    // read the reformatted wording differently (its verdict is still reported); the decision
    // is a pass. An unreadable or unversioned source still holds.
    const cosmeticOnly = changed.every((s) => ['cosmetic', 'none'].includes(changeOf.get(s.id)?.kind ?? 'unknown'));
    const cosmeticPass = cosmeticOnly && (decision === 'human_review' || decision === 'block') && !genuineRoute;
    if (cosmeticPass) {
      reasons.length = 0;
      // Nothing was superseded: the policy did not change.
      superseded = null;
      reasons.push(`the source change is cosmetic (verify-parity: formatting only; no condition, value, date, negation, modality or citation changed), so it is not a change to the policy; code reads the new wording as ${verdict_after ?? 'n/a'}`);
      decision = 'pass';
    }
    if (genuineRoute && decision !== 'hold' && decision !== 'block') {
      // Same snapshots, different verdicts: route per policy (default human review).
      if (genuineRoute === 'block') decision = 'block';
      else if (decision === 'pass') decision = 'human_review';
      reasons.push(`the previous run and a recomputation disagree on the same source snapshots (${prior!.verdict} vs ${recomputed}): ${genuineRoute.replace('_', ' ')}`);
    }
    if (decision === 'pass' && !reasons.length) reasons.push('still supported; the change is recorded');
    if (superseded && decision === 'block') reasons.push('the saved answer also still matches the superseded version');
    results.push({
      id: t.id,
      kind: t.kind,
      location: t.location,
      question_hash: sha256Hex(t.question),
      changed_sources: touched,
      decision,
      reported: decision === 'block' && input.enforcement === 'report_only' ? 'warn' : decision,
      verdict_before,
      verdict_after,
      before_from,
      conditions,
      superseded,
      reasons,
      answer_hash: answer === null ? null : sha256Hex(answer),
      ...(cosmeticPass ? { cosmetic_source_change: true as const } : {}),
      ...(triage ? { triage } : {}),
      ...(input.include_text ? { diff: relevant.map((h) => ({ source_id: h.source_id, before: clip(h.before), after: clip(h.after) })) } : {}),
    });
  }
  const n = results.filter((r) => r.decision !== 'pass').length;
  const unprotected = input.unprotected ?? [];
  const failing = results.some((r) => r.decision === 'block' || r.decision === 'hold');
  return {
    version: POLICY_CHANGE_VERSION,
    mode: 'document_change',
    changed_sources: input.changed.map((s) => ({
      id: s.id,
      path: s.path,
      sha256_before: s.before === null ? null : sha256Hex(s.before),
      sha256_after: s.after === null ? null : sha256Hex(s.after),
      versioned: s.versioned,
      version_before: s.version_before,
      version_after: s.version_after,
      supersedes_previous: supersedesPrevious(s),
      before_available: s.before !== null,
      change: changeOf.has(s.id)
        ? (() => {
            const c = changeOf.get(s.id)!;
            return { kind: c.kind, counts: c.counts, changes: input.include_text ? c.changes : c.changes.map((x) => ({ ...x, before: null, after: null })) };
          })()
        : null,
    })),
    tests: results,
    unprotected,
    needs_review: n,
    title: policyChangeTitle(n),
    enforcement: input.enforcement,
    conclusion: input.enforcement === 'enforce' && failing ? 'failure' : n || unprotected.some((u) => u.change_kind !== 'cosmetic') ? 'neutral' : 'success',
    method: 'code_only',
    note: POLICY_CHANGE_NOTE,
    assurance_scope: ASSURANCE_SCOPE,
    parity_records: parityRecords,
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/\r?\n/g, ' ');
const LABEL: Record<ReportedDecision, string> = { pass: '✅ pass', human_review: '👀 human review', warn: '⚠️ warn (would block)', block: '⛔ block', hold: '⏸️ hold' };

function conditionCell(c: ConditionResult): string {
  const what = c.text ? `"${esc(c.text)}"` : c.class;
  if (c.status === 'lost') return `❌ lost ${c.class} ${what}${c.now ? ` (now: "${esc(c.now)}")` : ''}`;
  if (c.status === 'newly_required') return c.in_answer === false ? `➕ newly required ${c.class} ${what}, missing from the answer` : `➕ new ${c.class} ${what}${c.in_answer ? ', stated in the answer' : ''}`;
  if (c.status === 'changed') return `~ changed ${c.class}${c.was ? ` "${esc(c.was)}" →` : ''} ${what}`;
  return `✓ ${c.class} ${what}`;
}

const CHANGE_WORDS: Record<string, string> = {
  condition_added: 'added',
  condition_removed: 'removed',
  condition_changed: 'changed',
  value_changed: 'value changed',
  date_changed: 'date changed',
  negation_changed: 'negation changed',
  modality_changed: 'modality changed',
  citation_changed: 'citation changed',
  wording_changed: 'wording changed',
  sentence_added: 'sentence added',
  sentence_removed: 'sentence removed',
};

/** verify-parity's reading of a source change, in one line. */
function describeChange(c: NonNullable<PolicyChangeReport['changed_sources'][number]['change']>): string {
  if (c.kind === 'none') return 'Parity: no change.';
  if (c.kind === 'cosmetic') return `Parity: cosmetic only (${c.counts.cosmetic} sentence${c.counts.cosmetic === 1 ? '' : 's'} reformatted; no condition, value, date or citation changed).`;
  const named = c.changes.slice(0, 6).map((x) => {
    const what = x.class ? `${x.class} ${CHANGE_WORDS[x.type] ?? x.type}` : (CHANGE_WORDS[x.type] ?? x.type);
    const detail = x.type === 'condition_changed' && x.before && x.after ? `: "${esc(x.before)}" → "${esc(x.after)}"` : x.type === 'condition_added' && x.after ? `: "${esc(x.after)}"` : x.type === 'condition_removed' && x.before ? `: "${esc(x.before)}"` : '';
    return `${what}${detail}`;
  });
  return `Parity: real change (${named.join('; ')}${c.changes.length > 6 ? `; ${c.changes.length - 6} more` : ''}).`;
}

/** The section for the job summary, PR comment and check run. */
export function renderPolicyChange(r: PolicyChangeReport): string {
  const lines: string[] = [`### ${r.title}`, ''];
  for (const s of r.changed_sources) {
    const v = s.version_before || s.version_after ? `: version ${s.version_before ?? '(none)'} → ${s.version_after ?? '(none)'}` : '';
    const sup = !s.versioned ? ' (no version in verify-gate.yml: linked tests hold)' : s.supersedes_previous ? `, which supersedes ${s.id}@${s.version_before ?? 'previous'}` : ` (no \`supersedes: [${s.id}@${s.version_before ?? '…'}]\`, so freshness is not established)`;
    lines.push(`- \`${esc(s.path)}\` (${esc(s.id)}) changed${v}${sup}.${s.before_available ? '' : ' The base version could not be read: before-verdicts are unavailable.'}${s.change ? ` ${describeChange(s.change)}` : ''}`);
  }
  if (r.changed_sources.length) lines.push('', 'Only the tests linked to a changed source were re-run, in code, against the new version.', '');
  if (r.tests.length) {
    lines.push('| Test | Verdict before → after | Conditions | Decision | Source change |', '|---|---|---|---|---|');
    for (const t of r.tests) {
      const cond = t.conditions.filter((c) => c.status !== 'kept' || t.conditions.length <= 3).map(conditionCell).join('<br>') || '—';
      const diff = (t.diff ?? []).slice(0, 2).map((d) => (d.before && d.after ? `~~${esc(d.before)}~~ → ${esc(d.after)}` : d.after ? `added: ${esc(d.after)}` : `removed: ~~${esc(d.before ?? '')}~~`)).join('<br>') || '—';
      const fresh = t.cosmetic_source_change
        ? `<br>Cosmetic source change only (verify-parity): code reads the new wording as ${t.verdict_after ?? 'n/a'}, but no condition, value, date or citation changed.`
        : t.superseded
          ? `<br>Still matches the superseded version ${esc(t.superseded.version ?? 'previous')}: ${esc(t.superseded.explanation)}.`
          : '';
      lines.push(`| \`${esc(t.id)}\` | ${t.verdict_before ?? 'n/a'} → ${t.verdict_after ?? 'n/a'}${t.before_from === 'previous_run' ? ' (before: previous run)' : ''} | ${cond} | ${LABEL[t.reported]}${fresh} | ${diff} |`);
    }
  } else if (r.changed_sources.length) lines.push('_No test is linked to the changed source._');
  for (const u of r.unprotected) {
    if (u.change_kind === 'cosmetic') {
      lines.push('', `ℹ️ \`${esc(u.path)}\` changed cosmetically (formatting only, no condition, value, date or citation changed); no test is linked to it.`);
      continue;
    }
    lines.push('', `⚠️ **Unprotected source change:** \`${esc(u.path)}\` changed and ${u.reason === 'not_a_source' ? 'is not listed under `sources`' : `no test links source \`${esc(u.source_id ?? '')}\``}, so no answer was re-checked against it. Link it with a test (\`tests[].source_ids\`) or list it under \`sources\`.`);
  }
  lines.push(
    '',
    r.enforcement === 'enforce'
      ? 'Enforced: a block or hold fails this check.'
      : 'Report-only: blocks are shown as warnings and nothing fails. After review, update the saved answers and required conditions and re-pin the source with `npx @xyntherium/verify-cli pin`.',
    '',
    `> ${r.note} Assurance scope: ${ASSURANCE_SCOPE}`,
  );
  return lines.join('\n');
}
