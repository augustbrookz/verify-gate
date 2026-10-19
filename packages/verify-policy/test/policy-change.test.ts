import { describe, expect, it } from 'vitest';
import { FRESHNESS_BANNED_WORDS } from '@xyntherium/verify-core';
import { documentParityHash } from '@xyntherium/verify-parity';
import { ASSURANCE_SCOPE, assessPolicyChange, conditionPhrases, policyChangeTitle, renderPolicyChange, sentenceDiff, type ChangedSourceInput, type DocumentTestInput } from '../src/index';

const AT = '2026-10-18T12:00:00.000Z';
const OLD = 'Annual plans can be cancelled for a full refund within 30 days of purchase. Monthly plans are not refundable, but you can cancel at any time and keep access until the end of the billing period. Refunds are issued to the original payment method within 5 business days of approval.';
const NEW = OLD.replace('within 30 days of purchase', 'within 14 days of purchase').replace('within 5 business days of approval.', 'within 5 business days of approval (annual plans only).');

const test = (id: string, answer: string | null, conds: DocumentTestInput['required_conditions'], source_ids = ['refunds']): DocumentTestInput => ({ id, kind: 'test', location: { path: 'verify-gate.yml', line: 1 }, question: `${id}?`, answer, expected: [], source_ids, required_conditions: conds });
const TESTS: DocumentTestInput[] = [
  test('annual-refund-window', 'Annual plans can be cancelled for a full refund within 30 days of purchase.', [{ class: 'deadline', text: 'within 30 days of purchase' }]),
  test('refund-payment-method', 'Refunds are issued to the original payment method within 5 business days of approval.', [{ class: 'deadline', text: 'within 5 business days of approval' }]),
  test('monthly-not-refundable', 'Monthly plans are not refundable, but you can cancel at any time and keep access until the end of the billing period.', [{ class: 'negation', text: 'not refundable' }]),
  test('phone-support', 'Phone support is available only on the Business plan.', [{ class: 'scope', text: 'only on the Business plan' }], ['plans']),
];
const changed = (after: string | null, o: Partial<ChangedSourceInput> = {}): ChangedSourceInput => ({ id: 'refunds', path: 'kb/refunds.md', before: OLD, after, versioned: true, version_before: '2026-10', version_after: '2026-11', effective_date_after: '2026-11-01', supersedes: ['refunds@2026-10'], ...o });
const current = (refunds: string | null) => [...(refunds === null ? [] : [{ id: 'refunds', text: refunds }]), { id: 'plans', text: 'Phone support is available only on the Business plan.' }];
const assess = (c: ChangedSourceInput, o: Partial<Parameters<typeof assessPolicyChange>[0]> = {}) => assessPolicyChange({ captured_at: AT, changed: [c], tests: TESTS, current: current(c.after), enforcement: 'report_only', include_text: true, ...o });

describe('document change mode', () => {
  it('30 → 14 days and an added "annual plans only": two answers need review, before → after, lost and newly required conditions', async () => {
    const r = await assess(changed(NEW));
    expect(r.title).toBe('Policy changed: 2 answers need review');
    expect(r.tests.map((t) => t.id)).toEqual(['annual-refund-window', 'refund-payment-method', 'monthly-not-refundable']); // only tests linked to the change
    const [annual, payment, monthly] = r.tests;

    expect(annual).toMatchObject({ verdict_before: 'supported', verdict_after: 'contradicted', before_from: 'recomputed', decision: 'block', reported: 'warn' });
    expect(annual.conditions).toEqual([expect.objectContaining({ class: 'deadline', status: 'lost', text: 'within 30 days of purchase', now: 'within 14 days of purchase', in_answer: true })]);
    expect(annual.superseded).toMatchObject({ version: '2026-10', newer_version: '2026-11' });
    expect(annual.diff).toEqual([{ source_id: 'refunds', before: expect.stringContaining('30 days'), after: expect.stringContaining('14 days') }]);

    expect(payment).toMatchObject({ decision: 'block', reported: 'warn' });
    expect(payment.conditions.map((c) => [c.status, c.class, c.text, c.in_answer])).toEqual([
      ['kept', 'deadline', 'within 5 business days of approval', true],
      ['newly_required', 'scope', 'annual plans only', false],
    ]);

    expect(monthly).toMatchObject({ verdict_before: 'supported', verdict_after: 'supported', decision: 'pass', reasons: ['still supported; the change is recorded'] });
    expect(r.conclusion).toBe('neutral'); // report-only
  });

  it('hold: a changed source that is unreadable or has no version is never a silent pass', async () => {
    const gone = await assess(changed(null));
    expect(gone.tests.every((t) => t.decision === 'hold')).toBe(true);
    const unversioned = await assess(changed(NEW, { versioned: false, version_after: null }));
    expect(unversioned.tests.every((t) => t.decision === 'hold' && t.reasons.some((x) => /no version/.test(x)))).toBe(true);
    expect(renderPolicyChange(unversioned)).toMatch(/no version in verify-gate.yml/);
  });

  it('human review: the saved answer matched the old version and the new one no longer settles it, with no condition lost', async () => {
    const reworded = OLD.replace('Monthly plans are not refundable, but you can cancel at any time and keep access until the end of the billing period.', 'Monthly subscriptions cannot be refunded; cancelling ends access when the billing period ends.');
    const r = await assessPolicyChange({ captured_at: AT, changed: [changed(reworded, { supersedes: [] })], tests: [test('monthly', 'Monthly plans are not refundable, but you can cancel at any time and keep access until the end of the billing period.', [])], current: current(reworded), enforcement: 'report_only', include_text: true });
    expect(r.tests[0]).toMatchObject({ verdict_before: 'supported', decision: 'human_review' });
    expect(r.tests[0].conditions.map((c) => [c.status, c.class])).toEqual([
      ['changed', 'negation'],
      ['changed', 'deadline'],
    ]);
    expect(r.tests[0].verdict_after).not.toBe('supported');
    expect(r.tests[0].reasons[0]).toMatch(/nothing declares that it replaces the old one/);
  });

  it('uses the previous run’s verdict for the base version when it has one', async () => {
    const r = await assess(changed(NEW), { previous: (id) => (id === 'monthly-not-refundable' ? { verdict: 'supported', sources: { refunds: documentParityHash(OLD, AT) } } : null) });
    expect(r.tests.find((t) => t.id === 'monthly-not-refundable')!.before_from).toBe('previous_run');
    expect(r.tests.find((t) => t.id === 'annual-refund-window')!.before_from).toBe('recomputed');
    const noBase = await assess(changed(NEW, { before: null }));
    expect(noBase.tests[0]).toMatchObject({ before_from: 'unavailable', verdict_before: null, decision: 'block' });
  });

  it('enforce fails on block or hold; nothing to review and no unprotected change is success', async () => {
    expect((await assess(changed(NEW), { enforcement: 'enforce' })).conclusion).toBe('failure');
    const harmless = OLD.replace('original payment method', 'original payment method used');
    const ok = await assess(changed(harmless), { enforcement: 'enforce' });
    expect(ok.tests.find((t) => t.id === 'monthly-not-refundable')!.decision).toBe('pass');
    const none = await assessPolicyChange({ captured_at: AT, changed: [], tests: TESTS, current: current(OLD), enforcement: 'enforce', include_text: false });
    expect(none).toMatchObject({ needs_review: 0, conclusion: 'success', title: 'Policy changed: 0 answers need review' });
    const unprotectedOnly = await assessPolicyChange({ captured_at: AT, changed: [], tests: TESTS, current: current(OLD), unprotected: [{ path: 'kb/promotions.md', source_id: null, reason: 'not_a_source' }], enforcement: 'report_only', include_text: false });
    expect(unprotectedOnly.conclusion).toBe('neutral');
    expect(renderPolicyChange(unprotectedOnly)).toContain('**Unprotected source change:** `kb/promotions.md` changed and is not listed under `sources`');
  });

  it('stores no text without include_text; the Markdown carries the table, the scope, and no standing words', async () => {
    const bare = await assess(changed(NEW), { include_text: false });
    expect(JSON.stringify(bare)).not.toMatch(/14 days|annual plans only|Annual plans can/);
    const md = renderPolicyChange(await assess(changed(NEW)));
    expect(md).toContain('| Test | Verdict before → after | Conditions | Decision | Source change |');
    expect(md).toContain('| `annual-refund-window` | supported → contradicted | ❌ lost deadline "within 30 days of purchase" (now: "within 14 days of purchase")');
    expect(md).toContain('➕ newly required scope "annual plans only", missing from the answer');
    expect(md).toContain('⚠️ warn (would block)');
    expect(md).toContain(ASSURANCE_SCOPE);
    for (const w of FRESHNESS_BANNED_WORDS) expect(md.toLowerCase(), w).not.toMatch(new RegExp(`\\b${w}\\b`));
    expect(policyChangeTitle(1)).toBe('Policy changed: 1 answer needs review');
  });

  it('is deterministic', async () => {
    expect(JSON.stringify(await assess(changed(NEW)))).toBe(JSON.stringify(await assess(changed(NEW))));
  });
});

describe('condition phrases and the sentence diff', () => {
  it('classes conditions into the seven classes, widening a bare "only"', () => {
    expect(conditionPhrases('Refunds are issued within 5 business days of approval (annual plans only).')).toEqual([
      { class: 'deadline', text: 'within 5 business days of approval' },
      { class: 'scope', text: 'annual plans only' },
    ]);
    expect(conditionPhrases('Refunds are issued within 5 days, except for gift cards.').map((c) => c.class)).toEqual(['deadline', 'exception']);
    expect(conditionPhrases('For EU customers, refunds must be requested within 14 days.').map((c) => c.class)).toEqual(['scope', 'modality', 'deadline']);
    expect(conditionPhrases('Monthly plans are not refundable.').map((c) => c.class)).toEqual(['negation']);
  });

  it('aligns changed sentences and reports pure adds and removes', () => {
    const a = 'Orders ship within two business days. Returns are accepted within 30 days of delivery. Gift cards are not refundable.';
    const b = 'Orders ship within two business days. Returns are accepted within 14 days of delivery for unused items. Store credit is issued for late returns.';
    expect(sentenceDiff(a, b)).toEqual([
      { before: 'Returns are accepted within 30 days of delivery.', after: 'Returns are accepted within 14 days of delivery for unused items.' },
      { before: 'Gift cards are not refundable.', after: null },
      { before: null, after: 'Store credit is issued for late returns.' },
    ]);
    expect(sentenceDiff(OLD, OLD)).toEqual([]);
  });
});

describe('document change mode with verify-parity', () => {
  it('names the real change: the deadline that changed and the scope that was added; records it for the ledger', async () => {
    const r = await assess(changed(NEW));
    const c = r.changed_sources[0].change!;
    expect(c.kind).toBe('real');
    expect(c.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'condition_changed', class: 'deadline', before: 'within 30 days of purchase', after: 'within 14 days of purchase' }),
        expect.objectContaining({ type: 'condition_added', class: 'scope', after: 'annual plans only' }),
      ]),
    );
    expect(r.parity_records).toEqual([expect.objectContaining({ record_type: 'source_change', source_id: 'refunds', kind: 'real' })]);
    expect(renderPolicyChange(r)).toContain('Parity: real change (deadline changed: "within 30 days of purchase" → "within 14 days of purchase"');
  });

  it('a cosmetic edit (spacing, quotes, "shall" for "must", a spelled number) is classified cosmetic and changes no decision', async () => {
    const cosmetic = OLD.replace('within 30 days of purchase', 'within  thirty (30) days of purchase').replace('Monthly plans are not refundable', 'Monthly plans are not\nrefundable').replace(/\. /g, '.  ');
    const r = await assess(changed(cosmetic));
    expect(r.changed_sources[0].change!.kind).toBe('cosmetic');
    expect(r.changed_sources[0].change!.changes).toEqual([]);
    expect(r.tests.every((t) => t.decision === 'pass')).toBe(true);
    expect(renderPolicyChange(r)).toContain('Parity: cosmetic only');
  });

  it('a cosmetic edit that code reads differently still passes, and says so (no superseded-version note)', async () => {
    const PLANS = 'The Business plan costs $59 per agent per month when billed annually. Every plan includes unlimited tickets. Phone support is available only on the Business plan, Monday through Friday from 8 a.m. to 6 p.m. Eastern Time.';
    const after = PLANS.replace('unlimited tickets. Phone', 'unlimited tickets.\nPhone').replace('Eastern Time.', 'Eastern time.');
    const phone = test('phone-support-scope', 'Phone support is available only on the Business plan, Monday through Friday from 8 a.m. to 6 p.m. Eastern Time.', [{ class: 'scope', text: 'only on the Business plan' }], ['plans']);
    const c = changed(after, { id: 'plans', path: 'kb/plans.md', before: PLANS, supersedes: ['plans@2026-10'] });
    const r = await assessPolicyChange({ captured_at: AT, changed: [c], tests: [phone], current: [{ id: 'plans', text: after }], enforcement: 'report_only', include_text: true });
    expect(r.changed_sources[0].change!.kind).toBe('cosmetic');
    const t = r.tests[0];
    expect(t).toMatchObject({ decision: 'pass', verdict_before: 'supported', verdict_after: 'unverifiable', cosmetic_source_change: true, superseded: null });
    expect(t.reasons[0]).toMatch(/the source change is cosmetic/);
    const md = renderPolicyChange(r);
    expect(md).toContain('Cosmetic source change only (verify-parity): code reads the new wording as unverifiable');
    expect(md).not.toContain('Still matches the superseded version');
  });

  it('triage: the previous run disagrees and saw a different snapshot → infrastructure fault, REEVAL, the re-evaluation is used', async () => {
    const r = await assess(changed(NEW), { previous: (id) => (id === 'monthly-not-refundable' ? { verdict: 'contradicted', sources: { refunds: 'f'.repeat(64) } } : null) });
    const t = r.tests.find((x) => x.id === 'monthly-not-refundable')!;
    expect(t).toMatchObject({ before_from: 'recomputed', verdict_before: 'supported', decision: 'pass', triage: { kind: 'infrastructure_fault', route: 'REEVAL' } });
    expect(r.parity_records).toContainEqual(expect.objectContaining({ record_type: 'disagreement_triage', subject: 'monthly-not-refundable', kind: 'infrastructure_fault', route: 'REEVAL', mismatched_sources: ['refunds'] }));
  });

  it('triage: same snapshot, different verdicts → a genuine disagreement, routed per policy (human review)', async () => {
    const r = await assess(changed(NEW), { previous: (id) => (id === 'monthly-not-refundable' ? { verdict: 'contradicted', sources: { refunds: documentParityHash(OLD, AT) } } : null) });
    const t = r.tests.find((x) => x.id === 'monthly-not-refundable')!;
    expect(t).toMatchObject({ before_from: 'previous_run', decision: 'human_review', triage: { kind: 'genuine_disagreement', route: 'human_review' } });
    expect(t.reasons.join(' ')).toMatch(/disagree on the same source snapshots/);
  });

  it('an unprotected file changed only cosmetically is noted, not warned', async () => {
    const r = await assessPolicyChange({ captured_at: AT, changed: [], tests: TESTS, current: current(OLD), unprotected: [{ path: 'kb/promotions.md', source_id: null, reason: 'not_a_source', change_kind: 'cosmetic' }], enforcement: 'report_only', include_text: false });
    expect(r.conclusion).toBe('success');
    const md = renderPolicyChange(r);
    expect(md).toContain('changed cosmetically');
    expect(md).not.toContain('Unprotected source change');
  });
});
