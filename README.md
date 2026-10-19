# Verify Gate

**Fail the pull request when your AI's answers stop being supported by your approved sources.**

This repository holds the open parts of [Xyntherium Verify](https://xyntherium.com/developers), which checks an AI-drafted answer against the documents it was supposed to follow. It catches a dropped condition ("within 30 days *for unopened items*"), a changed number, a flipped "may not", or a statement the documents never make. Every verdict quotes the passage it rests on.

- **Verify Gate**, a GitHub Action (`action.yml` at the root of this repository), runs your golden questions on every pull request. It applies a written release policy (pass, warn, hold or block) and writes a SARIF file and a hash-chained, optionally signed ledger of the run.
- **The engine** (`@xyntherium/verify-core`) is deterministic code: span matching, qualifier rules, numeric and date checks. It uses no model, makes no network calls and has no dependencies, and it runs in your CI.

> Verdicts describe whether the supplied passages support each claim, not whether a claim is true in the world. Evidence support for supplied sources only; not a compliance certification or legal assessment.

## Quickstart

```bash
npx @xyntherium/verify-cli init        # drafts verify-gate.yml from your docs, plus .github/workflows/verify-gate.yml
npx @xyntherium/verify-cli run         # first result, locally: code only, no API key
```

Or add the Action by hand:

```yaml
# .github/workflows/verify-gate.yml
on: pull_request
permissions: { contents: read, pull-requests: write, security-events: write, checks: write }
jobs:
  verify-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: augustbrookz/verify-gate@v0
        with:
          config: verify-gate.yml
```

New installations start in **report-only** mode: the Gate comments on the pull request, uploads SARIF and writes the ledger, but it never fails the job until you set `policy.enforcement: enforce`. See [`packages/verify-action/README.md`](packages/verify-action/README.md) for the golden set, the decisions and the document-change mode.

**Local mode** (the default) is free and unmetered; nothing leaves your runner. **Hosted mode** (`mode: hosted` with an API key) adds model-assisted claim splitting and qualifier analysis on Xyntherium's servers. It is metered against the same plan as the API ([pricing](https://xyntherium.com/pricing)).

## What is in this repository

| Package | npm | What it does |
|---|---|---|
| [`verify-core`](packages/verify-core) | `@xyntherium/verify-core` | The deterministic engine: claims, spans, qualifiers, numbers, dates, the rules (versioned, with a public changelog) and the evidence-ledger hash chain |
| [`verify-policy`](packages/verify-policy) | `@xyntherium/verify-policy` | The Gate's release policy (pass / warn / hold / block), the SARIF writer, and **the Gate ledger format and its verifier** (JCS hash chain, Ed25519 signatures) |
| [`verify-parity`](packages/verify-parity) | `@xyntherium/verify-parity` | Document-change parity: which edits to a source are cosmetic and which change a condition |
| [`verify-action`](packages/verify-action) | (this repository's `action.yml`) | The GitHub Action |
| [`verify-cli`](packages/verify-cli) | `@xyntherium/verify-cli` | `init`, `pin`, `run`, `ledger verify`, `keygen` |
| [`verify-sdk`](packages/verify-sdk) | `@xyntherium/verify-sdk` | A thin TypeScript client for the hosted API |
| [`verify-mcp`](packages/verify-mcp) | `@xyntherium/verify-mcp` | An MCP server (stdio) exposing `verify_answer`, a client of the hosted API |
| [`verify-bench`](packages/verify-bench) | `@xyntherium/verify-bench` | The open benchmark: items, labels by construction, the scorer, every published run, and `verify-bench-reproduce` |
| [`xyntherium`](packages/xyntherium) | `xyntherium` | The `npx xyntherium …` alias for the CLI |

## What is public and what is not

**Public, here, under the MIT licence:**
- everything that decides a verdict in code;
- the Gate policy;
- the ledger format and its verifier;
- the CLI, the Action, the SDK and the MCP client;
- the benchmark scorer and its items.

Anything the Gate does in local mode, you can read, run and audit.

**Not public:**
- **Model escalation:** which model is asked, when a claim escalates, and the cost and deadline logic in the hosted service.
- **The prompts** the hosted service sends to those models.
- **Held-out labels of any benchmark set that has not yet been scored.** The v1.1 held-out split is public: it has been scored once per rules version (six times) and is no longer an untouched test. The fresh held-out set that ships with benchmark v1.2 keeps its labels private until it has been scored.
- **Telemetry**, and everything else about the hosted service's operation: accounts, keys, billing and logs.

The hosted API runs the same `verify-core` you see here, at the rules version it reports in every response (`versions.rules`). The models only propose: every quote a model offers is located in the source by this code, and a quote that is not there is discarded.

## Check a ledger record yourself

Every Gate run writes `.xyntherium/verify-gate-ledger.json`. To check it offline:

```bash
npx @xyntherium/verify-cli ledger verify .xyntherium/verify-gate-ledger.json --public-key gate.pub      # a key you hold
npx @xyntherium/verify-cli ledger verify .xyntherium/verify-gate-ledger.json --keys https://xyntherium.com/v1/gate/keys   # hosted runs
```

This recomputes:
- every case hash and the RFC 8785 (JCS) hash chain, from the first case to the head;
- the run hash;
- the Ed25519 signature over the run.

A valid signature establishes integrity and origin for the signed record. It does not establish that the instruction, evidence, claims, policy, action or outcome is true, lawful, complete, authorized or appropriate. Format: [`schemas/verify-gate-ledger-1.1.0.schema.json`](schemas/verify-gate-ledger-1.1.0.schema.json).

## Reproduce the published benchmark numbers

```bash
npx -y -p @xyntherium/verify-core@1.1.0 -p @xyntherium/verify-bench@1.1.0 verify-bench-reproduce
```

This reruns rules 2.1.0 on all 2,040 items (no model, no key, a few seconds) and checks every prediction against the published run files. Method: https://xyntherium.com/verify/benchmark/method.

## Develop

```bash
npm install
npm run build     # every package, in dependency order
npm test
```

Node 20 or later. The Action's bundle (`packages/verify-action/dist`) is committed and must be rebuilt (`npm run build`) whenever `verify-core`, `verify-policy` or `verify-parity` changes.

## Security

See [SECURITY.md](SECURITY.md). Please report vulnerabilities privately, not in a public issue.

## Licence

MIT. See [LICENSE](LICENSE).
