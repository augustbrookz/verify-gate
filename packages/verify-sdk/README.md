# @xyntherium/verify-sdk

TypeScript client for [Xyntherium Verify](https://xyntherium.com/docs/verify): an API that checks whether an AI answer is supported by the sources you gave it.

```ts
import { Xyntherium, shouldRelease } from '@xyntherium/verify-sdk';

const xyn = new Xyntherium({ apiKey: process.env.XYN_API_KEY! });
const result = await xyn.verify({ question, answer: draft, sources: retrieved });

if (shouldRelease(result)) send(draft);                 // release_recommendation === "allow"
else console.log(result.claims.filter((c) => c.verdict !== 'supported'));
```

- Zero runtime dependencies; response types are the `@xyntherium/verify-core` contract (schema `2026-10-15`).
- Every `verify()` carries an `Idempotency-Key` (generated if you don't pass one), so retries on 429 / 409 / 502–504 can never run or bill a check twice.
- `getVerification(id)` and `getLedgerEntry(id)` read stored results and evidence-ledger entries.
- Adapters: `@xyntherium/verify-sdk/adapters/promptfoo` (custom assertion) and `@xyntherium/verify-sdk/adapters/scorer` (Langfuse-style `{ name, value, comment }` scores).
- Examples: `examples/gate.ts`, `examples/gate.py` — gate a RAG answer before sending it, in 20 lines.

Verdicts describe the supplied passages, never truth in the world. MIT.
