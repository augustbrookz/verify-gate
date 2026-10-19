# Xyntherium Verify Gate

Fail the pull request when your AI's answers stop being supported by your approved sources.

This is the GitHub Marketplace copy of the Action. The source, tests, issues and releases live in **[augustbrookz/verify-gate](https://github.com/augustbrookz/verify-gate)**. Both repositories run identical code at the same version (`dist/SOURCE.json` records the bundle's SHA-256), so `uses: augustbrookz/verify-gate@v0` and `uses: augustbrookz/verify-gate-action@v0` are interchangeable.

## What it does

You keep a small golden set (`verify-gate.yml`): questions, the answers your assistant gives, and the source files those answers must stay true to. On every pull request the Gate checks each answer against its sources and reports:

- answers that drop a condition, an exception, a date or a limit the source states;
- numbers and dates that no longer match the source;
- text the sources do not support;
- sources that changed since you last approved them (re-pin to clear).

It posts one pull-request comment, uploads SARIF to code scanning and writes a ledger file. It starts in report-only mode, so it never blocks a merge until you set `policy.enforcement: enforce`.

Verdicts describe whether the supplied sources support an answer, not whether the answer is true, and are not a compliance certification.

## Quick start

```bash
npx @xyntherium/verify-cli init
```

writes `verify-gate.yml` and `.github/workflows/verify-gate.yml` from your repository. Or add the step yourself:

```yaml
name: Verify Gate
on: pull_request
permissions:
  contents: read
  pull-requests: write
  checks: write
  security-events: write
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: augustbrookz/verify-gate-action@v0
        with:
          config: verify-gate.yml
```

Local mode (the default) runs code only: no key, nothing leaves the runner. Hosted mode (`mode: hosted`, `api-key: ${{ secrets.XYN_API_KEY }}`) adds model-assisted claim splitting; plans at https://xyntherium.com/pricing.

Every input is documented in [`action.yml`](action.yml) and at https://xyntherium.com/developers.

## Security

See [SECURITY.md](SECURITY.md) and https://xyntherium.com/security. Report vulnerabilities by email to support@xyntherium.com with "Security" in the subject.

MIT licensed.
