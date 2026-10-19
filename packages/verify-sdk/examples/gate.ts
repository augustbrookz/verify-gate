// Gate a RAG answer before sending it (TypeScript, 20 lines).
import { Xyntherium, shouldRelease } from '@xyntherium/verify-sdk';

const xyn = new Xyntherium({ apiKey: process.env.XYN_API_KEY! });

export async function answerWithGate(question: string, retrieve: (q: string) => Promise<{ id: string; text: string }[]>, generate: (q: string, docs: { id: string; text: string }[]) => Promise<string>) {
  const docs = await retrieve(question);
  const draft = await generate(question, docs);
  const result = await xyn.verify({ question, answer: draft, sources: docs });

  if (shouldRelease(result)) return { answer: draft, ledger: result.evidence_ledger_id };

  const problems = result.claims
    .filter((c) => c.verdict !== 'supported')
    .map((c) => `${c.verdict}: ${c.text}`);
  // Regenerate, ask for citations, or hand off — never send unsupported claims.
  return { answer: null, needs: result.release_recommendation, problems };
}
