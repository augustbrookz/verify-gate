/**
 * The Verify MCP server for stdio (npx @xyntherium/verify-mcp): one tool, verify_answer,
 * defined, validated and formatted by tool.ts (shared with the hosted server at
 * https://mcp.xyntherium.com/mcp), calling the same /v1/verify API as the SDK and the
 * GitHub Action. Checks are metered against your plan and tagged source = mcp.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Xyntherium } from '../../verify-sdk/src/index';
import { formatResult, parseArguments, TOOL, TOOL_NAME } from './tool';

export const VERSION = '1.1.0';
export const INSTRUCTIONS =
  'Call verify_answer after drafting an answer that restates rules from documents in the conversation (a refund, pricing, eligibility, policy or terms passage) and before sending it. Pass the drafted answer and the passages it relies on. If the result says REVISE, fix what it names and check again; if ASK A PERSON, say what the sources do not settle. Do not call it for chit-chat, for answers with no source text, or to fact-check the world: it checks only against the sources you pass.';

export interface ServerOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createServer(o: ServerOptions): Server {
  const server = new Server({ name: 'xyntherium-verify', title: 'Xyntherium Verify', version: VERSION }, { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS });
  const client = (mode: 'fast' | 'strict') =>
    new Xyntherium({ apiKey: o.apiKey, ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}), ...(o.fetch ? { fetch: o.fetch } : {}), headers: { 'X-Xyntherium-Client': `verify-mcp/${VERSION}`, 'X-Xyntherium-Mode': mode } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL as never] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== TOOL_NAME) return { content: [{ type: 'text', text: `Unknown tool ${req.params.name}; this server has verify_answer.` }], isError: true };
    const parsed = parseArguments(req.params.arguments);
    if (!parsed.ok) return { content: [{ type: 'text', text: `Invalid arguments: ${parsed.message}` }], isError: true };
    try {
      const result = await client(parsed.mode).verify(parsed.body);
      const { text, structured } = formatResult(result, parsed.mode);
      return { content: [{ type: 'text', text }], structuredContent: structured, isError: false };
    } catch (e) {
      return { content: [{ type: 'text', text: `Xyntherium Verify could not check this answer: ${e instanceof Error ? e.message : 'request failed'}` }], isError: true };
    }
  });
  return server;
}
