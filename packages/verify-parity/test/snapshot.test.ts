import { afterEach, describe, expect, it, vi } from 'vitest';
import { jcs, sha256Hex } from '@xyntherium/verify-core';
import { captureSnapshot, compareSnapshots, ParityInputError, PARITY_VERSION, verifySnapshot, type ParitySchema } from '../src/index';

const SCHEMA: ParitySchema = {
  id: 'refund-policy',
  version: '1',
  fields: [
    { name: 'window_days', mode: 'exact', kind: 'number' },
    { name: 'effective', mode: 'exact', kind: 'date' },
    { name: 'deadline', mode: 'exact', kind: 'deadline' },
    { name: 'conditions', mode: 'exact', kind: 'condition' },
    { name: 'cites', mode: 'exact', kind: 'citation' },
    { name: 'body', mode: 'tolerance' },
    { name: 'retrieved_by', mode: 'excluded' },
  ],
};
const VALUES = {
  window_days: '1,000',
  effective: '2026-11-01',
  deadline: 'within thirty (30) days of purchase',
  conditions: ['exception:unless the item is final sale', { class: 'scope', text: 'annual plans only' }],
  cites: 'See section 3.2 and 16 CFR 310.4(a)',
  body: 'Refunds   are issued “promptly”.',
  retrieved_by: 'crawler-7',
};
const AT = { captured_at: '2026-10-18T00:00:00.000Z' };

afterEach(() => vi.useRealTimers());

describe('captureSnapshot', () => {
  it('is a pure function of its arguments: no clock, same inputs give the same hashes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const now = vi.spyOn(Date, 'now');
    const a = captureSnapshot(SCHEMA, VALUES, AT);
    expect(now).not.toHaveBeenCalled();
    now.mockRestore();
    vi.setSystemTime(new Date('2031-06-01T00:00:00Z'));
    const b = captureSnapshot(SCHEMA, structuredClone(VALUES), AT);
    expect(b).toEqual(a);
    expect(a.captured_at).toBe(AT.captured_at);
  });

  it('digests are SHA-256 of RFC 8785 bytes: parity over exact + tolerance, sha256 over everything', () => {
    const s = captureSnapshot(SCHEMA, VALUES, { ...AT, label: 'v2' });
    const core = { parity_version: PARITY_VERSION, schema: { id: 'refund-policy', version: '1' }, exact: s.exact, tolerance: s.tolerance };
    expect(s.parity_sha256).toBe(sha256Hex(jcs(core)));
    const { sha256: _h, ...body } = s;
    expect(s.sha256).toBe(sha256Hex(jcs(body)));
    expect(s.parity_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicalises exact fields by kind', () => {
    const s = captureSnapshot(SCHEMA, VALUES, AT);
    expect(s.exact.window_days).toBe(1000);
    expect(s.exact.effective).toBe('2026-11-01');
    expect(s.exact.deadline).toEqual(['duration_fixed:2592000:max']);
    expect(s.exact.conditions).toEqual(['exception:unless the item is final sale', 'scope:annual plans only']);
    expect(s.exact.cites).toEqual(['16 cfr 310.4(a)', '§3.2']);
    expect(s.tolerance.body).toBe('refunds are issued promptly');
    expect(s.excluded.retrieved_by).toBe('crawler-7');
  });

  it('refuses unknown fields, missing fields, a missing capture time and bad values', () => {
    expect(() => captureSnapshot(SCHEMA, { ...VALUES, extra: 1 }, AT)).toThrow(ParityInputError);
    const { body: _b, ...missing } = VALUES;
    expect(() => captureSnapshot(SCHEMA, missing, AT)).toThrow(/body is required/);
    expect(() => captureSnapshot(SCHEMA, VALUES, { captured_at: '' })).toThrow(/captured_at is required/);
    expect(() => captureSnapshot(SCHEMA, { ...VALUES, window_days: 'thirty' }, AT)).toThrow(/not a number/);
    expect(() => captureSnapshot(SCHEMA, { ...VALUES, effective: 'soon' }, AT)).toThrow(/no date/);
    expect(captureSnapshot(SCHEMA, { ...VALUES, body: null }, AT).tolerance.body).toBe('');
  });

  it('verifySnapshot detects any alteration', () => {
    const s = captureSnapshot(SCHEMA, VALUES, AT);
    expect(verifySnapshot(s)).toBe(true);
    expect(verifySnapshot({ ...s, exact: { ...s.exact, window_days: 1001 } })).toBe(false);
    expect(verifySnapshot({ ...s, excluded: { retrieved_by: 'someone-else' } })).toBe(false);
    expect(verifySnapshot({ ...s, captured_at: '2026-10-19T00:00:00.000Z' })).toBe(false);
  });
});

describe('field modes in comparison', () => {
  const base = captureSnapshot(SCHEMA, VALUES, AT);
  const cmp = (over: Record<string, unknown>) => compareSnapshots(base, captureSnapshot(SCHEMA, { ...VALUES, ...over }, { captured_at: '2026-10-19T00:00:00.000Z' }), SCHEMA);

  it('excluded fields and the capture time never affect parity', () => {
    const c = cmp({ retrieved_by: 'crawler-9' });
    expect(c.status).toBe('identical');
    expect(c.before_parity_sha256).toBe(c.after_parity_sha256);
    expect(c.fields.find((f) => f.field === 'retrieved_by')?.status).toBe('excluded');
  });

  it('tolerance fields ignore formatting only', () => {
    expect(cmp({ body: 'Refunds are\nissued "promptly."' }).status).toBe('identical');
    const c = cmp({ body: 'Refunds are issued eventually.' });
    expect(c.status).toBe('different');
    expect(c.fields.find((f) => f.field === 'body')).toMatchObject({ status: 'changed', before: 'refunds are issued promptly', after: 'refunds are issued eventually' });
  });

  it('exact fields: the same value written differently is equal, a different value is a change', () => {
    expect(cmp({ window_days: 1000, deadline: 'within 30 days of purchase', cites: 'See § 3.2 and 16 C.F.R. 310.4(a)' }).status).toBe('identical');
    expect(cmp({ window_days: 999 }).fields.find((f) => f.field === 'window_days')).toMatchObject({ status: 'changed', before: 1000, after: 999 });
    expect(cmp({ deadline: 'within 14 days of purchase' }).status).toBe('different');
    expect(cmp({ conditions: ['scope:annual plans only'] }).status).toBe('different');
    expect(cmp({ effective: '2026-12-01' }).status).toBe('different');
  });

  it('snapshots of different schemas are incomparable', () => {
    const other = captureSnapshot({ ...SCHEMA, version: '2' }, VALUES, AT);
    expect(compareSnapshots(base, other, SCHEMA).status).toBe('incomparable');
  });
});
