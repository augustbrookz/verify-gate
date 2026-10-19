import { describe, expect, it, vi } from 'vitest';
import { shouldRelease, Xyntherium, XyntheriumError } from '@xyntherium/verify-sdk';
import { scoresFromResult } from '../src/adapters/scorer';

const BODY = { question: 'q', answer: 'a', sources: [{ id: 's', text: 't' }] };
const OK = { schema_version: '2026-10-15', request_id: 'r1', release_recommendation: 'allow', counts: { supported: 1, contradicted: 0, unsupported: 0, unverifiable: 0, total: 1, resolved_by_code: 1 }, qualifier_loss_detected: false, claims: [] };

function fetchSeq(...responses: Array<[number, unknown, Record<string, string>?]>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body, headers] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(body), { status, headers });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('Xyntherium SDK', () => {
  it('posts to /v1/verify with auth and an Idempotency-Key', async () => {
    const f = fetchSeq([200, OK]);
    const r = await new Xyntherium({ apiKey: 'xyn_test_1', fetch: f.impl, baseUrl: 'https://staging.example/' }).verify(BODY);
    expect(r.release_recommendation).toBe('allow');
    expect(f.calls[0].url).toBe('https://staging.example/v1/verify');
    const h = f.calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer xyn_test_1');
    expect(h['Idempotency-Key']).toMatch(/.{8,}/);
  });

  it('retries a 503 with the SAME Idempotency-Key, so a retry can never bill twice', async () => {
    const f = fetchSeq([503, { error: { code: 'service_unavailable', message: 'x' } }, { 'retry-after': '0' }], [200, OK]);
    await new Xyntherium({ apiKey: 'k', fetch: f.impl }).verify(BODY);
    expect(f.calls).toHaveLength(2);
    const k1 = (f.calls[0].init.headers as Record<string, string>)['Idempotency-Key'];
    const k2 = (f.calls[1].init.headers as Record<string, string>)['Idempotency-Key'];
    expect(k1).toBe(k2);
  });

  it('surfaces API errors with status and code, without retrying 4xx', async () => {
    const f = fetchSeq([422, { error: { code: 'unprocessable', message: 'Source "web" has a url but no text.' } }]);
    const err = await new Xyntherium({ apiKey: 'k', fetch: f.impl }).verify(BODY).catch((e) => e);
    expect(err).toBeInstanceOf(XyntheriumError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('unprocessable');
    expect(f.calls).toHaveLength(1);
  });

  it('gates on the release recommendation', () => {
    expect(shouldRelease({ release_recommendation: 'allow' })).toBe(true);
    expect(shouldRelease({ release_recommendation: 'cite_required' })).toBe(false);
    expect(shouldRelease({ release_recommendation: 'cite_required' }, ['allow', 'cite_required'])).toBe(true);
  });

  it('turns a result into tracing scores', () => {
    const scores = scoresFromResult(OK as never);
    expect(scores.find((s) => s.name === 'xyntherium_release_allowed')?.value).toBe(1);
  });

  it('refuses to construct without a key', () => {
    expect(() => new Xyntherium({ apiKey: '' })).toThrow();
  });
});
