/**
 * The Verify pipeline, deterministic first and models second.
 *
 *   1. Extract candidate claims (an injected model extractor, or the
 *      sentence-level fallback), then Stage 2 and the coverage net in code.
 *   2. Per claim: code facts and code-only rules. Most verbatim support,
 *      verbatim qualifier loss, one-value contradictions, broken arithmetic
 *      and external comparisons end here, with no model call.
 *   3. Unresolved claims: a bounded excerpt goes to the fast adjudicator; its
 *      proposal is checked in code (rules.ts). If code cannot confirm, the
 *      strong adjudicator looks once.
 *   4. Optional deliberation may downgrade a verdict to unverifiable. It can
 *      never upgrade one.
 *   5. A hard per-request cost ceiling and deadline: claims that cannot be
 *      reached become unverifiable with the reason, and the result is partial.
 *
 * Model calls are injected, so the whole pipeline runs in tests, in CI and in
 * the benchmark harness with fake or recorded adjudicators.
 */
import { citationStatus, citedFor, parseCitations } from './citations';
import { coverageNet, fallbackCandidates, stage2, type AcceptedClaim, type CandidateClaim, type RejectedClaim } from './claims';
import {
  CORE_VERSION,
  RULES_VERSION,
  SCHEMA_VERSION,
  type ClaimResult,
  type CostLine,
  type OverallStatus,
  type ReleaseRecommendation,
  type VerdictCounts,
  type VerifyRequestBody,
  type VersionInfo,
} from './contract';
import { calibratedConfidence, type CalibrationTable } from './calibration';
import { decideRelease } from './release';
import { selectExcerpts, type Excerpt } from './retrieve';
import { normalize } from './normalize';
import { clauseContext } from './sentences';
import { codeFacts, decideByCode, decideWithModel, hashSources, unresolved, type Adjudication, type Decision, type HashedSource, type Tier } from './rules';

export interface ExtractorOk {
  ok: true;
  candidates: CandidateClaim[];
  cost: CostLine[];
  model: string;
  prompt_version: string;
  cached?: boolean;
}
export interface ExtractorErr {
  ok: false;
  error: string;
  cost: CostLine[];
}
export type Extractor = (input: { question: string; answer: string; deadlineAt: number }) => Promise<ExtractorOk | ExtractorErr>;

export interface AdjudicatorRequest {
  claim: string;
  question: string;
  excerpts: Excerpt[];
  sources: HashedSource[];
  tier: Tier;
  /** Why a stronger tier is being asked (what code could not confirm). */
  hint: string | null;
  deadlineAt: number;
}
export type AdjudicatorResult =
  | { ok: true; adjudication: Adjudication; cost: CostLine; model: string; prompt_version: string }
  | { ok: false; error: 'timeout' | 'provider_error' | 'invalid_output' | 'rate_limited'; cost: CostLine | null; model: string };
export type Adjudicator = (req: AdjudicatorRequest) => Promise<AdjudicatorResult>;

export type DeliberationResult =
  | { ok: true; verdict: Decision['verdict']; agreement: number; votes: { provider: string; verdict: string }[]; cost: CostLine[]; model: string }
  | { ok: false; error: string; cost: CostLine[] };
export type Deliberator = (req: AdjudicatorRequest & { base: Decision }) => Promise<DeliberationResult>;

export interface EngineOptions {
  extract?: Extractor;
  adjudicate?: Adjudicator;
  deliberate?: Deliberator;
  /** off: never; escalation: only claims that stayed uncertain; all: every model-resolved claim. */
  deliberation?: 'off' | 'escalation' | 'all';
  allowStrong?: boolean;
  costCeilingCents?: number;
  /** Pre-call estimates used to stop BEFORE a call would cross the ceiling. */
  estimates?: { extract: number; fast: number; strong: number; deliberate: number };
  deadlineAt?: number;
  now?: () => number;
  concurrency?: number;
  calibration?: CalibrationTable | null;
  maxClaims?: number;
  promptVersions?: { extraction: string; adjudication: string };
}

export interface EngineTelemetry {
  extraction: 'model' | 'cached' | 'fallback';
  claims: number;
  rejected: number;
  splits: number;
  coverage_added: number;
  resolved_by: { code: number; model: number; deliberation: number };
  escalations: number;
  deliberations: number;
  discarded_quotes: number;
  model_calls: number;
  failures: Record<string, number>;
}

export interface EngineResult {
  claims: ClaimResult[];
  rejected_claims: RejectedClaim[];
  partial: boolean;
  partial_reasons: string[];
  overall_status: OverallStatus;
  release_recommendation: ReleaseRecommendation;
  release_reasons: string[];
  counts: VerdictCounts & { total: number; resolved_by_code: number };
  material_unsupported_claims: number[];
  qualifier_loss_detected: boolean;
  cost_lines: CostLine[];
  cost_cents: number;
  versions: VersionInfo;
  sources: HashedSource[];
  internal_scores: number[];
  telemetry: EngineTelemetry;
}

const DEFAULT_ESTIMATES = { extract: 0.2, fast: 0.15, strong: 1.6, deliberate: 12 };

function mergeCost(lines: CostLine[]): CostLine[] {
  const by = new Map<string, CostLine>();
  for (const l of lines) {
    const key = `${l.provider}|${l.model}`;
    const cur = by.get(key);
    if (cur) {
      cur.calls += l.calls;
      cur.input_tokens += l.input_tokens;
      cur.output_tokens += l.output_tokens;
      cur.cost_cents += l.cost_cents;
    } else by.set(key, { ...l });
  }
  return [...by.values()].map((l) => ({ ...l, cost_cents: Math.round(l.cost_cents * 10_000) / 10_000 }));
}

async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runEngine(input: VerifyRequestBody, opts: EngineOptions = {}): Promise<EngineResult> {
  const now = opts.now ?? Date.now;
  const deadlineAt = opts.deadlineAt ?? now() + 60_000;
  const ceiling = opts.costCeilingCents ?? 25;
  const est = opts.estimates ?? DEFAULT_ESTIMATES;
  const allowStrong = opts.allowStrong ?? true;
  const deliberation = opts.deliberation ?? 'off';
  const costs: CostLine[] = [];
  let spent = 0;
  const partialReasons = new Set<string>();
  const telemetry: EngineTelemetry = {
    extraction: 'fallback',
    claims: 0,
    rejected: 0,
    splits: 0,
    coverage_added: 0,
    resolved_by: { code: 0, model: 0, deliberation: 0 },
    escalations: 0,
    deliberations: 0,
    discarded_quotes: 0,
    model_calls: 0,
    failures: {},
  };
  const fail = (k: string) => (telemetry.failures[k] = (telemetry.failures[k] ?? 0) + 1);
  const charge = (lines: (CostLine | null | undefined)[]) => {
    for (const l of lines) {
      if (!l) continue;
      costs.push(l);
      spent += l.cost_cents;
      telemetry.model_calls += l.calls;
    }
  };
  const canSpend = (estimate: number) => spent + estimate <= ceiling;
  const timeLeft = () => deadlineAt - now();

  const sources = hashSources(input.sources ?? []);
  const question = input.question ?? '';
  const answer = input.answer ?? '';
  const requireCitations = !!input.options?.require_citations;
  const models = new Set<string>();
  const promptVersions = new Set<string>();

  // 1. Claims.
  let candidates: CandidateClaim[] | null = null;
  let origin: 'model' | 'fallback' = 'fallback';
  if (opts.extract) {
    if (!canSpend(est.extract)) {
      partialReasons.add('cost ceiling reached before claim extraction; used sentence-level claims');
    } else if (timeLeft() < 2_000) {
      partialReasons.add('deadline reached before claim extraction; used sentence-level claims');
    } else {
      const r = await opts.extract({ question, answer, deadlineAt });
      charge(r.cost);
      if (r.ok) {
        candidates = r.candidates;
        origin = 'model';
        telemetry.extraction = r.cached ? 'cached' : 'model';
        models.add(r.model);
        promptVersions.add(r.prompt_version);
      } else {
        fail(`extract:${r.error}`);
        partialReasons.add('claim extraction model unavailable; used sentence-level claims');
      }
    }
  }
  const s2 = stage2(answer, candidates ?? fallbackCandidates(answer), origin, opts.maxClaims ?? 60);
  const net = coverageNet(answer, s2.accepted);
  const accepted: AcceptedClaim[] = [...s2.accepted, ...net].slice(0, opts.maxClaims ?? 60);
  if (s2.accepted.length + net.length > accepted.length) partialReasons.add(`answer has more than ${opts.maxClaims ?? 60} claims; the rest were not checked`);
  telemetry.claims = accepted.length;
  telemetry.rejected = s2.rejected.length;
  telemetry.splits = s2.splits;
  telemetry.coverage_added = net.length;

  // 2–4. Verdicts.
  const decideClaim = async (claim: Pick<AcceptedClaim, 'text'>): Promise<Decision> => {
    const facts = codeFacts(claim.text, sources);
    const byCode = sources.length ? decideByCode(claim.text, sources, facts) : null;
    if (byCode) return byCode;
    if (!sources.length) {
      return { ...unresolved('provider_error', facts), verdict: 'unsupported', failure_reason: 'no_supporting_span', rule_id: 'R-NO-SOURCES', internal_score: 0.9 };
    }
    if (!opts.adjudicate) return { ...unresolved('provider_error', facts), failure_reason: 'not_adjudicated', rule_id: 'R-NOT-ADJUDICATED' };

    const excerpts = selectExcerpts(claim.text, sources);
    const call = async (tier: Tier, hint: string | null) => {
      const r = await opts.adjudicate!({ claim: claim.text, question, excerpts, sources, tier, hint, deadlineAt });
      charge([r.cost]);
      if (r.ok) {
        models.add(r.model);
        promptVersions.add(r.prompt_version);
      } else fail(`${tier}:${r.error}`);
      return r;
    };

    if (!canSpend(est.fast)) return unresolved('cost_ceiling', facts);
    if (timeLeft() < 3_000) return unresolved('deadline', facts);
    let tier: Tier = 'fast';
    let res = await call('fast', null);
    if (!res.ok) {
      if (allowStrong && canSpend(est.strong) && timeLeft() > 5_000) {
        tier = 'strong';
        res = await call('strong', 'the fast adjudicator failed');
      }
      if (!res.ok) return unresolved(timeLeft() < 1_000 ? 'deadline' : 'provider_error', facts);
    }
    let decision = decideWithModel(claim.text, sources, res.adjudication, tier, facts);
    if (decision.escalate && tier === 'fast') {
      if (allowStrong && canSpend(est.strong) && timeLeft() > 5_000) {
        telemetry.escalations++;
        const strong = await call('strong', decision.escalate);
        if (strong.ok) {
          decision = decideWithModel(claim.text, sources, strong.adjudication, 'strong', facts);
        } else {
          decision = finalizeWithoutStrong(decision);
        }
      } else {
        if (allowStrong && !canSpend(est.strong)) partialReasons.add('cost ceiling reached; some claims were not escalated');
        decision = finalizeWithoutStrong(decision);
      }
    }
    delete decision.escalate;

    // Deliberation can only move a verdict toward unverifiable.
    const wantsPanel =
      opts.deliberate &&
      (deliberation === 'all' || (deliberation === 'escalation' && (tier === 'strong' || decision.internal_score < 0.75 || decision.rule_id.includes('STRONG'))));
    if (wantsPanel && canSpend(est.deliberate) && timeLeft() > 20_000) {
      const d = await opts.deliberate!({ claim: claim.text, question, excerpts, sources, tier: 'strong', hint: null, deadlineAt, base: decision });
      charge(d.cost);
      telemetry.deliberations++;
      if (d.ok) {
        models.add(d.model);
        decision = reconcileDeliberation(decision, d);
      } else fail(`deliberate:${d.error}`);
    }
    return decision;
  };

  // A claim flagged for dropping a condition that its own answer clause states is a
  // fragment of that clause, split off by extraction (a model's, or code's clause
  // split): the answer did not drop the condition, the extracted claim did. Decide
  // the answer clause instead. Only the clause the claim sits in counts (a condition
  // in another clause of the answer does not), and every dropped condition must be
  // stated there (rules 2.0.0).
  const answerClauseCheck = async (claim: AcceptedClaim, d: Decision): Promise<Decision> => {
    if (d.verdict !== 'unsupported' || d.failure_reason !== 'qualifier_loss' || claim.answer_start === null || claim.answer_end === null) return d;
    const dropped = d.qualifiers.filter((q) => q.status === 'dropped' && q.source_text);
    if (!dropped.length) return d;
    const lower = (t: string) => normalize(t).toLowerCase().replace(/[.!?]+$/, '').trim();
    const clause = clauseContext(answer, claim.answer_start, claim.answer_end).text.trim();
    if (!clause || lower(clause) === lower(claim.text)) return d;
    if (!dropped.every((q) => lower(clause).includes(lower(q.source_text!)))) return d;
    const redo = await decideClaim({ text: clause });
    return {
      ...redo,
      rule_id: `R-ANSWER-CLAUSE:${redo.rule_id}`,
      checks: [...redo.checks, { kind: 'qualifiers', result: 'pass', detail: `the answer clause states ${dropped.map((q) => `"${q.source_text}"`).join(', ')}, which the extracted claim lacked; decided on the clause` }],
    };
  };
  const decisions = await pool(accepted, opts.concurrency ?? 6, async (claim): Promise<Decision> => answerClauseCheck(claim, await decideClaim(claim)));

  // Assemble.
  const markers = parseCitations(answer, sources);
  const claims: ClaimResult[] = accepted.map((c, i) => {
    const d = decisions[i];
    if (d.failure_reason === 'cost_ceiling') partialReasons.add('cost ceiling reached; some claims were not checked');
    if (d.failure_reason === 'deadline') partialReasons.add('time limit reached; some claims were not checked');
    if (d.failure_reason === 'provider_error') partialReasons.add('a model provider failed; some claims were not checked');
    telemetry.resolved_by[d.resolved_by]++;
    telemetry.discarded_quotes += d.discarded_quotes;
    const cited = citedFor(answer, markers, c.answer_start, c.answer_end);
    const supportIds = d.spans.filter((s) => s.role === 'supports').map((s) => s.source_id);
    const cal = calibratedConfidence(opts.calibration ?? null, d.verdict, d.internal_score);
    return {
      index: i,
      text: c.text,
      claim_type: c.claim_type,
      material: c.material,
      answer_start: c.answer_start,
      answer_end: c.answer_end,
      verdict: d.verdict,
      failure_reason: d.failure_reason,
      resolved_by: d.resolved_by,
      calibrated_confidence: cal?.value ?? null,
      calibration_label: cal?.label ?? null,
      citation: { cited, status: d.verdict === 'supported' ? citationStatus(requireCitations, cited, supportIds) : requireCitations ? (cited.length ? 'mismatch' : 'missing') : 'not_required' },
      provenance: {
        spans: d.spans,
        context: d.context,
        qualifiers: d.qualifiers,
        checks: d.checks,
        rule_id: d.rule_id,
        model_used: d.resolved_by !== 'code',
        models: d.resolved_by === 'code' ? [] : [...models],
        prompt_versions: d.resolved_by === 'code' ? [] : [...promptVersions],
        discarded_quotes: d.discarded_quotes,
      },
    };
  });

  const partial = partialReasons.size > 0;
  const release = decideRelease({
    claims,
    partial,
    requireCitations,
    thresholds: input.options?.thresholds,
    noSources: sources.length === 0 || sources.every((s) => !s.text.trim()),
  });
  const costLines = mergeCost(costs);
  return {
    claims,
    rejected_claims: s2.rejected,
    partial,
    partial_reasons: [...partialReasons],
    overall_status: release.overall_status,
    release_recommendation: release.release_recommendation,
    release_reasons: release.release_reasons,
    counts: { ...release.counts, resolved_by_code: claims.filter((c) => c.resolved_by === 'code').length },
    material_unsupported_claims: release.material_unsupported_claims,
    qualifier_loss_detected: release.qualifier_loss_detected,
    cost_lines: costLines,
    cost_cents: Math.round(spent * 10_000) / 10_000,
    versions: {
      schema: SCHEMA_VERSION,
      core: CORE_VERSION,
      extraction_prompt: opts.promptVersions?.extraction ?? 'none',
      adjudication_prompt: opts.promptVersions?.adjudication ?? 'none',
      rules: RULES_VERSION,
      calibration: opts.calibration?.validated ? opts.calibration.version : null,
    },
    sources,
    internal_scores: decisions.map((d) => d.internal_score),
    telemetry,
  };
}

/**
 * A fast-tier decision that wanted a strong-tier look and could not get one.
 * Conservative verdicts stand. A pending "supported" stands on the fast
 * model's judgement for the qualifiers code could not decide, and says so.
 */
function finalizeWithoutStrong(d: Decision): Decision {
  const out = { ...d, qualifiers: d.qualifiers.map((r) => ({ ...r })), internal_score: d.internal_score - 0.05 };
  delete out.escalate;
  if (d.rule_id === 'R-MODEL-SUPPORTED-PENDING') {
    out.rule_id = 'R-MODEL-SUPPORTED-FAST-CONFIRMED';
    for (const r of out.qualifiers) {
      if (r.status === 'ambiguous' && r.material) {
        r.status = 'preserved';
        r.note = `${r.note}; judged preserved by the model (code could not decide)`;
      }
    }
  }
  return out;
}

export function reconcileDeliberation(base: Decision, d: Extract<DeliberationResult, { ok: true }>): Decision {
  const check = { kind: 'qualifiers' as const, result: 'inconclusive' as const, detail: `deliberation panel: ${d.votes.map((v) => `${v.provider}=${v.verdict}`).join(', ')}` };
  if ((base.verdict === 'supported' || base.verdict === 'contradicted') && d.verdict !== base.verdict) {
    return {
      ...base,
      verdict: 'unverifiable',
      failure_reason: 'deliberation_disagreement',
      rule_id: 'R-DELIBERATION-DOWNGRADE',
      resolved_by: 'deliberation',
      checks: [...base.checks, check],
      internal_score: Math.min(base.internal_score, 0.55),
    };
  }
  return { ...base, checks: [...base.checks, check] };
}
