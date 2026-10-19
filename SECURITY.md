# Security

## Reporting a vulnerability

Please report it privately:
- through GitHub's **Report a vulnerability** button on this repository's Security tab, or
- by email to support@xyntherium.com with "Security" in the subject.

Do not open a public issue for it. We aim to acknowledge reports within two business days and to tell you what we will do about them within ten.

**In scope:**
- this repository's code: the engine, the Gate policy, the ledger verifier, the Action, the CLI, the SDK and the MCP client;
- the hosted endpoints they call: `https://xyntherium.com/v1/verify`, `/v1/gate/verify-run`, `/v1/gate/keys` and `https://mcp.xyntherium.com/mcp`.

**Out of scope:** denial-of-service testing and social engineering.

## What the Gate sends, and where

- **Local mode** (the default) sends nothing anywhere. The Gate reads your golden set and source files in the runner, checks them with `@xyntherium/verify-core`, and writes the ledger, SARIF and summary to `.xyntherium/`.
- **Hosted mode** (`mode: hosted`, with `XYN_API_KEY`) sends the cases (question, answer and source texts) to `https://xyntherium.com/v1/gate/verify-run` over TLS. The service:
  - keeps no question, answer, source or claim text in its run records: counts, decisions and hashes only, with the repository stored as a SHA-256 of `owner/name`;
  - caches structural case results (verdicts, offsets, hashes) so identical inputs are reused;
  - signs the ledger with a Xyntherium-managed Ed25519 key, whose public keys are listed at `/v1/gate/keys`.
- **Credentials:** API keys are read only from environment variables or GitHub secrets, never from the golden set. Endpoint credentials in `verify-gate.yml` must reference `${env.NAME}`.

## Release integrity

- Release tags (`v*`) are signed with the SSH key listed in [`.github/allowed_signers`](.github/allowed_signers). To check a tag yourself:
  `git -c gpg.ssh.allowedSignersFile=.github/allowed_signers verify-tag v0.1.0`
- npm packages are published from this repository's release workflow with npm provenance. `npm audit signatures` checks them.
