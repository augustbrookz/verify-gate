/**
 * The rules-next backlog (packages/verify-core/rules-next/backlog.json) lists candidate
 * rule changes. Each fixture is pinned here at the CURRENT behaviour: when a rule change
 * alters it, this test fails and the entry must be released through the changelog
 * (version bump, held-out before / after) and its pin updated.
 */
import { describe, expect, it } from 'vitest';
import backlog from '../rules-next/backlog.json';
import { extractQualifiers, runEngine } from '../src/index';

interface Entry {
  id: string;
  fixture: { question: string; answer: string; sources: { id: string; text: string }[]; mode: 'code_only' } | { mode: 'extract_qualifiers'; text: string };
  current: { verdict: string; failure_reason: string | null; rule_id: string } | { condition_texts: string[] };
}

describe('rules-next backlog: fixtures pinned at current behaviour', () => {
  for (const e of (backlog as { entries: Entry[] }).entries) {
    it(`${e.id} behaves as recorded`, async () => {
      if (e.fixture.mode === 'extract_qualifiers') {
        expect(extractQualifiers(e.fixture.text).filter((q) => q.type === 'condition').map((q) => q.text)).toEqual((e.current as { condition_texts: string[] }).condition_texts);
        return;
      }
      const r = await runEngine({ question: e.fixture.question, answer: e.fixture.answer, sources: e.fixture.sources });
      expect(r.claims).toHaveLength(1);
      expect({ verdict: r.claims[0].verdict, failure_reason: r.claims[0].failure_reason, rule_id: r.claims[0].provenance.rule_id }).toEqual(e.current);
    });
  }

  it('RN-001 control: the unedited source is supported verbatim', async () => {
    const e = (backlog as { entries: Entry[] }).entries.find((x) => x.id === 'RN-001-case-only-proper-noun')!;
    const f = e.fixture as { question: string; answer: string };
    const r = await runEngine({ question: f.question, answer: f.answer, sources: [{ id: 'plans', text: f.answer }] });
    expect(r.claims[0]).toMatchObject({ verdict: 'supported', provenance: { rule_id: 'R-VERBATIM-SUPPORTED' } });
  });
});
