# Verify Gate (Xyntherium) — v0.1

**Fail the pull request when your AI's answers stop being supported by your approved sources.**

Verify Gate runs your AI application's golden questions on every pull request, checks each answer against the source files you approved, and applies a written release policy: **pass, warn, hold or block**. A prompt change that makes your support bot drop a refund condition is caught before it merges, with the exact sentence, the exact source passage and the exact missing condition in the pull request.

> **Assurance scope:** evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.

## Quickstart (about a minute)

```bash
npx @xyntherium/verify-cli init        # drafts verify-gate.yml from your README and docs/, plus the workflow
npx @xyntherium/verify-cli run         # first real result, locally, no API key
```

`init` writes a **draft** golden set: 10–20 questions, each with the exact passage from your docs that answers it. Read every question, then remove `draft: true` and set `policy.enforcement: enforce` when you want the Gate to block. Until then it reports only. Commit `verify-gate.yml` and `.github/workflows/verify-gate.yml`:

```yaml
- uses: augustbrookz/verify-gate@v0
  with:
    config: verify-gate.yml
    fail-on: block
```

New installations start report-only, so a team sees what the Gate would have done on its own changes before it is allowed to block anything.

## The golden set (`verify-gate.yml`)

```yaml
version: 1
sources:                                   # checked-in files only, never fetched from URLs
  - { id: refunds, path: kb/refunds.md, version: "2026-10", sha256: 4f1c… }   # npx @xyntherium/verify-cli pin
endpoint:                                  # optional: the app under test
  url: https://staging.example.com/api/ask
  headers: { Authorization: "Bearer ${env.APP_TOKEN}" }   # credentials only from env
  body: '{"question": "{{question}}"}'
  answer_path: /answer
policy: { enforcement: enforce }
suites:
  - name: support
    cases:
      - id: annual-refund-window
        question: Can I get a refund on an annual plan?
        material_claims:
          - claim: Annual plans can be cancelled for a full refund within 30 days of purchase
            materiality: critical
            quote: Annual plans can be cancelled for a full refund within 30 days of purchase.
            source: refunds
```

JSON Schema: [`schemas/verify-gate.schema.json`](../../schemas/verify-gate.schema.json). A case without an endpoint uses a recorded `answer`.

## Decisions

| Decision | Meaning | Examples |
|---|---|---|
| **pass** | Every material claim is supported and no threshold is exceeded | Claims evidence-backed, conditions intact |
| **warn** | Something needs attention; policy allows the merge | A minor claim the sources cannot resolve |
| **hold** | The check could not complete. **Never treated as a pass, never overridable** | App timeout, a source file changed, verifier unavailable |
| **block** | A defined release condition failed | A contradiction, a dropped condition, a missing required citation |

Precedence: hold > block > warn > pass. Exit code 1 on block (with `enforcement: enforce`), and on hold only when `fail-on` includes `hold`.

## Failure taxonomy

| Rule | Name | Default |
|---|---|---|
| XYN-001 | Contradicted claim (number, unit, date, entity, polarity, arithmetic, superseded) | block if material |
| XYN-002 | Dropped or conflicting qualifier (condition, exception, time window, scope, "may" → "will") | block if material |
| XYN-003 | Unsupported claim (incl. a model-proposed quote that is not in the source) | block if critical/high, else warn |
| XYN-004 | Missing or wrong citation (when citations are required) | block if material |
| XYN-005 | Unresolved claim (comparisons the sources don't describe, predictions, conflicting sources) | warn |
| XYN-006 | Check could not complete | hold |

**Precision before coverage.** By default only *deterministic* findings — a code-confirmed span and a code-decided verdict — can block. A finding that depends on a model judgement is reported as a warning unless you set `policy.model_findings: block`. Reports group deterministic findings (they reproduce identically) apart from model-dependent ones. Each claim carries `span_valid`, `support_assessment`, `qualifier_checks`, `resolved_by` and `review_required`.

Framework references (NIST AI 600-1 MS-2.5-003, OWASP LLM09:2025) in SARIF are an informational mapping; not a certification or compliance determination.

## Local and hosted mode

- **Local** (default, no API key, free): each expected claim is located in the answer and checked in code — exact span validation with Unicode-safe normalisation and original offsets, number, date, negation and modality checks, dropped-qualifier detection — and the rest of the answer is split into sentences and checked the same way. A golden-set `quote` lets code settle a paraphrase. Whatever code cannot settle is reported unresolved (warn), never supported.
- **Hosted** (`mode: hosted`, `api-key`): one call to `POST /v1/gate/verify-run` adds model-assisted claim splitting and qualifier analysis, signs the ledger with a Xyntherium-managed key (public keys at `https://xyntherium.com/v1/gate/keys`), and meters each case as one Verify check. Cached cases and holds are free.

## What the Gate writes

Before any GitHub call, to `artifact-path` (default `.xyntherium/`):

- `verify-gate-ledger.json` — ledger v1.0.0 ([schema](../../schemas/verify-gate-ledger-1.0.0.schema.json)): run, cases, per-claim fields with spans and offsets, findings, decision and any override, hash-chained, and cryptographically signed by the configured verifier key when `signing-key` is set. Hashes, offsets and statuses only; no answer or source text unless `ledger.include_text: true`. Check it offline: `npx @xyntherium/verify-cli ledger verify .xyntherium/verify-gate-ledger.json --public-key gate.pub`.
- `verify-gate.sarif` — SARIF 2.1.0 for code scanning (rules XYN-001…006, fingerprints stable across runs).
- `verify-gate-summary.md` — the job summary and PR comment.

Then, each optional and degrading gracefully: the job summary, one PR comment (updated in place), a check run, and the SARIF upload.

## Document change mode (policy changes)

A policy edit can make an answer the team already approved wrong without any code or prompt change. List the questions that depend on each policy as `tests`, with the conditions their answers must keep:

```yaml
sources:
  - { id: refunds, path: kb/refunds.md, version: 2026-11, effective_date: "2026-11-01", supersedes: [refunds@2026-10], sha256: 3b9b… }
tests:
  - id: annual-refund-window
    source_ids: [refunds]
    question: Can I get a refund on an annual plan?
    answer: Annual plans can be cancelled for a full refund within 30 days of purchase.   # the saved answer
    required_conditions:                     # eligibility, deadline, exception, scope, modality, negation, quantity
      - { class: deadline, text: within 30 days of purchase }
policy_change: { enforcement: report_only }  # the default
```

When a pull request changes a file under `sources[].path`, **only the tests linked to it** re-run against the new version, and each is compared with its previous-version result (the previous Gate run's verdict when the cache has it, otherwise recomputed from the base version). The PR comment and a separate check are titled **"Policy changed: N answers need review"**, with, per test, the verdict before → after, the conditions lost or newly required, and the source diff excerpt.

| Decision | When |
|---|---|
| **pass** | Still supported; the change is recorded |
| **human_review** | The saved answer matched the old version and is no longer supported: with `supersedes`, the newer version conflicts (source freshness); a reworded condition is shown for a person to judge |
| **block** | A required condition is lost, a condition the new version adds is missing from the saved answer, or the new version contradicts it. **Reported as warn while report-only** |
| **hold** | A linked source is unreadable or has no `version`. Never a silent pass |
| warn: **unprotected source change** | A policy-like file (`policy_change.policy_paths`; default `kb/**`, `policies/**`, `legal/**`, `help/**`, `*refund*.md`, `*terms*.md`, …) changed and no test is linked to it |

`verify-gate-policy-change.json` (hashes and statuses only) is written next to the ledger. Without `tests`, each suite case that uses the changed source is re-checked as an implicit test. A source that changed without being re-pinned still holds the Gate run itself (XYN-006). The base version is read with the GitHub contents API (`contents: read`); `xyntherium run --base <ref>` reads it with git (default `HEAD`). Draft the tests from your policy and help docs with `npx xyntherium init --policy-gate` (draft: review before trusting; `--pr` opens a pull request). Demo: [`examples/support-bot/demo/policy-change.patch`](../../examples/support-bot/demo/policy-change.patch).

## Overrides

A block can be overridden only by the `verify-gate:override` label applied by someone with write access **and** a PR comment `/verify-override <reason>`. The Gate re-runs, records the actor, reason, time and overridden findings in the signed ledger, and concludes the check **neutral — Overridden by @actor**. `policy.overrides.enabled: false` turns overrides off; `policy.overrides.require_team: org/team` restricts them. A hold cannot be overridden.

## Cost control

Runs only when relevant files change (`prompts/`, `retrieval/`, every source, `verify-gate.yml`, and your `paths`); otherwise "skipped: no relevant changes". Identical inputs reuse the prior verdict at zero units (persist `.xyntherium/cache` with `actions/cache`). Large suites: `cost.max_cases_per_run`, `cost.sample_rate`, and a nightly full run on `schedule`. The summary shows estimated monthly units.

## Inputs and outputs

Inputs: `config`, `api-key`, `mode`, `fail-on`, `upload-sarif`, `comment-pr`, `artifact-path`, `signing-key`, `github-token`, `base-url`, `cache-dir`, `full-run`, `working-directory`. Outputs: `decision`, `ledger-path`, `sarif-path`, `claims-total`, `material-failures`, `policy-changed-answers`. The v1 `fixtures` input still works when no `verify-gate.yml` exists (deprecated).

Permissions: `pull-requests: write` (comment), `checks: write` (check runs), `security-events: write` (SARIF), `contents: read` (the base version of a changed source). Without them the Gate still decides and writes its files.

## Known limitations

- **Short-sentence negation.** A sentence under five tokens that flips its source's polarity ("Monthly plans are refundable." against "Monthly plans are not refundable.") is not decided by code: local mode warns (unverifiable), never passes it as supported; hosted mode never releases it as supported.
- **Paraphrased answers in local mode.** Code settles verbatim support, verbatim qualifier loss, and one-value, negation or modality changes against a source sentence. A reworded answer that drops a condition is caught in local mode only when the golden set declares the supporting quote; hosted mode adds model-assisted analysis.
- **Live answers vary.** A missing expected claim warns by default (`missing_expected_claim: warn`), because live answers are reworded run to run.

## Examples

[`examples/support-bot`](../../examples/support-bot), [`examples/hr-assistant`](../../examples/hr-assistant) and [`examples/docs-rag`](../../examples/docs-rag) each carry a golden set, sources, a workflow and a planted regression the Gate blocks.

MIT. Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.
