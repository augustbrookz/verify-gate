/**
 * The published, reproducible verify_answer examples (shown on /docs/mcp and /developers,
 * and in this package's README). Calls with exactly these inputs are counted as demo checks,
 * not real use, by the hosted server's instrumentation; only a hash is compared.
 */
import { inputHash } from './tool';

export interface McpExample {
  id: string;
  title: string;
  /** The arguments to verify_answer. */
  args: { question?: string; answer: string; sources: { id: string; title?: string; text: string }[]; mode?: 'fast' | 'strict' };
  /** What the check is expected to find (the release recommendation, and the source wording it names). */
  expect: { release: 'allow' | 'cite_required' | 'revise' | 'human_review'; names: string[] };
  /** Where the source text comes from. */
  provenance: string;
}

export const EXAMPLES: McpExample[] = [
  {
    id: 'refund',
    title: 'A refund answer that drops the conditions',
    args: {
      question: 'Can I get a refund?',
      answer: 'Refunds are available within 30 days.',
      sources: [{ id: 'returns', title: 'Return policy', text: 'Refunds are available within 30 days for unopened items with proof of purchase.' }],
    },
    expect: { release: 'revise', names: ['unopened items', 'proof of purchase'] },
    provenance: 'Written for this example.',
  },
];

export const DEMO_INPUT_HASHES: ReadonlySet<string> = new Set(EXAMPLES.map((e) => inputHash(e.args)));
