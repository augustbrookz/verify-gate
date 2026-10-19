# Example: support bot

A fictional help-desk product, **Lumen Desk**, with a support bot that answers refund, pricing, phone-support and data-retention questions from three policy pages in `kb/`.

- `bot/server.mjs` is the app under test: it answers each question from `prompts/answers.json`, as a deployed bot answers from its prompt and model. Editing that file is how this example simulates a prompt change.
- `verify-gate.yml` pins the three sources by sha256 and lists the questions, each with the claim the answer must keep and the exact passage that supports it.

Run it locally:

```bash
node bot/server.mjs &
npx @xyntherium/verify-cli run
```

**The planted regression.** Change the first answer in `prompts/answers.json` to `"Annual plans can be cancelled for a full refund."` (the condition "within 30 days of purchase" is gone) and run again: the Gate blocks with **XYN-002 Dropped or conflicting qualifier**, a deterministic finding that names the dropped time window and its source passage.

**The document change demo.** `verify-gate.yml` lists four `tests` with required conditions. `demo/policy-change.patch` is a pull request that only edits policy text: the annual refund window goes from 30 to 14 days, refunds become "annual plans only", the source is re-pinned and declared to supersede version 2026-10, and `kb/promotions.md`, which no test is linked to, changes too. The bot is unchanged.

```bash
patch -p1 < demo/policy-change.patch
npx xyntherium run --base HEAD
```

The Gate adds **"Policy changed: 2 answers need review"**:

| Test | Verdict before → after | Conditions | Decision |
|---|---|---|---|
| `annual-refund-window` | supported → contradicted | lost deadline "within 30 days of purchase" (now "within 14 days of purchase"); still matches the superseded version 2026-10 | warn (would block) |
| `refund-payment-method` | supported → supported | newly required scope "annual plans only", missing from the answer | warn (would block) |
| `monthly-not-refundable` | supported → supported | kept | pass |

and one warning: **unprotected source change** `kb/promotions.md`. Separately, the Gate itself blocks, because the bot still answers "30 days". Undo with `patch -R -p1 < demo/policy-change.patch`.

Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.
