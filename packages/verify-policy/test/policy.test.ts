import { describe, expect, it } from 'vitest';
import {
  checkOverride,
  DEFAULT_POLICY,
  evaluateCase,
  parseOverrideComment,
  resolvePolicy,
  runOutcome,
  worst,
  type GateClaim,
  type GatePolicy,
  type Materiality,
} from '../src/index';

function claim(over: Partial<GateClaim> = {}): GateClaim {
  return {
    index: 0,
    origin: 'answer',
    expected_id: null,
    materiality: 'high',
    claim_hash: 'h',
    present_in_answer: true,
    answer_span: { start: 0, end: 10 },
    verdict: 'supported',
    failure_reason: null,
    verify_rule_id: 'R-VERBATIM-SUPPORTED',
    span_valid: true,
    support_assessment: 'supported',
    qualifier_checks: [],
    resolved_by: 'code',
    review_required: false,
    deterministic: true,
    citation: { required: false, status: 'not_required' },
    spans: [],
    discarded_quotes: 0,
    calibrated_confidence: null,
    ...over,
  };
}
const policy = (over: Partial<GatePolicy> = {}): GatePolicy => ({ ...resolvePolicy({}).policy, ...over });
const decide = (claims: GateClaim[], p = policy(), mode: 'local' | 'hosted' = 'local') => evaluateCase({ claims, integrity: [], policy: p, mode });

describe('decision table (defaults)', () => {
  const contradicted = (m: Materiality, deterministic = true) => claim({ materiality: m, verdict: 'contradicted', failure_reason: 'number_mismatch', support_assessment: 'contradicted', deterministic, resolved_by: deterministic ? 'code' : 'model' });
  const qloss = (m: Materiality) => claim({ materiality: m, verdict: 'unsupported', failure_reason: 'qualifier_loss', qualifier_checks: [{ type: 'condition', status: 'missing', material: true, proposed_by: 'code', note: '', claim_text_hash: null, source_text_hash: 'x' }] });
  const unsupported = (m: Materiality) => claim({ materiality: m, verdict: 'unsupported', failure_reason: 'no_supporting_span', support_assessment: 'unresolved' });
  const unverifiable = (m: Materiality, reason = 'comparative') => claim({ materiality: m, verdict: 'unverifiable', failure_reason: reason, support_assessment: 'unresolved' });

  it('pass: every material claim supported', () => {
    const r = decide([claim(), claim({ index: 1, materiality: 'low' })]);
    expect(r.decision).toBe('pass');
    expect(r.findings).toEqual([]);
  });

  it.each([
    ['critical', 'block'],
    ['high', 'block'],
    ['medium', 'block'],
    ['low', 'warn'],
  ] as const)('XYN-001 contradicted %s → %s', (m, want) => {
    const r = decide([contradicted(m)]);
    expect(r.findings[0].rule).toBe('XYN-001');
    expect(r.decision).toBe(want);
  });

  it.each([
    ['critical', 'block'],
    ['high', 'block'],
    ['medium', 'block'],
    ['low', 'warn'],
  ] as const)('XYN-002 dropped qualifier %s → %s', (m, want) => {
    const r = decide([qloss(m)]);
    expect(r.findings[0]).toMatchObject({ rule: 'XYN-002', kind: 'dropped_qualifier', qualifier_type: 'condition' });
    expect(r.decision).toBe(want);
  });

  it.each([
    ['critical', 'block'],
    ['high', 'block'],
    ['medium', 'warn'],
    ['low', 'warn'],
  ] as const)('XYN-003 unsupported %s → %s', (m, want) => {
    expect(decide([unsupported(m)]).decision).toBe(want);
  });

  it('XYN-005 unresolved warns by default and follows treat_unverifiable_as', () => {
    expect(decide([unverifiable('critical')]).decision).toBe('warn');
    expect(decide([unverifiable('critical')], policy({ treat_unverifiable_as: 'block' })).decision).toBe('block');
    expect(decide([unverifiable('high')], policy({ treat_unverifiable_as: 'hold' })).decision).toBe('hold');
    expect(decide([unverifiable('high')], policy({ treat_unverifiable_as: 'pass' })).decision).toBe('pass');
  });

  it('verifier failures on a claim are XYN-006 hold, never warn or pass', () => {
    for (const reason of ['provider_error', 'deadline', 'cost_ceiling']) {
      const r = decide([unverifiable('low', reason)], policy({ treat_unverifiable_as: 'pass' }));
      expect(r.findings[0].rule).toBe('XYN-006');
      expect(r.decision).toBe('hold');
    }
  });

  it('XYN-004: a missing required citation on a material claim blocks', () => {
    const c = claim({ citation: { required: true, status: 'missing' } });
    expect(decide([c], policy({ require_citations: true })).findings[0]).toMatchObject({ rule: 'XYN-004', kind: 'missing_citation', decision: 'block' });
    expect(decide([claim({ citation: { required: true, status: 'mismatch' } })], policy({ require_citations: true })).findings[0].kind).toBe('wrong_citation');
    expect(decide([claim({ materiality: 'low', citation: { required: true, status: 'missing' } })], policy({ require_citations: true })).decision).toBe('warn');
  });

  it('a model-dependent block-level finding warns by default, and says why', () => {
    const r = decide([contradicted('critical', false)]);
    expect(r.decision).toBe('warn');
    expect(r.findings[0].downgraded).toMatch(/model judgement/);
    expect(decide([contradicted('critical', false)], policy({ model_findings: 'block' })).decision).toBe('block');
  });

  it('thresholds tolerate up to N per materiality', () => {
    const p = policy({ max_contradicted: { critical: 0, high: 1, medium: 0 } });
    expect(decide([contradicted('high')], p).decision).toBe('warn');
    expect(decide([contradicted('high'), { ...contradicted('high'), index: 1 }], p).decision).toBe('block');
  });

  it('a missing expected claim warns by default (answers are reworded); block when configured', () => {
    const missing = claim({ origin: 'expected', present_in_answer: false, verdict: null, failure_reason: 'expected_claim_missing', support_assessment: 'unresolved' });
    expect(decide([missing]).findings[0]).toMatchObject({ rule: 'XYN-003', kind: 'expected_claim_missing', decision: 'warn', deterministic: true });
    expect(decide([missing], policy({ missing_expected_claim: 'block' })).decision).toBe('block');
  });

  it('min_material_supported_ratio blocks below the ratio', () => {
    const r = decide([claim(), unverifiable('high'), unverifiable('high', 'out_of_scope')], policy({ min_material_supported_ratio: 0.5 }));
    expect(r.findings.some((f) => f.kind === 'material_supported_ratio' && f.decision === 'block')).toBe(true);
  });

  it('hosted mode holds when too many material claims the verifier tried stayed unresolved; local mode does not', () => {
    const tried = (i: number) => claim({ index: i, verdict: 'unverifiable', failure_reason: 'model_abstained', resolved_by: 'model', deterministic: false, support_assessment: 'unresolved' });
    expect(decide([tried(0), tried(1), claim({ index: 2 })], policy(), 'hosted').decision).toBe('hold');
    expect(decide([tried(0), tried(1), claim({ index: 2 })], policy(), 'local').decision).toBe('warn');
  });

  it('0.2.0: a claim the verifier classified (comparative, out of scope, conflicting sources) is XYN-005, not an undecided check', () => {
    for (const reason of ['comparative', 'out_of_scope', 'conflicting_sources']) {
      const classified = claim({ verdict: 'unverifiable', failure_reason: reason, resolved_by: 'model', deterministic: false, support_assessment: 'unresolved' });
      const r = decide([classified], policy(), 'hosted');
      expect(r.decision, reason).toBe('warn');
      expect(r.findings.map((f) => f.rule)).toEqual(['XYN-005']);
    }
  });

  it('0.2.0: a wrong citation is judged only on a decided claim, and only as surely as that decision', () => {
    const p = policy({ require_citations: true });
    const cite = (over: Partial<GateClaim>) => claim({ citation: { required: true, status: 'mismatch' }, ...over });
    // Code could not settle the claim: whether [S2] supports it is unknown, so no XYN-004.
    const unresolved = decide([cite({ verdict: 'unverifiable', failure_reason: 'not_adjudicated', deterministic: false, support_assessment: 'unresolved' })], p);
    expect(unresolved.findings.map((f) => f.rule)).toEqual(['XYN-005']);
    // Code-decided support from another source than the one cited: deterministic, blocks.
    expect(decide([cite({})], p).findings[0]).toMatchObject({ rule: 'XYN-004', kind: 'wrong_citation', deterministic: true, decision: 'block' });
    // A model decided it: the citation finding carries the model's uncertainty (warn by default).
    const byModel = decide([cite({ resolved_by: 'model', deterministic: false })], p).findings.find((f) => f.rule === 'XYN-004');
    expect(byModel).toMatchObject({ deterministic: false, decision: 'warn' });
    // A missing marker is read off the answer: deterministic whatever the verdict.
    expect(decide([claim({ verdict: 'unverifiable', failure_reason: 'not_adjudicated', deterministic: false, citation: { required: true, status: 'missing' } })], p).findings.find((f) => f.rule === 'XYN-004')).toMatchObject({ deterministic: true, decision: 'block' });
  });
});

describe('precedence and integrity', () => {
  it('hold > block > warn > pass', () => {
    expect(worst(['pass', 'warn'])).toBe('warn');
    expect(worst(['warn', 'block', 'pass'])).toBe('block');
    expect(worst(['block', 'hold'])).toBe('hold');
    expect(worst([])).toBe('pass');
  });

  it('an integrity issue holds the case even when every claim passes, and lists the block findings too', () => {
    const contradictedClaim = claim({ verdict: 'contradicted', failure_reason: 'date_mismatch', support_assessment: 'contradicted' });
    const r = evaluateCase({ claims: [claim(), { ...contradictedClaim, index: 1 }], integrity: [{ kind: 'source_hash_mismatch', detail: 'policies/refunds.md', source_id: 'refunds' }], policy: policy(), mode: 'local' });
    expect(r.decision).toBe('hold');
    expect(r.findings.map((f) => f.decision).sort()).toEqual(['block', 'hold']);
    expect(r.reasons[0]).toMatch(/^hold: a source file no longer matches its recorded sha256/);
  });

  it('is deterministic: identical input gives identical output, and findings are sorted', () => {
    const cs = [claim({ index: 2, verdict: 'unverifiable', failure_reason: 'comparative', support_assessment: 'unresolved' }), claim({ index: 1, verdict: 'contradicted', failure_reason: 'negation', support_assessment: 'contradicted' })];
    const a = decide(cs);
    const b = decide([...cs].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.findings.map((f) => f.claim_index)).toEqual([1, 2]);
  });
});

describe('run outcome', () => {
  const none = { override: null } as const;
  it('report_only never fails the job; a block concludes neutral and says it would block', () => {
    expect(runOutcome('block', { enforcement: 'report_only', fail_on: ['block', 'hold'], ...none })).toEqual({ decision: 'block', exit_code: 0, conclusion: 'neutral', title: 'report-only: would block' });
    expect(runOutcome('hold', { enforcement: 'report_only', fail_on: ['block', 'hold'], ...none }).exit_code).toBe(0);
  });

  it('enforce: exit 1 on block; on hold only when fail-on includes hold; hold is never success', () => {
    expect(runOutcome('block', { enforcement: 'enforce', fail_on: ['block'], ...none })).toMatchObject({ exit_code: 1, conclusion: 'failure' });
    expect(runOutcome('hold', { enforcement: 'enforce', fail_on: ['block'], ...none })).toMatchObject({ exit_code: 0, conclusion: 'neutral' });
    expect(runOutcome('hold', { enforcement: 'enforce', fail_on: ['block', 'hold'], ...none })).toMatchObject({ exit_code: 1, conclusion: 'failure' });
    expect(runOutcome('warn', { enforcement: 'enforce', fail_on: ['block'], ...none })).toMatchObject({ exit_code: 0, conclusion: 'success' });
    expect(runOutcome('pass', { enforcement: 'enforce', fail_on: ['block'], ...none })).toMatchObject({ exit_code: 0, conclusion: 'success' });
  });

  it('an overridden block concludes neutral, "Overridden by <actor>"', () => {
    const override = { actor: 'octocat', reason: 'source update is scheduled for Monday', timestamp: '2026-10-18T00:00:00Z', overridden_claims: [] };
    expect(runOutcome('block', { enforcement: 'enforce', fail_on: ['block'], override })).toEqual({ decision: 'block', exit_code: 0, conclusion: 'neutral', title: 'Overridden by octocat' });
  });
});

describe('overrides', () => {
  const base = {
    decision: 'block' as const,
    policy: DEFAULT_POLICY,
    label_applied_by: 'maintainer',
    label_applier_permission: 'write' as const,
    comment_author: 'maintainer',
    comment_author_permission: 'maintain' as const,
    reason: 'pricing page update ships tomorrow',
    author_teams: [],
  };
  it('accepts a label by a writer plus a reasoned /verify-override comment', () => {
    expect(checkOverride(base)).toEqual({ ok: true });
  });
  it('refuses a hold, a disabled override, a non-writer, a missing reason, and a missing team', () => {
    expect(checkOverride({ ...base, decision: 'hold' })).toMatchObject({ ok: false, error: expect.stringMatching(/hold cannot be overridden/) });
    expect(checkOverride({ ...base, policy: { ...DEFAULT_POLICY, overrides: { ...DEFAULT_POLICY.overrides, enabled: false } } }).ok).toBe(false);
    expect(checkOverride({ ...base, label_applier_permission: 'triage' }).ok).toBe(false);
    expect(checkOverride({ ...base, comment_author_permission: 'read' }).ok).toBe(false);
    expect(checkOverride({ ...base, reason: 'ok' }).ok).toBe(false);
    expect(checkOverride({ ...base, policy: { ...DEFAULT_POLICY, overrides: { ...DEFAULT_POLICY.overrides, require_team: 'acme/release' } } }).ok).toBe(false);
    expect(checkOverride({ ...base, author_teams: ['acme/release'], policy: { ...DEFAULT_POLICY, overrides: { ...DEFAULT_POLICY.overrides, require_team: 'acme/release' } } }).ok).toBe(true);
  });
  it('parses "/verify-override <reason>"', () => {
    expect(parseOverrideComment('LGTM\n/verify-override  source update scheduled  \nthanks')).toBe('source update scheduled');
    expect(parseOverrideComment('please /verify-override this')).toBeNull();
  });
});

describe('policy validation', () => {
  it('starts report-only with the precision-first defaults', () => {
    const { policy: p, errors } = resolvePolicy(undefined);
    expect(errors).toEqual([]);
    expect(p).toMatchObject({ enforcement: 'report_only', model_findings: 'warn', treat_unverifiable_as: 'warn', missing_expected_claim: 'warn', fail_on_material_qualifier_loss: true });
    expect(p.max_contradicted).toEqual({ critical: 0, high: 0, medium: 0 });
    expect(p.max_unsupported).toEqual({ critical: 0, high: 0 });
  });
  it('rejects unknown keys and bad values instead of silently loosening the policy', () => {
    const { errors } = resolvePolicy({ max_contradicted: { critcal: 0, high: -1 }, enforce: true, treat_unverifiable_as: 'ignore', min_material_supported_ratio: 2 });
    expect(errors).toEqual(
      expect.arrayContaining([
        'policy.enforce is not a known setting',
        expect.stringMatching(/max_contradicted.critcal/),
        expect.stringMatching(/max_contradicted.high must be a non-negative integer/),
        expect.stringMatching(/treat_unverifiable_as must be one of/),
        expect.stringMatching(/min_material_supported_ratio/),
      ]),
    );
  });
});
