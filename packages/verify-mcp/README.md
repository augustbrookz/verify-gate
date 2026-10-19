# @xyntherium/verify-mcp

An MCP server with one tool, **`verify_answer`**: check whether an AI answer is supported by the source passages you supply. It returns per-claim verdicts (supported / contradicted / unsupported / unverifiable) with the exact quoted span, and a release recommendation. A thin wrapper over the same `/v1/verify` API as the SDK.

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

Tool input: `question`, `answer`, `sources: [{ id, text, title? }]`, `require_citations?`. Output: a readable summary (non-supported claims with their quote and any dropped qualifier) plus the full result as `structuredContent`.

`XYN_BASE_URL` points it at another deployment. Sources are passage text; URLs are never fetched. Verdicts describe the supplied passages, not truth in the world. MIT.
