# @xyntherium/verify-policy

The Verify Gate release policy and ledger, shared by the GitHub Action, the CLI and the hosted API.

- **Decisions** `pass | warn | hold | block` over Verify claim results. Rules decide; a model never does. hold > block > warn > pass; a hold is never converted to a pass and never overridable.
- **Taxonomy** XYN-001 … XYN-006 and the 20 regression categories (`RULES`, `GATE_CATEGORIES`).
- **Per-claim fields** `span_valid` (deterministic), `support_assessment`, `qualifier_checks` (preserved | missing | conflicting | ambiguous), `resolved_by`, `review_required`, and `deterministic`.
- **Precision-first defaults** (`DEFAULT_POLICY`): report-only installs, block only on material contradictions and dropped qualifiers that code confirmed, model-dependent findings warn unless `model_findings: block`.
- **Gate ledger v1.0.0**: hash-chained with verify-core's formula, RFC 8785 canonicalisation, Ed25519 signatures with the key id inside the signed bytes; `verifyLedger()` checks it offline.
- **Reports**: SARIF 2.1.0 (`buildSarif`) and the Markdown summary (`renderReport`).

```ts
import { evaluateAnswer, evaluateCase, resolvePolicy } from '@xyntherium/verify-policy';
const { policy } = resolvePolicy({ enforcement: 'enforce' });
const ev = await evaluateAnswer({ question, answer, sources, expected: [], policy });
const { decision, findings } = evaluateCase({ claims: ev.claims, integrity: [], policy, mode: 'local' });
```

Policy defaults are versioned (`POLICY_VERSION`) in the public rule changelog. Evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth. MIT.
