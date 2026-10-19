/**
 * Call the application under test, once per case.
 *
 * Safety:
 *   - https only, unless network_mode: local
 *   - private, loopback, link-local, CGNAT, multicast, unique-local and cloud
 *     metadata addresses are refused after DNS resolution, at connect time (a
 *     custom lookup), so DNS rebinding cannot slip past the check — unless
 *     network_mode: local
 *   - redirects are not followed
 *   - timeout per attempt, a response byte limit, bounded retries on 429/5xx
 *     and network errors with backoff
 *   - header values come from environment variables; the caller masks them
 *     before anything runs, and nothing here logs a header, a question or an
 *     answer
 */
import { createHash } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { expandEnv, type EndpointSpec } from './config';

export class EndpointError extends Error {
  constructor(
    readonly code: 'endpoint_timeout' | 'endpoint_error',
    message: string,
  ) {
    super(message);
  }
}

function v4(ip: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  return m ? m.slice(1).map(Number) : null;
}

/** Addresses an endpoint may not resolve to in network_mode: public. */
export function isBlockedAddress(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  const a = v4(mapped ? mapped[1] : lower);
  if (a) {
    const [x, y] = a;
    return (
      x === 0 ||
      x === 10 ||
      x === 127 ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      (x === 192 && y === 0 && a[2] === 0) ||
      (x === 198 && (y === 18 || y === 19)) ||
      x >= 224
    );
  }
  if (isIP(lower) === 6) {
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('ff') ||
      lower.startsWith('64:ff9b:')
    );
  }
  return true;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A dns.lookup that refuses blocked addresses, used at connect time. */
export function safeLookup(hostname: string, options: object, cb: LookupCb): void {
  dnsLookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (bad || !list.length) {
      const e = new Error(`endpoint host resolves to a private, loopback or metadata address; set network_mode: local to allow it`) as NodeJS.ErrnoException;
      e.code = 'EBLOCKEDADDR';
      return cb(e, []);
    }
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export interface EndpointResult {
  answer: string;
  request_hash: string;
  response_hash: string;
  status: number;
  attempts: number;
}

export interface Transport {
  (o: { url: URL; method: string; headers: Record<string, string>; body: string | null; timeout_ms: number; max_bytes: number; network_mode: 'public' | 'local' }): Promise<{ status: number; headers: Record<string, string>; body: Buffer }>;
}

/** The default transport: node:http(s) with the safe lookup, no redirects, a byte cap. */
export const nodeTransport: Transport = (o) =>
  new Promise((resolvePromise, reject) => {
    const req = (o.url.protocol === 'https:' ? httpsRequest : httpRequest)(
      o.url,
      { method: o.method, headers: o.headers, timeout: o.timeout_ms, ...(o.network_mode === 'public' ? { lookup: safeLookup as never } : {}) },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > o.max_bytes) {
            req.destroy(new EndpointError('endpoint_error', `response exceeded ${o.max_bytes} bytes`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new EndpointError('endpoint_timeout', `no response within ${o.timeout_ms} ms`)));
    req.on('error', reject);
    if (o.body !== null) req.write(o.body);
    req.end();
  });

/** Substitute the question: JSON-escaped inside a JSON body, URL-encoded in a URL. */
export function fillTemplate(template: string, question: string, kind: 'json' | 'text' | 'url'): string {
  if (kind === 'url') return template.replace(/\{\{question\}\}/g, encodeURIComponent(question));
  if (kind === 'json') {
    // Inside a JSON string literal the question is escaped in place; outside one it
    // becomes a whole JSON string ("{{question}}" and {{question}} both work).
    let out = '';
    let inString = false;
    for (let i = 0; i < template.length; i++) {
      if (template.startsWith('{{question}}', i)) {
        out += inString ? JSON.stringify(question).slice(1, -1) : JSON.stringify(question);
        i += '{{question}}'.length - 1;
        continue;
      }
      const ch = template[i];
      if (ch === '"' && template[i - 1] !== '\\') inString = !inString;
      out += ch;
    }
    return out;
  }
  return template.replace(/\{\{question\}\}/g, question);
}

/** RFC 6901 JSON pointer. */
export function pointer(doc: unknown, path: string): unknown {
  if (!path || path === '/') return doc;
  let cur: unknown = doc;
  for (const raw of path.replace(/^\//, '').split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The endpoint's identity without any secret: method, origin and path, template hash, header names. */
export function endpointFingerprint(e: EndpointSpec): string {
  let target = e.url;
  try {
    const u = new URL(e.url.replace(/\{\{question\}\}/g, 'q').replace(/\$\{env\.[A-Z0-9_]+\}/g, 'env'));
    target = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // keep the raw template; it carries no secret (headers do, and they are env refs)
  }
  const h = createHash('sha256').update([e.method, target, e.body ?? '', Object.keys(e.headers).map((k) => k.toLowerCase()).sort().join(','), e.answer_path].join('|')).digest('hex');
  return h;
}

export async function callEndpoint(e: EndpointSpec, question: string, o: { env: Record<string, string | undefined>; network_mode: 'public' | 'local'; transport?: Transport; backoff_ms?: number }): Promise<EndpointResult> {
  const transport = o.transport ?? nodeTransport;
  const rawUrl = expandEnv(e.url, o.env);
  const url = new URL(e.method === 'GET' ? fillTemplate(rawUrl, question, 'url') : rawUrl);
  if (url.protocol !== 'https:' && !(o.network_mode === 'local' && url.protocol === 'http:')) {
    throw new EndpointError('endpoint_error', 'the endpoint must use https (http is allowed only with network_mode: local)');
  }
  if (o.network_mode === 'public' && isIP(url.hostname.replace(/^\[|\]$/g, '')) && isBlockedAddress(url.hostname)) {
    throw new EndpointError('endpoint_error', 'the endpoint is a private, loopback or metadata address; set network_mode: local to allow it');
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.headers)) headers[k] = expandEnv(v, o.env);
  const isJson = e.body !== null && /^\s*[{[]/.test(e.body);
  const body = e.body === null ? null : fillTemplate(expandEnv(e.body, o.env), question, isJson ? 'json' : 'text');
  if (body !== null && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = isJson ? 'application/json' : 'text/plain; charset=utf-8';
  headers['user-agent'] = 'xyntherium-verify-gate/0.1.0';
  const request_hash = createHash('sha256').update(`${e.method}|${url.toString()}|${body ?? ''}`).digest('hex');
  let last: EndpointError | null = null;
  for (let attempt = 1; attempt <= e.retries + 1; attempt++) {
    const retryable = attempt <= e.retries;
    let res: Awaited<ReturnType<Transport>>;
    try {
      res = await transport({ url, method: e.method, headers, body, timeout_ms: e.timeout_ms, max_bytes: e.max_response_bytes, network_mode: o.network_mode });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EBLOCKEDADDR') throw new EndpointError('endpoint_error', (err as Error).message);
      last = err instanceof EndpointError ? err : new EndpointError('endpoint_error', `network error (${code ?? 'unknown'})`);
      if (/exceeded/.test(last.message)) throw last; // byte limit: not retried
      if (retryable) await sleep((o.backoff_ms ?? 400) * 3 ** (attempt - 1));
      continue;
    }
    if (res.status >= 300 && res.status < 400) throw new EndpointError('endpoint_error', `the endpoint answered with a redirect (HTTP ${res.status}); redirects are not followed`);
    if (res.status === 429 || res.status >= 500) {
      last = new EndpointError('endpoint_error', `HTTP ${res.status}`);
      if (retryable) await sleep((o.backoff_ms ?? 400) * 3 ** (attempt - 1));
      continue;
    }
    if (res.status >= 400) throw new EndpointError('endpoint_error', `HTTP ${res.status}`);
    const response_hash = createHash('sha256').update(res.body).digest('hex');
    const text = res.body.toString('utf8');
    let answer: unknown = text;
    if (e.answer_path) {
      try {
        answer = pointer(JSON.parse(text), e.answer_path);
      } catch {
        throw new EndpointError('endpoint_error', `the response is not JSON, so answer_path ${e.answer_path} cannot be read`);
      }
    }
    if (typeof answer !== 'string' || !answer.trim()) throw new EndpointError('endpoint_error', `no answer text at ${e.answer_path || 'the response body'}`);
    return { answer, request_hash, response_hash, status: res.status, attempts: attempt };
  }
  throw last ?? new EndpointError('endpoint_error', 'no attempt made');
}
