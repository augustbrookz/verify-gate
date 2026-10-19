#!/usr/bin/env node
/**
 * Build the published benchmark from the raw construction shards.
 *
 *   node packages/verify-bench/scripts/build.mjs              verify-bench-v1-alpha (unchanged)
 *   node packages/verify-bench/scripts/build.mjs --v1.1       verify-bench-v1.1: v1-alpha's shards plus the
 *                                                             public-source shard, regenerated first by
 *                                                             scripts/public/generate-public.mjs
 *
 * 1. Flattens every shard in data/raw/ and re-runs the mechanical checks
 *    (gold spans verbatim, planted change, dropped qualifier, shape).
 * 2. Routes to the review queue: items failing a check, items their author
 *    flagged, and items the independent reviewer flagged
 *    (data/reviewer-flags.json). Queued items are excluded from published
 *    scores until a human resolves them.
 * 3. Assigns splits by family, never by item, so the minimal pairs built from
 *    one passage never straddle dev and held-out: sha256(family_id) mod 100 < 60
 *    is dev, the rest held-out. The rule is fixed, not tuned.
 * 4. Writes dev / held-out / review-queue files and a manifest with SHA-256s.
 *
 * Deterministic: the same raw shards always produce byte-identical output.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data');
const V11 = process.argv.includes('--v1.1');
const VERSION = V11 ? 'verify-bench-v1.1' : 'verify-bench-v1-alpha';
const SHARD_RE = V11 ? /^(?:shard-\d+|public-shard-\d+)\.json$/ : /^shard-\d+\.json$/;
const NAMES = V11
  ? { dev: 'verify-bench-v1.1.dev.json', heldout: 'verify-bench-v1.1.heldout.json', queue: 'review-queue-v1.1.json', queueItems: 'review-queue-items-v1.1.json', manifest: 'manifest-v1.1.json' }
  : { dev: 'verify-bench-v1.dev.json', heldout: 'verify-bench-v1.heldout.json', queue: 'review-queue.json', queueItems: 'review-queue-items.json', manifest: 'manifest.json' };
if (V11) execFileSync(process.execPath, [join(ROOT, 'scripts', 'public', 'generate-public.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] });

const sha = (s) => createHash('sha256').update(s).digest('hex');
const VERDICTS = new Set(['supported', 'contradicted', 'unsupported', 'unverifiable']);
const RELEASES = new Set(['allow', 'cite_required', 'revise', 'human_review']);

function splitOf(familyId) {
  return parseInt(sha(familyId).slice(0, 8), 16) % 100 < 60 ? 'dev' : 'heldout';
}

/** Mechanical problems with an item, as human-readable reasons. */
function problemsOf(it) {
  const out = [];
  const g = it.gold ?? {};
  const sources = new Map((it.sources ?? []).map((s) => [s.id, s]));
  if (!VERDICTS.has(g.verdict)) out.push(`bad gold verdict ${g.verdict}`);
  if (!RELEASES.has(g.expected_release)) out.push(`bad expected_release ${g.expected_release}`);
  for (const span of g.gold_spans ?? []) {
    const src = sources.get(span.source_id);
    if (!src || !src.text.includes(span.quote)) out.push(`gold span not verbatim in ${span.source_id}`);
  }
  if ((g.verdict === 'supported' || g.verdict === 'contradicted') && !(g.gold_spans ?? []).length) out.push(`${g.verdict} without a gold span`);
  if (it.category === 'contradicted' || it.category === 'numeric') {
    const pc = g.planted_change;
    if (!pc?.from || !pc?.to || !(g.gold_spans ?? []).some((s) => s.quote.includes(pc.from)) || !it.answer.includes(pc.to)) {
      out.push('planted change not recorded consistently');
    }
  }
  if (it.category === 'qualifier_loss') {
    const q = g.dropped_qualifier;
    if (!q || ![...sources.values()].some((s) => s.text.includes(q)) || it.answer.toLowerCase().includes(q.toLowerCase())) {
      out.push('dropped qualifier not recorded consistently');
    }
  }
  if (g.verdict === 'supported' && g.expected_release === 'revise') out.push('supported item expects revise');
  return out;
}

function clean(it, split) {
  return {
    id: it.id,
    family_id: it.family_id,
    split,
    domain: it.domain,
    category: it.category,
    subcategory: it.subcategory,
    question: it.question,
    answer: it.answer,
    sources: it.sources.map((s) => ({ id: s.id, title: s.title, text: s.text, ...(s.retrieved_at ? { retrieved_at: s.retrieved_at } : {}) })),
    ...(it.require_citations ? { require_citations: true } : {}),
    gold: {
      verdict: it.gold.verdict,
      failure_reason: it.gold.failure_reason ?? null,
      target_claim: it.gold.target_claim,
      gold_spans: it.gold.gold_spans ?? [],
      ...(it.gold.dropped_qualifier ? { dropped_qualifier: it.gold.dropped_qualifier } : {}),
      ...(it.gold.planted_change ? { planted_change: it.gold.planted_change } : {}),
      expected_release: it.gold.expected_release,
    },
    construction: {
      method: it.construction?.method ?? 'standalone',
      ...(it.construction?.base_item ? { base_item: it.construction.base_item } : {}),
      note: it.construction?.note ?? '',
    },
    ...(V11 && it.provenance ? { provenance: it.provenance } : {}),
  };
}

const shards = readdirSync(RAW).filter((f) => SHARD_RE.test(f)).sort();
const all = [];
for (const f of shards) {
  const d = JSON.parse(readFileSync(join(RAW, f), 'utf8'));
  for (const fam of d.families ?? []) for (const it of fam.items ?? []) all.push(it);
  for (const it of d.standalone ?? []) all.push(it);
}
const ids = new Set();
for (const it of all) {
  if (ids.has(it.id)) throw new Error(`duplicate item id ${it.id}`);
  ids.add(it.id);
}

let reviewerFlags = [];
try {
  reviewerFlags = JSON.parse(readFileSync(join(OUT, 'reviewer-flags.json'), 'utf8'));
} catch {
  reviewerFlags = [];
}

const queue = [];
for (const it of all) {
  for (const p of problemsOf(it)) queue.push({ item_id: it.id, source: 'construction_check', reason: p });
  if (it.ambiguity_flag) queue.push({ item_id: it.id, source: 'author_flag', reason: it.ambiguity_note || 'flagged ambiguous by its author' });
}
for (const f of reviewerFlags) {
  if (!ids.has(f.id)) continue;
  queue.push({ item_id: f.id, source: 'reviewer_flag', reason: `${f.kind}: ${f.reason}` });
}
queue.sort((a, b) => (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : a.source < b.source ? -1 : 1));
const queued = new Set(queue.map((q) => q.item_id));

const dev = [];
const heldout = [];
const queuedItems = [];
for (const it of all) {
  const split = splitOf(it.family_id);
  const row = clean(it, split);
  if (queued.has(it.id)) queuedItems.push(row);
  else (split === 'dev' ? dev : heldout).push(row);
}
const byId = (a, b) => (a.id < b.id ? -1 : 1);
dev.sort(byId);
heldout.sort(byId);
queuedItems.sort(byId);

const write = (name, value) => {
  const text = `${JSON.stringify(value, null, 1)}\n`;
  writeFileSync(join(OUT, name), text);
  return sha(text);
};
const hDev = write(NAMES.dev, dev);
const hHeld = write(NAMES.heldout, heldout);
const hQueue = write(NAMES.queue, queue);
write(NAMES.queueItems, queuedItems);

const byCategory = {};
for (const it of [...dev, ...heldout]) {
  const k = it.category === 'adversarial' ? `adversarial/${it.subcategory}` : it.category;
  byCategory[k] = (byCategory[k] ?? 0) + 1;
}
const manifest = {
  version: VERSION,
  built_from: shards,
  ...(V11
    ? {
        public_sources: [{ file: 'data/public-sources/ecfr-2026-10-01.json', source: 'eCFR point-in-time 2026-10-01', license: 'Public domain in the United States (17 U.S.C. § 105)', sha256: sha(readFileSync(join(OUT, 'public-sources', 'ecfr-2026-10-01.json'))) }],
      }
    : {}),
  split_rule: 'family-level: parseInt(sha256(family_id)[0..8], 16) % 100 < 60 => dev, else heldout',
  counts: {
    total: all.length,
    published: dev.length + heldout.length,
    in_review_queue: queued.size,
    by_split: { dev: dev.length, heldout: heldout.length },
    by_category: Object.fromEntries(Object.entries(byCategory).sort()),
  },
  sha256: { dev: hDev, heldout: hHeld, review_queue: hQueue },
};
write(NAMES.manifest, manifest);
console.log(JSON.stringify(manifest.counts, null, 2));
