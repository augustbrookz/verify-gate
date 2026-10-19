# xyntherium-verify (Claude plugin)

A skill that tells Claude when to check an answer with `verify_answer` and when not to, plus the hosted MCP server it calls.

```text
/plugin marketplace add augustbrookz/verify-gate
/plugin install xyntherium-verify@verify-gate
```

Claude Code asks for your Xyntherium API key once, when the plugin is enabled. It is stored in your OS credential store. Get a key at https://xyntherium.com/account/api-keys (free: 1,000 checks a month).

## Measured behaviour

The model is `claude-sonnet-5-5`, with one run per conversation. The tool response is mocked (`evals/mocks`), so these runs measure *when Claude calls the tool and what it passes*, not the checks themselves.

| Suite | Conversations | Correct calls | Correct skips | Wrong calls | Misses | Source passed verbatim |
|---|---|---|---|---|---|---|
| `evals/` (tuning set) | 20 (12 should call, 8 should not) | 12 | 8 | 0 | 0 | 12 of 12 |
| `evals-holdout/` (written after tuning, run once) | 10 (6 / 4) | 6 | 4 | 0 | 0 | 6 of 6 |

How the tuning went, 2026-10-19:
- **First pass.** The eval harness denied the Skill tool (it runs in don't-ask mode), so the skill never loaded and Claude answered from the prompt: 0 of 12 calls. With `--allow-tools Skill` the result was 11 of 12.
- **The one miss** was "Is this chatbot answer OK to send?", where Claude judged the answer itself. The skill's description now also covers questions about whether an answer is right.
- **The final runs** are the two rows above. The tuning set was used to fix that miss, so it is not an independent measure. The holdout set is.

```bash
claude plugin eval plugins/xyntherium-verify --trust-plugin --allow-tools Skill --ablation none --runs 1 --model claude-sonnet-5-5
claude plugin eval plugins/xyntherium-verify --eval-dir evals-holdout --trust-plugin --allow-tools Skill --ablation none --runs 1 --model claude-sonnet-5-5
```
