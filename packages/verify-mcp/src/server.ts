/**
 * The Verify MCP server: one tool, verify_answer, a thin wrapper over the
 * same /v1/verify contract as the SDK and the GitHub Action.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Xyntherium, type VerifyResponseBody } from '../../verify-sdk/src/index';

export const TOOL_DESCRIPTION =
  'Check whether an AI-generated answer is supported by the source passages you supply. Splits the answer into claims and returns, per claim, supported / contradicted / unsupported / unverifiable with the exact quoted span from the sources, plus a release recommendation (allow, cite_required, revise, human_review). Verdicts describe the supplied passages, not truth in the world. Sources must be passage text; URLs are never fetched.';

export function summarize(r: VerifyResponseBody): string {
  const lines = [
    `release_recommendation: ${r.release_recommendation} (${r.overall_status})`,
    `claims: ${r.counts.supported} supported, ${r.counts.contradicted} contradicted, ${r.counts.unsupported} unsupported, ${r.counts.unverifiable} unverifiable`,
  ];
  for (const c of r.claims) {
    if (c.verdict === 'supported') continue;
    const span = c.provenance.spans[0];
    lines.push(`- ${c.verdict}${c.failure_reason ? ` (${c.failure_reason})` : ''}: "${c.text}"${span ? ` — source ${span.source_id}: "${span.quote}"` : ''}`);
    for (const q of c.provenance.qualifiers.filter((x) => x.status === 'dropped')) lines.push(`  dropped qualifier: "${q.source_text}"`);
  }
  if (r.partial_reasons.length) lines.push(`partial: ${r.partial_reasons.join('; ')}`);
  lines.push(`request_id: ${r.request_id}; evidence_ledger_id: ${r.evidence_ledger_id ?? 'none'}`);
  lines.push(r.disclaimer);
  return lines.join('\n');
}

export function createServer(client: Xyntherium): McpServer {
  const server = new McpServer({ name: 'xyntherium-verify', version: '1.0.0' });
  server.registerTool(
    'verify_answer',
    {
      title: 'Verify an answer against its sources',
      description: TOOL_DESCRIPTION,
      inputSchema: {
        question: z.string().min(1).describe('The question the answer responds to'),
        answer: z.string().min(1).describe('The AI-generated answer to check'),
        sources: z
          .array(z.object({ id: z.string().min(1), text: z.string().min(1), title: z.string().optional(), retrieved_at: z.string().optional() }))
          .min(1)
          .describe('The passages the answer should be grounded in (text, not URLs)'),
        require_citations: z.boolean().optional().describe('Require each supported claim to cite the passage that supports it'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ question, answer, sources, require_citations }) => {
      try {
        const result = await client.verify({ question, answer, sources, ...(require_citations ? { options: { require_citations: true } } : {}) });
        return { content: [{ type: 'text' as const, text: summarize(result) }], structuredContent: result as unknown as Record<string, unknown> };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Verify request failed';
        return { content: [{ type: 'text' as const, text: `Xyntherium Verify error: ${message}` }], isError: true };
      }
    },
  );
  return server;
}
