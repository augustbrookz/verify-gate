# How the Verify benchmark items are constructed

This file is the construction procedure for `verify-bench` alpha items. It is
published so anyone can audit how every label was made, and regenerate or extend
the set the same way.

## The principle: labels come from construction, not from judgement

No model under test ever decides a label. Every item is built as a **minimal
pair**: start from a passage and a claim that the passage supports, then make
exactly one change whose effect on the label is known in advance. The change is
recorded on the item (`planted_change`, `dropped_qualifier`, `gold_spans`) so a
script can check it mechanically.

If an item cannot be made unambiguous by construction, the author sets
`ambiguity_flag: true` with a note. Flagged items go to the review queue and are
excluded from published scores until a human resolves them. An independent
reviewer pass flags further items the same way. Flagging is cheap; a wrong
label is expensive. When in doubt, flag.

Verdicts describe the **supplied evidence**, never the world. "Supported" means
the passages support the claim. It does not mean the claim is true.

## Source text

- All source passages are **self-written** about **fictional** organisations
  and products (for example "Lumora Cloud", "Brightwell Mutual"). Never use a
  real company, product, person, or URL. Never copy text from anywhere.
- Passages read like real policy pages, plan/pricing pages, product docs, and
  help-centre articles: headings optional, plain prose and short lists, 120–400
  words each.
- Each family has 1–2 **evidence** passages plus 1–2 **distractor** passages: on
  the same topic or company, plausible, but irrelevant to the target claim. RAG
  systems retrieve distractors; the benchmark should too.
- Passage text is plain text. Use straight ASCII quotes and hyphens in passages
  (curly quotes in answers are allowed — normalisation is part of what is tested).

## Item shape

One JSON object per item. Required fields:

| field | meaning |
|---|---|
| `id` | `<family_id>-<variant>`, unique, lowercase, `[a-z0-9-]` |
| `family_id` | the minimal-pair group, e.g. `s3-f2`; standalone adversarial items use `s3-a5` |
| `domain` | short snake_case domain label |
| `category` | `supported` \| `contradicted` \| `qualifier_loss` \| `unsupported` \| `unverifiable` \| `adversarial` |
| `subcategory` | see the tables below |
| `question` | what the user asked the RAG system |
| `answer` | the AI answer under test. **One sentence containing exactly one checkable claim.** No hedging preamble, no second fact. |
| `sources` | `[{ "id": "S1", "title": "...", "text": "...", "retrieved_at": "YYYY-MM-DD" (optional) }]` — evidence and distractors together, order shuffled |
| `require_citations` | `true` only for `citation_wrong_sentence` items, otherwise omit or `false` |
| `gold.verdict` | `supported` \| `contradicted` \| `unsupported` \| `unverifiable` |
| `gold.failure_reason` | `null` for supported; otherwise one of the reasons below |
| `gold.target_claim` | the atomic claim the label applies to, restated as one sentence |
| `gold.gold_spans` | `[{ "source_id": "S1", "quote": "..." }]` — each `quote` must appear **verbatim, character for character** in that source's `text` |
| `gold.dropped_qualifier` | qualifier_loss only: the verbatim qualifier text from the source that the answer omits |
| `gold.planted_change` | contradicted only: `{ "from": "<value in source>", "to": "<value in answer>" }` — `from` appears verbatim in the gold span, `to` appears verbatim in the answer |
| `gold.expected_release` | `allow` \| `cite_required` \| `revise` \| `human_review` |
| `construction.method` | `minimal_pair` or `standalone` |
| `construction.base_item` | for a minimal-pair variant, the id of the supported item it was derived from |
| `construction.note` | one line: what was changed and why the label follows |
| `ambiguity_flag` | `true` sends the item to human review |
| `ambiguity_note` | why, when flagged |

Failure reasons: `qualifier_loss`, `no_support`, `number_mismatch`,
`date_mismatch`, `entity_mismatch`, `negation`, `scope_mismatch`, `comparative`,
`out_of_scope`, `conflicting_sources`, `superseded`, `multi_hop`,
`missing_input`, `citation_mismatch`.

Expected release follows the published rules: supported → `allow` (or
`cite_required` when citations were required and are wrong or missing);
contradicted, qualifier loss and unsupported → `revise`; unverifiable →
`human_review`.

## Core variants (every family)

Write the **base claim** first: a sentence the evidence states directly and that
carries at least one material qualifier (a condition, scope, date range,
eligibility rule or limit). Then derive:

| variant id suffix | category / subcategory | how | gold |
|---|---|---|---|
| `sup-verbatim` | supported / `verbatim` | answer copies a clause of the evidence (minor framing like "Yes," is not allowed — keep it one bare sentence) | supported; gold span = the copied text |
| `sup-paraphrase` | supported / `paraphrase` | meaning-preserving restatement: voice, word order, synonyms for non-qualifier words. Numbers, dates, units, conditions and scope stay exactly equivalent (`2 weeks` ↔ `14 days` is fine; `a month` ↔ `30 days` is **not**) | supported; gold span = the evidence text restated |
| `con-<type>` | contradicted / `number` \| `date` \| `entity_swap` \| `negation` | the base claim with **one** planted change: a different number, a different date, a swapped entity that the evidence assigns a different value to, or inverted polarity | contradicted; reason `number_mismatch` / `date_mismatch` / `entity_mismatch` / `negation`; gold span = evidence text containing the original value |
| `ql-<type>` | qualifier_loss / `condition` \| `scope` \| `date_range` | the base claim with the material qualifier **deleted** and nothing else changed | unsupported; reason `qualifier_loss`; `dropped_qualifier` verbatim; gold span = evidence text containing fact and qualifier |
| `unsup` | unsupported / `plausible_unaddressed` | a plausible claim on the same topic, of the kind similar documents often contain, that **no passage addresses at all** (check the distractors too). Not obviously off-topic | unsupported; reason `no_support`; `gold_spans: []` |
| `unver-<type>` | unverifiable / `comparative` \| `out_of_scope` | `comparative`: compares the organisation to competitors, the market, or past years the passages do not describe ("faster than most providers"). `out_of_scope`: a judgement or prediction the passages cannot settle ("will remain free forever", "is the best choice for small teams") | unverifiable; reason `comparative` / `out_of_scope`; `gold_spans: []` |

Each family in your shard uses the contradicted and qualifier-loss subtypes you
were assigned, so totals stay balanced.

## Adversarial items

| subcategory | how to build it | gold |
|---|---|---|
| `wrong_entity` | a fact that is correct for entity A, stated about entity B, where the evidence gives B a **different** value | contradicted, `entity_mismatch` |
| `wrong_date` | a correct fact attached to the wrong date or period, where the evidence states the date | contradicted, `date_mismatch` |
| `wrong_scope` | a fact the evidence states for one group (e.g. "EU customers"), claimed for a different group the evidence does not cover | unsupported, `scope_mismatch` (use contradicted only if the evidence explicitly excludes the claimed group) |
| `multi_hop` | a claim that needs two passages **plus an unstated bridging assumption**; no single span says it, and the passages do not jointly entail it | unsupported, `multi_hop`; gold spans = the two partial spans |
| `contradictory_sources` | two evidence passages state different values for the same fact, with no dates or supersession language to prefer either; the answer states one of them | unverifiable, `conflicting_sources`; gold spans = both conflicting spans |
| `stale_superseded` | an older passage states X; a newer passage explicitly supersedes it ("Updated March 2026: ... replaces ...", with `retrieved_at` dates consistent); the answer states the stale X | contradicted, `superseded`; gold span = the superseding text |
| `citation_wrong_sentence` | the answer is supported by S1 but cites `[S2]`; set `require_citations: true` | supported, `citation_mismatch`; expected_release `cite_required`; gold span = the S1 text |
| `arithmetic_missing_input` | the answer states a computed figure (a total, difference, or percentage) that needs an input the passages never give | unsupported, `missing_input` |
| `cherry_picked` | a fragment of the evidence, read alone, seems to support the claim, but the full sentence or the next sentence negates or limits it ("Some users report X works offline; however, offline mode is not supported") | contradicted, `negation`, if the context negates; unsupported, `qualifier_loss`, if it only limits — say which in the note |

## Self-check before you finish

For every item:

1. Each `gold_spans[].quote` occurs verbatim in the named source (copy-paste it).
2. The answer is one sentence with one checkable claim.
3. For `contradicted`, `planted_change.from` is inside the gold span and `planted_change.to` is inside the answer, and nothing else differs from the base claim.
4. For `qualifier_loss`, `dropped_qualifier` occurs verbatim in the evidence, does **not** occur in the answer, and the answer is otherwise the base claim.
5. For `unsupported` / `no_support`, search every passage, distractors included — nothing addresses the claim.
6. A careful human with only these passages would give the same label. If not, set `ambiguity_flag`.
