/**
 * Regression tests for RULES_VERSION 1.1.0 (see rules-changelog.json).
 * Each fix was found on the verify-bench v1.1 DEV split; every test pins the
 * fixed behaviour and a control that must not change.
 */
import { describe, expect, it } from 'vitest';
import { locateQuote, normalizeWithMap, runEngine, spanIsExact, templateMatches } from '../src/index';

const verdictOf = async (answer: string, text: string) => {
  const r = await runEngine({ question: 'q', answer, sources: [{ id: 'S1', text }] });
  return r.claims[0];
};

describe('NFKC in span matching (offset-preserving)', () => {
  it('matches ligatures and full-width characters, returning exact original offsets', () => {
    const source = 'The ﬁnal ﬁling fee is ＄１２０ for ﬁrst-time applicants.';
    const r = locateQuote(source, 'The final filing fee is $120 for first-time applicants');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.span.match_type).toBe('normalized');
    expect(spanIsExact(source, r.span)).toBe(true);
    expect(r.span.quote).toBe('The ﬁnal ﬁling fee is ＄１２０ for ﬁrst-time applicants');
  });

  it('keeps combining sequences whole, so the end offset never cuts a mark off', () => {
    const source = 'Le café ferme à midi le dimanche.';
    const r = locateQuote(source, 'Le café ferme à midi le dimanche');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(source.slice(r.span.start, r.span.end)).toBe('Le café ferme à midi le dimanche');
  });

  it('never folds characters whose compatibility form changes a number', () => {
    expect(locateQuote('The limit is 10² requests per user.', 'The limit is 102 requests per user').ok).toBe(false);
    expect(locateQuote('Fill the tank ½ full before returning it.', 'Fill the tank 12 full before returning it').ok).toBe(false);
    expect(locateQuote('Step ① must be completed by the applicant.', 'Step 1 must be completed by the applicant').ok).toBe(false);
  });

  it('records an exclusive end for every normalised character', () => {
    const n = normalizeWithMap('áﬁ…');
    expect(n.text).toBe('áfi...');
    expect(n.map).toEqual([0, 2, 2, 3, 3, 3]);
    expect(n.ends).toEqual([2, 3, 3, 4, 4, 4]);
  });
});

describe('deadlines and conditions around a verbatim span', () => {
  const cases: [string, string, string][] = [
    [
      '"not later than" after the span',
      'The creditor shall deliver the good faith estimates.',
      'The creditor shall deliver the good faith estimates not later than the seventh business day before consummation of the transaction.',
    ],
    [
      'a time window after a comma',
      'The creditor shall comply with the resolution procedures, as applicable.',
      'The creditor shall comply with the resolution procedures, as applicable, within 2 complete billing cycles after receiving a billing error notice.',
    ],
    [
      'a deadline with no parsed date',
      'You must submit the information once a year.',
      'You must submit the information once a year, no later than the date listed in paragraph (c) of this section.',
    ],
    [
      'a leading condition whose words recur in the claim',
      'You must certify the octane rating of each gasoline in the blend.',
      'If you blend the gasoline with other gasoline, you must certify the octane rating of each gasoline in the blend.',
    ],
    [
      'a span that stops on a dangling conjunction',
      'The plan administrator shall notify the claimant as soon as possible, but.',
      'The plan administrator shall notify the claimant as soon as possible, but not later than 24 hours after receipt of the claim by the plan.',
    ],
  ];
  for (const [name, answer, source] of cases) {
    it(`drops ${name}: qualifier loss, decided in code`, async () => {
      const c = await verdictOf(answer, source);
      expect(c.verdict).toBe('unsupported');
      expect(c.failure_reason).toBe('qualifier_loss');
      expect(c.resolved_by).toBe('code');
    });
  }

  it('control: the full sentence, qualifier included, stays supported', async () => {
    const c = await verdictOf(
      'The creditor shall deliver the good faith estimates not later than the seventh business day before consummation of the transaction.',
      'The creditor shall deliver the good faith estimates not later than the seventh business day before consummation of the transaction.',
    );
    expect(c.verdict).toBe('supported');
  });

  it('control: a comma clause that is not a time window is not a qualifier', async () => {
    const c = await verdictOf('Refunds are issued to the original card.', 'Refunds are issued to the original card, by which we mean the card used at checkout.');
    expect(c.verdict).toBe('supported');
  });
});

describe('modality (R-TEMPLATE-MODALITY)', () => {
  const src = 'Refunds may be issued within 30 days of the cancellation date for annual plans.';

  it('"may" → "will": unsupported, qualifier_loss, the modality row conflicting', async () => {
    const c = await verdictOf('Refunds will be issued within 30 days of the cancellation date for annual plans.', src);
    expect(c.verdict).toBe('unsupported');
    expect(c.failure_reason).toBe('qualifier_loss');
    expect(c.provenance.rule_id).toBe('R-TEMPLATE-MODALITY');
    expect(c.resolved_by).toBe('code');
    const row = c.provenance.qualifiers.find((q) => q.type === 'modality')!;
    expect(row).toMatchObject({ claim_text: 'will', source_text: 'may', status: 'contradicted', material: true });
  });

  it('"may" → "must" and "should" → "must" are overstatements too', async () => {
    expect((await verdictOf('Refunds must be issued within 30 days of the cancellation date for annual plans.', src)).provenance.rule_id).toBe('R-TEMPLATE-MODALITY');
    const c = await verdictOf('Members must renew their badge every year at the front desk.', 'Members should renew their badge every year at the front desk.');
    expect(c.provenance.rule_id).toBe('R-TEMPLATE-MODALITY');
  });

  it('a softer claim than its source is left for adjudication, never decided by code', async () => {
    const c = await verdictOf('Refunds may be issued within 30 days of the cancellation date for annual plans.', 'Refunds will be issued within 30 days of the cancellation date for annual plans.');
    expect(c.verdict).toBe('unverifiable');
    expect(c.failure_reason).toBe('not_adjudicated');
  });

  it('control: the same modal is verbatim support', async () => {
    expect((await verdictOf('Refunds may be issued within 30 days of the cancellation date for annual plans.', src)).verdict).toBe('supported');
  });

  it('a changed number outranks a modal change: contradicted', async () => {
    const c = await verdictOf('Refunds will be issued within 60 days of the cancellation date for annual plans.', src);
    expect(c.verdict).toBe('contradicted');
    expect(c.failure_reason).toBe('number_mismatch');
  });

  it('template alignment masks modals and reports the overstatement', () => {
    const m = templateMatches('Refunds will be issued within 30 days of the cancellation date.', [{ id: 'S1', text: 'Refunds may be issued within 30 days of the cancellation date.' }]);
    expect(m[0].conflicts.map((c) => c.kind)).toEqual(['modality']);
  });
});
