/**
 * @xyntherium/verify-sdk — a thin TypeScript client for Xyntherium Verify,
 * the API that checks whether an AI answer is supported by the sources you
 * gave it. Zero runtime dependencies; types come from @xyntherium/verify-core,
 * the same contract the API returns.
 *
 * Every verify() call carries an Idempotency-Key (generated if you do not
 * pass one), so the client's own retries can never run or bill a check twice.
 */
import type { VerifyRequestBody, VerifyResponseBody } from '@xyntherium/verify-core';

export type { ClaimResult, ReleaseRecommendation, SourceInput, Verdict, VerifyRequestBody, VerifyResponseBody } from '@xyntherium/verify-core';

export interface XyntheriumOptions {
  apiKey: string;
  /** Defaults to https://xyntherium.com */
  baseUrl?: string;
  /** Per-attempt timeout. Defaults to 120 s (a long answer can take a while). */
  timeoutMs?: number;
  /** Retries on 429, 409 (still running), 502/503/504 and network errors. Default 2. */
  maxRetries?: number;
  /** Bring your own fetch (tests, proxies, edge runtimes). */
  fetch?: typeof fetch;
  /** Extra headers on every request. */
  headers?: Record<string, string>;
}

export interface LedgerEntryResponse {
  evidence_ledger_id: string;
  request_id: string;
  seq: number;
  created_at: string;
  payload: unknown;
  payload_hash: string;
  prev_hash: string | null;
  entry_hash: string;
  verification: { payload_hash_matches: boolean; entry_hash_matches: boolean; links_to_previous: boolean | null; note: string | null };
}

export class XyntheriumError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'XyntheriumError';
  }
}

const RETRYABLE = new Set([409, 429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `xyn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class Xyntherium {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: XyntheriumOptions) {
    if (!opts?.apiKey) throw new Error('Xyntherium: apiKey is required');
    this.base = (opts.baseUrl ?? 'https://xyntherium.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** Check an answer against its sources. Resolves with the full result; throws XyntheriumError on an API error. */
  async verify(body: VerifyRequestBody, options: { idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<VerifyResponseBody> {
    return this.request<VerifyResponseBody>('POST', '/v1/verify', body, { 'Idempotency-Key': options.idempotencyKey ?? randomKey() }, options.signal);
  }

  /** A stored result by request_id. */
  async getVerification(id: string): Promise<VerifyResponseBody> {
    return this.request<VerifyResponseBody>('GET', `/v1/verify/${encodeURIComponent(id)}`);
  }

  /** An evidence-ledger entry with its hash checks recomputed by the API. */
  async getLedgerEntry(id: string): Promise<LedgerEntryResponse> {
    return this.request<LedgerEntryResponse>('GET', `/v1/ledger/${encodeURIComponent(id)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
    const maxRetries = this.opts.maxRetries ?? 2;
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 120_000);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'xyntherium-verify-sdk/1.0.0',
            ...this.opts.headers,
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timer);
        if (signal?.aborted) throw e;
        if (attempt++ < maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw new XyntheriumError(e instanceof Error ? e.message : 'network error', 0, 'network_error');
      }
      clearTimeout(timer);
      if (res.ok) return (await res.json()) as T;
      const retryAfter = Number(res.headers.get('retry-after'));
      const payload = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (RETRYABLE.has(res.status) && attempt++ < maxRetries) {
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 750 * 2 ** attempt);
        continue;
      }
      throw new XyntheriumError(payload?.error?.message ?? `HTTP ${res.status}`, res.status, payload?.error?.code ?? 'http_error', Number.isFinite(retryAfter) ? retryAfter : null);
    }
  }
}

/** True when the result's release recommendation is one you accept (default: only "allow"). */
export function shouldRelease(result: Pick<VerifyResponseBody, 'release_recommendation'>, accept: readonly string[] = ['allow']): boolean {
  return accept.includes(result.release_recommendation);
}

export default Xyntherium;
