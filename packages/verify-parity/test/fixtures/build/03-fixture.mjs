// Builds test/fixtures/ecfr-pairs.json from raw/pairs.json (02-pairs.mjs) and the hand labels
// (labels.json). Offline. `--show` prints the neutral sentence / word diff the labels were made
// from (a plain splitter and exact equality, not the detector).
//
//   history           a real consecutive version pair of one CFR section
//                     (identical text after metadata removal → label "none")
//   derived_cosmetic  the earlier version with only the cosmetic regions of a real amendment
//                     applied (the labelled regions), so the edit is real eCFR drafting and the
//                     pair is cosmetic only
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pairs = JSON.parse(fs.readFileSync(path.join(HERE, 'raw', 'pairs.json'), 'utf8'));
const labels = JSON.parse(fs.readFileSync(path.join(HERE, 'labels.json'), 'utf8'));
const SHOW = process.argv.includes('--show');

export const split = (t) => t.replace(/\s+/g, ' ').split(/(?<=[.;:])\s+(?=[(A-Z§])/).map((s) => s.trim()).filter(Boolean);
function lcs(A, B) {
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) ops.push(['=', A[i++], B[j++]]);
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) ops.push(['+', null, B[j++]]);
    else ops.push(['-', A[i++], null]);
  }
  return ops;
}
/** Unchanged sentences and changed regions, in order. */
function regions(before, after) {
  const out = [];
  let cur = null;
  for (const [o, x, y] of lcs(split(before), split(after))) {
    if (o === '=') {
      if (cur) out.push(cur);
      cur = null;
      out.push({ same: x });
      continue;
    }
    cur ??= { a: [], b: [] };
    if (x) cur.a.push(x);
    if (y) cur.b.push(y);
  }
  if (cur) out.push(cur);
  return out;
}
function wdiff(a, b) {
  const groups = [];
  for (const [o, x, y] of lcs(a.split(' '), b.split(' '))) {
    const w = o === '+' ? y : x;
    const last = groups[groups.length - 1];
    if (last && last.o === o) last.w.push(w);
    else groups.push({ o, w: [w] });
  }
  return groups.map(({ o, w }) => (o === '=' ? (w.length > 8 ? `${w.slice(0, 3).join(' ')} … ${w.slice(-3).join(' ')}` : w.join(' ')) : o === '-' ? `[-${w.join(' ')}-]` : `{+${w.join(' ')}+}`)).join(' ');
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const texts = {};
const ref = (s) => {
  const h = sha(s);
  texts[h] = s;
  return h;
};
const idOf = (p) => `${p.title}-${p.section}@${p.before_date}..${p.after_date}`;

const out = [];
const unlabelled = [];
for (const p of pairs) {
  const id = idOf(p);
  const base = { citation: `${p.title} CFR ${p.section}`, name: p.name.replace(/\s+/g, ' ').trim(), before_date: p.before_date, after_date: p.after_date, ecfr_substantive: p.substantive };
  if (p.identical_text) {
    out.push({ id, origin: 'history', ...base, before: ref(p.before), after: ref(p.after), label: 'none' });
    continue;
  }
  const l = labels.pairs[id];
  const rs = regions(p.before, p.after).filter((r) => !('same' in r));
  if (SHOW || !l) {
    console.log(`\n${id} ${base.name}`);
    rs.forEach((r, k) => console.log(`  r${k} [${r.a.length}→${r.b.length}] ${(r.a.join(' ').length * r.b.join(' ').length < 4e6 ? wdiff(r.a.join(' '), r.b.join(' ')) : '(region too long)').slice(0, 700)}`));
  }
  if (!l) {
    unlabelled.push(id);
    continue;
  }
  out.push({ id, origin: 'history', ...base, before: ref(p.before), after: ref(p.after), label: l.label, ...(l.cosmetic_kind ? { cosmetic_kind: l.cosmetic_kind } : {}), ...(l.expect ? { expect: l.expect } : {}), note: l.note });
  if (l.cosmetic_regions?.length) {
    // The earlier version, with only the labelled cosmetic regions taken from the later one.
    const keep = new Set(l.cosmetic_regions);
    const before = [];
    const after = [];
    let k = 0;
    for (const r of regions(p.before, p.after)) {
      if ('same' in r) {
        before.push(r.same);
        after.push(r.same);
        continue;
      }
      before.push(...r.a);
      after.push(...(keep.has(k) ? r.b : r.a));
      k++;
    }
    if (l.cosmetic_regions.some((x) => x >= k)) throw new Error(`${id}: cosmetic region out of range`);
    out.push({ id: `${id}#cosmetic`, origin: 'derived_cosmetic', ...base, before: ref(before.join(' ')), after: ref(after.join(' ')), label: 'cosmetic', cosmetic_kind: 'drafting', derived_from: id, note: `regions ${l.cosmetic_regions.join(', ')} of ${id} only` });
  }
}
if (unlabelled.length) {
  console.error(`\n${unlabelled.length} text-changed pair(s) have no label in labels.json:\n  ${unlabelled.join('\n  ')}`);
  process.exit(1);
}
const fixture = {
  about: 'Real before/after versions of US federal regulations from the eCFR point-in-time API, with hand labels. Built by test/fixtures/build/0[1-3]-*.mjs; see labels.json for the labelling rules.',
  source: 'https://www.ecfr.gov/api/versioner/v1 (Code of Federal Regulations, a work of the US Government, not subject to copyright)',
  parts: [...new Set(pairs.map((p) => `${p.title} CFR part ${p.part}`))],
  labelled_on: labels.labelled_on,
  counts: {
    history: out.filter((p) => p.origin === 'history').length,
    history_none: out.filter((p) => p.origin === 'history' && p.label === 'none').length,
    history_real: out.filter((p) => p.origin === 'history' && p.label === 'real').length,
    history_cosmetic: out.filter((p) => p.origin === 'history' && p.label === 'cosmetic').length,
    derived_cosmetic: out.filter((p) => p.origin === 'derived_cosmetic').length,
  },
  texts,
  pairs: out,
};
const dest = path.join(HERE, '..', 'ecfr-pairs.json');
fs.writeFileSync(dest, `${JSON.stringify(fixture, null, 1)}\n`);
console.log(`wrote ${path.relative(process.cwd(), dest)}: ${JSON.stringify(fixture.counts)}; ${Object.keys(texts).length} texts`);
