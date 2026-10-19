import { describe, expect, it } from 'vitest';
import { detectSourceChange, documentParityHash, type NamedChange } from '../src/index';

const AT = '2026-10-18T00:00:00.000Z';
const POLICY = `# Refunds

Annual plans can be cancelled for a full refund within 30 days of purchase, unless the plan was bought on sale. Monthly plans are not refundable.
The seller shall issue refunds to the original payment method within 5 business days of approval (see § 4.2).

Eligible items:
(a) unopened hardware;
(b) software licences, except licences already activated; and
(c) gift cards purchased after May 1, 2026.`;

const detect = (after: string, before = POLICY) => detectSourceChange({ before, after, captured_at: AT, include_text: true });
const types = (cs: NamedChange[]) => cs.map((c) => `${c.type}${c.class ? `:${c.class}` : ''}`);

describe('detectSourceChange', () => {
  it('identical text: none', () => {
    const r = detect(POLICY);
    expect(r.kind).toBe('none');
    expect(r.before_parity_sha256).toBe(r.after_parity_sha256);
    expect(r.before_text_sha256).toBe(r.after_text_sha256);
  });

  it('formatting and drafting edits are cosmetic: no change named, parity hash unchanged', () => {
    const edited = POLICY.replace('within 30 days', 'within thirty (30) days')
      .replace('shall issue', 'must issue')
      .replace('§ 4.2', 'section 4.2')
      .replace('Monthly plans are not refundable.', 'Monthly plans are\nnot refundable.')
      .replace('original payment', 'original   payment')
      .replace('purchase, unless', 'purchase, unless');
    const r = detect(edited);
    expect(r.kind).toBe('cosmetic');
    expect(r.changes).toEqual([]);
    expect(r.counts.real + r.counts.added + r.counts.removed).toBe(0);
    expect(r.before_text_sha256).not.toBe(r.after_text_sha256);
    expect(documentParityHash(edited, AT)).toBe(documentParityHash(POLICY, AT));
  });

  it('names a changed period with its words', () => {
    const r = detect(POLICY.replace('within 30 days of purchase', 'within 14 days of purchase'));
    expect(r.kind).toBe('real');
    expect(r.changes).toContainEqual({ type: 'condition_changed', class: 'deadline', before: 'within 30 days of purchase', after: 'within 14 days of purchase' });
  });

  it('names a removed exception, a negation and a modal', () => {
    expect(detect(POLICY.replace(', unless the plan was bought on sale', '')).changes).toContainEqual(expect.objectContaining({ type: 'condition_removed', class: 'exception' }));
    expect(types(detect(POLICY.replace('are not refundable', 'are refundable')).changes)).toContain('negation_changed:negation');
    expect(detect(POLICY.replace('shall issue', 'may issue')).changes).toContainEqual({ type: 'modality_changed', class: 'modality', before: 'obligation', after: 'permission' });
  });

  it('names an amount, a citation and a date as written', () => {
    const r = detect(POLICY.replace('5 business days', '10 business days').replace('§ 4.2', '§ 4.3').replace('May 1, 2026', 'June 1, 2026'));
    expect(r.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: 'deadline', before: 'within 5 business days of approval', after: 'within 10 business days of approval' }),
        { type: 'citation_changed', class: null, before: '§ 4.2', after: '§ 4.3' },
      ]),
    );
    expect(r.changes.some((c) => (c.before ?? '').includes('May 1, 2026') && (c.after ?? '').includes('June 1, 2026'))).toBe(true);
  });

  it('compares list items one by one: a removed item is removed, its neighbours unchanged', () => {
    const r = detect(POLICY.replace('(b) software licences, except licences already activated; and\n', ''));
    expect(r.kind).toBe('real');
    expect(r.counts.removed).toBe(1);
    expect(r.counts.real).toBe(0);
    expect(types(r.changes)).toEqual(['condition_removed:exception']);
  });

  it('a one-letter party swap is a real change', () => {
    const r = detect('The employer must notify the employee within 30 days.', 'The employee must notify the employee within 30 days.');
    expect(r.kind).toBe('real');
    expect(types(r.changes)).toEqual(['wording_changed']);
  });

  it('the same words split into sentences differently are cosmetic', () => {
    const r = detect(POLICY.replace('of purchase, unless the plan was bought on sale. Monthly plans', 'of purchase, unless the plan was bought on sale; monthly plans'));
    expect(r.kind).toBe('cosmetic');
  });

  it('added and removed sentences', () => {
    const r = detect(`${POLICY}\nGift cards cannot be refunded after 90 days.`);
    expect(r.counts.added).toBe(1);
    expect(r.kind).toBe('real');
    expect(detect(POLICY.replace(' Monthly plans are not refundable.', '')).counts.removed).toBe(1);
  });

  it('texts are left out unless include_text', () => {
    const r = detectSourceChange({ before: POLICY, after: POLICY.replace('30 days', '14 days'), captured_at: AT });
    expect(r.kind).toBe('real');
    expect(JSON.stringify(r)).not.toMatch(/Annual plans|14 days|30 days/);
  });

  it('is deterministic and reads no clock', () => {
    const a = detect(POLICY.replace('30 days', '14 days'));
    const b = detect(POLICY.replace('30 days', '14 days'));
    expect(b).toEqual(a);
  });
});
