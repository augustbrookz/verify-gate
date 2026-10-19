# Example: HR assistant

A fictional design studio, **Northwind Atelier**, with an internal HR assistant that answers leave and expense questions from `kb/leave.md` and `kb/expenses.md`. The assistant is `bot/server.mjs`, answering from `prompts/answers.json`.

```bash
node bot/server.mjs &
npx @xyntherium/verify-cli run
```

**The planted regression.** Change the parental-leave answer to `"Parental leave is 16 weeks at full pay."` (the eligibility condition "for employees who have completed 6 months of service" is gone): the Gate blocks with XYN-002. Change "16 weeks" to "20 weeks": it blocks with XYN-001.

Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.
