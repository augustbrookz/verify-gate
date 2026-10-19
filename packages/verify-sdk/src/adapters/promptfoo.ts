/**
 * Promptfoo custom assertion: fails a test case unless Xyntherium Verify
 * recommends releasing the model's output given the case's sources.
 *
 *   assert:
 *     - type: javascript
 *       value: file://node_modules/@xyntherium/verify-sdk/dist/adapters/promptfoo.js
 *   vars:
 *     question: ...
 *     sources: [{ id: kb-1, text: ... }]
 *
 * Needs XYN_API_KEY in the environment.
 */
import { Xyntherium, shouldRelease, type SourceInput } from '../index';

export default async function xyntheriumAssertion(output: string, context: { vars: { question?: string; sources?: SourceInput[]; accept?: string[] } }) {
  const client = new Xyntherium({ apiKey: process.env.XYN_API_KEY ?? '' });
  const result = await client.verify({ question: context.vars.question ?? '', answer: output, sources: context.vars.sources ?? [] });
  const supported = result.counts.total ? result.counts.supported / result.counts.total : 0;
  const issues = result.claims.filter((c) => c.verdict !== 'supported').map((c) => `${c.verdict}${c.failure_reason ? ` (${c.failure_reason})` : ''}: ${c.text}`);
  return {
    pass: shouldRelease(result, context.vars.accept ?? ['allow']),
    score: supported,
    reason: `release_recommendation=${result.release_recommendation}${issues.length ? `; ${issues.join(' | ')}` : ''}`,
  };
}
