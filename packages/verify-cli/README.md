# @xyntherium/verify-cli — `xyntherium-verify`

Verify Gate from a terminal: draft a golden set from your docs, pin sources, run the Gate locally, and check signed Gate ledgers offline.

```bash
npx @xyntherium/verify-cli init      # draft verify-gate.yml (draft: review before trusting) + the GitHub workflow
npx @xyntherium/verify-cli pin       # write each source's current sha256
npx @xyntherium/verify-cli run       # run the Gate (local mode: code only, no key)
npx @xyntherium/verify-cli ledger verify .xyntherium/verify-gate-ledger.json --public-key gate.pub
npx @xyntherium/verify-cli keygen --out gate.key   # Ed25519 key for XYN_GATE_SIGNING_KEY; the private key is never printed
```

`init --pr` opens a pull request so a person approves the drafted questions. `run` reads `XYN_API_KEY` for hosted mode and `XYN_GATE_SIGNING_KEY` to sign. `ledger verify` accepts `--keys https://xyntherium.com/v1/gate/keys` for hosted ledgers, `--allow-embedded-key` for an internal-consistency check only, and `--require-signature`.

A valid signature establishes integrity and origin for the signed record. It does not establish that the instruction, evidence, claims, policy, action, or outcome is true, lawful, complete, authorized, or appropriate.

Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth. MIT.

### Document change mode

```bash
npx xyntherium init --policy-gate [--pr]   # draft sources, tests and required conditions from kb/, policies/, legal/, help/, *refund*.md …
npx xyntherium run --base main             # a changed policy re-runs its linked tests: "Policy changed: N answers need review"
```

`init --policy-gate` turns each policy statement that carries a condition into a test (the statement is the saved answer; its deadline, eligibility rule, exception, scope, modality, negation or quantity are the required conditions, verbatim), marked `draft: true` — review before trusting. `run --base <git-ref>` (default `HEAD`, so an uncommitted edit is caught) compares each source with its version at `<ref>` and lists changed files with git for the "unprotected source change" warning. Details in `.xyntherium/verify-gate-policy-change.json` and the summary. Report-only unless `policy_change.enforcement: enforce`. `xyntherium` and `xyntherium-verify` are the same command.
