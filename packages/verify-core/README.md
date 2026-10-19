# @xyntherium/verify-core

The deterministic core of [Xyntherium Verify](https://xyntherium.com/docs/verify) — an API that checks whether an AI answer is supported by the sources you gave it.

**We don't vote. We verify spans.** A model may *propose* that a passage supports a claim. This package decides whether the quoted span actually exists in the source (exact, then a normalisation layer for whitespace, quote style and punctuation with a hard edit-distance cap), whether every material qualifier in the source context survived into the claim, and whether numbers, dates and arithmetic agree — in code, with no model, no network and no dependencies.

Verdicts describe the supplied evidence, never real-world truth. "Supported" means the passages you supplied support the claim. It does not mean the claim is true.

## What is in here

| Module | Does |
|---|---|
| `contract` | The verdict contract, schema version `2026-10-15`, request/response types, the disclaimer |
| `spans` / `normalize` | Locate a quote in a source; offsets always index the original text |
| `qualifiers` | Extract dates, ranges, entities, quantities, conditions, scope, modality and negation; mark each preserved / dropped / contradicted / ambiguous |
| `numbers` / `checks` | Quantities with exact unit conversions only, dates, claim arithmetic, recomputed model arithmetic, date math, passage recency |
| `templates` | Code-only contradictions: a claim identical to a source sentence except one value or a negation |
| `claims` | Stage 2 of extraction: rejections with reasons, compound splitting, the coverage net |
| `rules` | Every verdict, with the id of the rule that produced it |
| `release` | `allow` / `cite_required` / `revise` / `human_review` |
| `ledger` | Hash-chained evidence ledger entries and chain verification |
| `calibration` | Wilson intervals and benchmark calibration bins |
| `engine` | The full pipeline with injected extractor / adjudicator / deliberator functions |

## Use without any model

```ts
import { runEngine } from '@xyntherium/verify-core';

const result = await runEngine({
  question: 'Can I get a refund?',
  answer: 'Refunds are processed within 10 business days.',
  sources: [{ id: 'kb-12', text: 'Refunds are processed within 10 business days of approval.' }],
});
result.claims[0].verdict; // 'supported' — resolved by code, span offsets included
```

Without an adjudicator, claims that need judgement come back `unverifiable` with `failure_reason: "not_adjudicated"`; nothing is guessed. The hosted API at `https://xyntherium.com/v1/verify` adds bounded model adjudication on top of exactly this code.

## License

MIT
