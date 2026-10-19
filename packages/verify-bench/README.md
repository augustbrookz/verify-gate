# @xyntherium/verify-bench

An open benchmark for one question: **how often does a system release an AI answer that its own sources do not support?**

- 528 items constructed (480 published: 291 dev / 189 held-out; 48 in a human review queue) across policies, plan and pricing pages, product docs and help-centre articles about fictional organisations.
- **Labels by construction, never by a model under test.** Each item is a minimal pair: a supported answer with exactly one planted change (a number, date, entity, negation, a dropped qualifier) or a claim the passages never address. See `CONSTRUCTION.md`; `scripts/check-shard.mjs` and `scripts/build.mjs` regenerate and audit everything.
- Categories: supported (verbatim, paraphrase), contradicted, qualifier loss, unsupported, unverifiable, and nine adversarial categories (wrong entity / date / scope, multi-hop, contradictory sources, stale vs superseded, citation to the wrong passage, arithmetic on missing input, cherry-picked support).
- Splits by family (sha256 of the family id), so minimal pairs never straddle dev and held-out. The held-out split is readable only through `loadHeldoutForFinalEvaluation`, which requires the SHA-256 of the pre-registered methodology.
- `scoreMethod()` computes false-supported rate, unsupported release rate, supported recall, qualifier-loss detection, abstention, with 95% Wilson intervals, per split and category.

Results and methodology: https://xyntherium.com/verify/benchmark. "Supported" means supported by the supplied evidence, not true in the world. MIT.
