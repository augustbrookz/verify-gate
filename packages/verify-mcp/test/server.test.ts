import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server';
import { TOOL_DESCRIPTION } from '../src/tool';

const RESULT = {
  schema_version: '2026-10-15',
  request_id: 'req-1',
  evidence_ledger_id: 'led-1',
  status: 'completed',
  overall_status: 'issues_found',
  release_recommendation: 'revise',
  release_reasons: [],
  partial_reasons: [],
  counts: { supported: 1, contradicted: 0, unsupported: 1, unverifiable: 0, total: 2, resolved_by_code: 1 },
  claims: [
    { index: 0, text: 'Refunds take 10 business days.', verdict: 'supported', failure_reason: null, provenance: { spans: [], qualifiers: [] } },
    {
      index: 1,
      text: 'You can get a full refund within 30 days.',
      verdict: 'unsupported',
      failure_reason: 'qualifier_loss',
      provenance: { spans: [{ source_id: 'kb', quote: 'Annual plans can be refunded within 30 days' }], qualifiers: [{ status: 'dropped', source_text: 'Annual plans' }] },
    },
  ],
  disclaimer: 'Verdicts describe whether the supplied passages support each claim.',
};

async function connect(fetchImpl: typeof fetch) {
  const server = createServer({ apiKey: 'xyn_test_k', fetch: fetchImpl, baseUrl: 'https://staging.example' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('verify_answer MCP tool', () => {
  it('is listed with its input schema', async () => {
    const client = await connect((async () => new Response('{}')) as unknown as typeof fetch);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['verify_answer']);
    expect(tools[0].description).toBe(TOOL_DESCRIPTION);
    expect(Object.keys((tools[0].inputSchema as { properties: object }).properties)).toEqual(['answer', 'sources', 'question', 'mode']);
    expect(tools[0].annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
  });

  it('calls /v1/verify and returns a summary plus the structured result', async () => {
    let posted: unknown = null;
    let headers: Headers | null = null;
    const client = await connect((async (url: string, init: RequestInit) => {
      expect(url).toBe('https://staging.example/v1/verify');
      posted = JSON.parse(String(init.body));
      headers = new Headers(init.headers);
      return new Response(JSON.stringify(RESULT), { status: 200 });
    }) as unknown as typeof fetch);
    const res = await client.callTool({ name: 'verify_answer', arguments: { question: 'q', answer: 'a', sources: [{ id: 'kb', text: 'Annual plans can be refunded within 30 days.' }], mode: 'strict' } });
    expect(posted).toMatchObject({ question: 'q', answer: 'a' });
    expect(headers!.get('x-xyntherium-client')).toMatch(/^verify-mcp\//);
    expect(headers!.get('x-xyntherium-mode')).toBe('strict');
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text.split('\n')[0]).toBe('REVISE: dropped “Annual plans”.');
    expect((res.structuredContent as { request_id: string; verdict: string }).request_id).toBe('req-1');
    expect((res.structuredContent as { verdict: string }).verdict).toBe('revise');
  });

  it('reports API errors as a tool error, not a crash', async () => {
    const client = await connect((async () => new Response(JSON.stringify({ error: { code: 'invalid_key', message: 'API key not recognized.' } }), { status: 401 })) as unknown as typeof fetch);
    const res = await client.callTool({ name: 'verify_answer', arguments: { question: 'q', answer: 'a', sources: [{ id: 'kb', text: 't' }] } });
    expect(res.isError).toBe(true);
  });
});
