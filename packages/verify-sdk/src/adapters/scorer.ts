/**
 * A Langfuse-style scorer: turns a Verify result into named scores you can
 * attach to a trace or evaluation run. Works with any tracing tool that takes
 * { name, value, comment } scores.
 */
import { Xyntherium, type SourceInput, type VerifyResponseBody } from '../index';

export interface Score {
  name: string;
  value: number;
  comment?: string;
}

export function scoresFromResult(result: VerifyResponseBody): Score[] {
  const total = result.counts.total || 1;
  return [
    { name: 'xyntherium_release_allowed', value: result.release_recommendation === 'allow' ? 1 : 0, comment: result.release_recommendation },
    { name: 'xyntherium_supported_share', value: result.counts.supported / total },
    { name: 'xyntherium_contradicted', value: result.counts.contradicted },
    { name: 'xyntherium_qualifier_loss', value: result.qualifier_loss_detected ? 1 : 0 },
  ];
}

export async function scoreAnswer(client: Xyntherium, input: { question: string; answer: string; sources: SourceInput[] }): Promise<Score[]> {
  return scoresFromResult(await client.verify(input));
}
