# @xyntherium/verify-parity

State parity audit for Xyntherium Verify. Pure functions: no clock, no environment, no network. It never changes a verification verdict.

- **Snapshots.** `captureSnapshot(schema, values, { captured_at })` takes every value as an explicit parameter, including the capture time, and refuses unknown or missing fields. Each snapshot carries two SHA-256 digests of RFC 8785 (JCS) bytes: `parity_sha256` covers the exact and tolerance fields, and `sha256` covers everything. `verifySnapshot()` recomputes both. Each field has one mode:
  - `exact`: compared after canonicalising by kind. Kinds are `number`, `date`, `deadline`, `condition`, `citation` and `json`.
  - `tolerance`: text with formatting removed (Unicode forms, quotes, dashes, whitespace, line breaks, hyphenation, case and punctuation), plus a few drafting equivalences: "shall" / "must", "thirty (30)" / "30", "e-mail" / "email", "per cent" / "%" and "section" / "§". Spelling is not tolerated, because a one-letter edit can be a real one ("employer" / "employee").
  - `excluded`: metadata. It is recorded in the snapshot but never compared.
- **Use 1, source change detection.** `detectSourceChange({ before, after, captured_at })` captures each sentence and list item as a `source-sentence@1` snapshot:
  - exact fields: conditions, amounts and periods, dates, negations, modal classes and citations;
  - tolerance: the text;
  - excluded: the paragraph designator and the position.

  It aligns the sentences of the two versions and returns `none`, `cosmetic` or `real`. Each real change is named, with its words:
  - `condition_added`, `condition_removed` or `condition_changed`, with the condition's class (deadline, exception, scope, eligibility or quantity);
  - `value_changed`, `date_changed`, `negation_changed`, `modality_changed` or `citation_changed`;
  - `sentence_added` or `sentence_removed`;
  - `wording_changed`, when only the words moved.

  Texts are left out unless `include_text`. `documentParityHash(text, captured_at)` is equal for two versions that differ only in formatting.
- **Use 2, disagreement triage.** `triageDisagreement(runs, policy?)` takes runs that each record the parity hash of every source they saw.
  - Runs that disagree on different snapshots are an infrastructure fault. They route to `REEVAL`, so the runs are repeated on one snapshot.
  - Runs that disagree on identical snapshots are a genuine disagreement. They route per policy (default `human_review`).
- **Ledger records.** `sourceChangeRecord()` and `triageRecord()` produce the entries that Verify Gate's hash-chained ledger carries as kind `parity` (ledger 1.1.0, `schemas/verify-gate-ledger-1.1.0.schema.json`). Text is referenced by SHA-256 unless the run includes text.

```ts
import { detectSourceChange } from '@xyntherium/verify-parity';
const change = detectSourceChange({ before: oldPolicy, after: newPolicy, captured_at: run.created_at });
// change.kind: 'none' | 'cosmetic' | 'real'
// change.changes: [{ type: 'condition_changed', class: 'deadline', before: 'within 30 days of purchase', after: 'within 14 days of purchase' }]
```

Verify Gate's document change mode uses both:
- Use 1 runs on every changed source. A cosmetic-only change passes its linked tests, with the reason recorded.
- Use 2 runs when a test's verdict differs from the previous run's.
- Both results go into the ledger.

## Fixture results

The fixtures are real before/after versions of 43 sections of six CFR parts, taken from the eCFR point-in-time API (12 CFR 1030, 16 CFR 310, 29 CFR 825, 34 CFR 668, 47 CFR 64 and 7 CFR 273). I labelled each pair by hand from a neutral diff, not from the detector's output; `test/fixtures/build/labels.json` has the labelling rules. `test/fixtures/report.json` holds the scores, and `test/ecfr-fixtures.test.ts` recomputes them and fails if the file is stale.

| Set | Cases | Result |
| --- | --- | --- |
| Amendment history: real changes | 37 | 37 detected. Recall 1.00 (95% CI 0.91–1.00). The figure, citation or provision a reviewer needs is named in 32 of 32 checked. |
| Amendment history: all flags | 40 | Precision 0.925 (37/40, 95% CI 0.80–0.97). The 3 false flags are the hand-labelled renames: "this Rule" → "this part" (twice, once with renumbered footnote markers) and "food stamp" → "SNAP". |
| Amendment history: identical text after metadata removal | 58 | 58 `none`. |
| Cosmetic-only edits taken from those amendments (dash style, re-lettered paragraphs) | 8 | 0 flagged. |
| Synthetic formatting and drafting edits of the same texts (12 kinds, plus all at once) | 360 | 0 flagged. |
| Synthetic real edits (an amount, a period, a negation, a modal, a removed exception, a citation, a removed sentence, a one-letter party swap) | 176 | 176 flagged, 176 named. |
| Synthetic typo fixes | 43 | 43 flagged as wording changes (by design). |

Limitations:
- A rename is a different word for the same thing, and the detector can't tell it from a different thing. It is flagged as a wording change. This is conservative: the change goes to a reviewer, never silently through.
- A typo fix is flagged the same way.
- Condition wording is reported in the canonical drafting form, so "shall" appears as "must" and "section 4" as "§ 4".

To rebuild the fixtures:
1. `node test/fixtures/build/01-versions.mjs`
2. `node test/fixtures/build/02-pairs.mjs`. Steps 1 and 2 fetch from www.ecfr.gov and cache under `raw/`, which is gitignored.
3. `node test/fixtures/build/03-fixture.mjs`. Add `--show` to print the diffs the labels were made from.
4. `npx tsx test/fixtures/build/04-report.ts`

The CFR text is a work of the US Government and is not subject to copyright. The package is MIT licensed.
