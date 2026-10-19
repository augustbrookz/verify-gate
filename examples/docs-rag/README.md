# Example: docs RAG with required citations

A fictional API company, **Quillstack**, whose docs assistant answers from `kb/rate-limits.md` and `kb/authentication.md` and must cite the passage it used, as `[rate-limits]` or `[auth]`. This example uses **recorded answers** (no endpoint): `verify-gate.yml` carries the answers, copied from `answers/recorded.json`, which a nightly job refreshes from the deployed assistant.

```bash
npx @xyntherium/verify-cli run
```

**The planted regressions.** Remove the `[auth]` citation from the key-rotation answer: the Gate blocks with **XYN-004 Missing or wrong citation**. Change "24 hours" to "48 hours": it blocks with **XYN-001**.

Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.
