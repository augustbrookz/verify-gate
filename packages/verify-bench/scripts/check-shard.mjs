#!/usr/bin/env node
/**
 * Mechanical self-check for one raw construction shard (see CONSTRUCTION.md).
 * Usage: node packages/verify-bench/scripts/check-shard.mjs <shard.json>
 *
 * Checks only what code can check: shape, verbatim gold spans, the planted
 * change, the dropped qualifier. Exits 1 and lists every problem it finds.
 */
import { readFileSync } from 'node:fs';

const CATEGORIES = new Set(['supported', 'contradicted', 'qualifier_loss', 'unsupported', 'unverifiable', 'adversarial']);
const VERDICTS = new Set(['supported', 'contradicted', 'unsupported', 'unverifiable']);
const RELEASES = new Set(['allow', 'cite_required', 'revise', 'human_review']);
const REASONS = new Set([
  'qualifier_loss', 'no_support', 'number_mismatch', 'date_mismatch', 'entity_mismatch', 'negation',
  'scope_mismatch', 'comparative', 'out_of_scope', 'conflicting_sources', 'superseded', 'multi_hop',
  'missing_input', 'citation_mismatch',
]);

const path = process.argv[2];
if (!path) {
  console.error('usage: check-shard.mjs <shard.json>');
  process.exit(2);
}

const shard = JSON.parse(readFileSync(path, 'utf8'));
const items = (shard.families ?? []).flatMap((f) => f.items ?? []).concat(shard.standalone ?? []);
const problems = [];
const ids = new Set();
const bad = (id, msg) => problems.push(`${id}: ${msg}`);

for (const it of items) {
  const id = it.id ?? '(missing id)';
  if (!/^[a-z0-9-]+$/.test(id)) bad(id, 'id must match [a-z0-9-]+');
  if (ids.has(id)) bad(id, 'duplicate id');
  ids.add(id);
  for (const k of ['family_id', 'domain', 'category', 'subcategory', 'question', 'answer', 'sources', 'gold', 'construction']) {
    if (it[k] == null) bad(id, `missing ${k}`);
  }
  if (!CATEGORIES.has(it.category)) bad(id, `bad category ${it.category}`);
  const g = it.gold ?? {};
  if (!VERDICTS.has(g.verdict)) bad(id, `bad gold.verdict ${g.verdict}`);
  if (!RELEASES.has(g.expected_release)) bad(id, `bad gold.expected_release ${g.expected_release}`);
  if (g.verdict === 'supported' && g.failure_reason && g.failure_reason !== 'citation_mismatch') {
    bad(id, 'supported items carry no failure_reason (except citation_mismatch)');
  }
  if (g.verdict !== 'supported' && !REASONS.has(g.failure_reason)) bad(id, `bad failure_reason ${g.failure_reason}`);
  if (typeof g.target_claim !== 'string' || g.target_claim.length < 8) bad(id, 'missing target_claim');
  const sources = new Map((it.sources ?? []).map((s) => [s.id, s]));
  if (sources.size < 1) bad(id, 'no sources');
  for (const s of it.sources ?? []) {
    if (!s.id || !s.title || typeof s.text !== 'string' || s.text.length < 80) bad(id, `source ${s.id} incomplete or too short`);
  }
  for (const span of g.gold_spans ?? []) {
    const src = sources.get(span.source_id);
    if (!src) bad(id, `gold span cites unknown source ${span.source_id}`);
    else if (!src.text.includes(span.quote)) bad(id, `gold span not verbatim in ${span.source_id}: "${String(span.quote).slice(0, 60)}"`);
  }
  if (['supported', 'contradicted'].includes(g.verdict) && (g.gold_spans ?? []).length === 0) {
    bad(id, `${g.verdict} needs at least one gold span`);
  }
  if (it.category === 'contradicted') {
    const pc = g.planted_change;
    if (!pc?.from || !pc?.to) bad(id, 'contradicted needs planted_change {from,to}');
    else {
      if (!(g.gold_spans ?? []).some((s) => s.quote.includes(pc.from))) bad(id, 'planted_change.from not inside any gold span');
      if (!it.answer.includes(pc.to)) bad(id, 'planted_change.to not inside the answer');
    }
  }
  if (it.category === 'qualifier_loss') {
    const q = g.dropped_qualifier;
    if (!q) bad(id, 'qualifier_loss needs dropped_qualifier');
    else {
      const inEvidence = [...sources.values()].some((s) => s.text.includes(q));
      if (!inEvidence) bad(id, 'dropped_qualifier not verbatim in any source');
      if (it.answer.toLowerCase().includes(q.toLowerCase())) bad(id, 'dropped_qualifier still present in the answer');
    }
  }
  if (it.require_citations && !/\[[^\]]+\]/.test(it.answer)) bad(id, 'require_citations item has no [citation] in the answer');
}

const counts = {};
for (const it of items) counts[`${it.category}/${it.subcategory}`] = (counts[`${it.category}/${it.subcategory}`] ?? 0) + 1;

console.log(JSON.stringify({ file: path, items: items.length, problems: problems.length, counts }, null, 2));
if (problems.length) {
  for (const p of problems) console.log(`PROBLEM ${p}`);
  process.exit(1);
}
