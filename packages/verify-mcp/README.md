# @xyntherium/verify-mcp

An MCP server with one tool, **`verify_answer`**:

> Check whether an AI-drafted answer preserved the conditions, exceptions, dates, limits and eligibility rules in the supplied sources.

Before an assistant sends an answer that restates a refund policy, a price, an eligibility rule or a term, it passes the draft and the passages to `verify_answer`. The first line of the result is the verdict, with what went wrong:

```text
REVISE: dropped “for unopened items with proof of purchase”.
- Dropped: “Refunds are available within 30 days.” leaves out “for unopened items with proof of purchase”; the source says “within 30 days for unopened items with proof of purchase” (source returns).
0 of 1 statements supported · mode fast · rules 2.1.0 · request …
```

The verdict is one of **SEND**, **CITE SOURCES**, **REVISE** or **ASK A PERSON**. The same data is returned as `structuredContent` (an `outputSchema` is declared).

## Hosted (no install)

```text
URL:     https://mcp.xyntherium.com/mcp
Header:  Authorization: Bearer <your API key>
```

Streamable HTTP, stateless, supporting protocol 2026-07-28 and 2025-11-25. Setup for Claude, Claude Code, Cursor and VS Code: https://xyntherium.com/docs/mcp

## Local (stdio)

```json
{
  "mcpServers": {
    "xyntherium-verify": {
      "command": "npx",
      "args": ["-y", "@xyntherium/verify-mcp"],
      "env": { "XYN_API_KEY": "xyn_live_…" }
    }
  }
}
```

## The tool

| Argument | |
|---|---|
| `answer` (required) | The drafted answer, exactly as it would be sent |
| `sources` (required) | `[{ text, id?, title? }]`: the passages the answer must follow (text, never URLs) |
| `question` | The user's question, if there was one |
| `mode` | `fast` (default): code checks plus a fast model. `strict`: also escalates uncertain statements to a stronger model |

Annotations: read-only, idempotent, not destructive. Everything passed in is treated as untrusted data: it is checked, never followed.

Every check counts against your plan's monthly allowance, the same allowance as the API and Verify Gate (free: 1,000 checks a month). Get a key at https://xyntherium.com/account/api-keys. Verdicts describe the supplied passages, not truth in the world. MIT.
