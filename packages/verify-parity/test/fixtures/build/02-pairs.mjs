// Consecutive version pairs of amended sections (eCFR point-in-time starts 2017-01-03),
// both texts fetched; editorial (substantive=false) and substantive amendments both kept.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, sectionUrl, versionsUrl, xmlToText, calls } from './ecfr.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTS = [['16', '310'], ['16', '429'], ['29', '825'], ['34', '668'], ['47', '64'], ['12', '1030'], ['7', '273']];
const MAX = Number(process.env.MAX_PAIRS ?? 90);
const cands = [];
for (const [t, p] of PARTS) {
  const j = JSON.parse(await get(versionsUrl(t, p), `versions/title-${t}-part-${p}.json`));
  const secs = j.content_versions.filter((v) => v.type === 'section' && !v.removed);
  const by = new Map();
  for (const v of secs) by.set(v.identifier, [...(by.get(v.identifier) ?? []), v]);
  for (const [id, vs] of by) {
    vs.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < vs.length; i++) {
      if (vs[i - 1].date < '2017-01-03') continue;
      cands.push({ title: t, part: p, section: id, name: vs[i].name, before_date: vs[i - 1].date, after_date: vs[i].date, substantive: vs[i].substantive });
    }
  }
}
// Spread over parts and both kinds of amendment; deterministic order.
cands.sort((a, b) => (a.part + a.section + a.after_date < b.part + b.section + b.after_date ? -1 : 1));
const editorial = cands.filter((c) => !c.substantive);
const substantive = cands.filter((c) => c.substantive);
console.log(`candidates: ${cands.length} (editorial ${editorial.length}, substantive ${substantive.length})`);
const pick = (arr, n) => {
  const byPart = new Map();
  for (const c of arr) byPart.set(c.part, [...(byPart.get(c.part) ?? []), c]);
  const out = [];
  while (out.length < n && [...byPart.values()].some((a) => a.length)) for (const a of byPart.values()) if (a.length && out.length < n) out.push(a.shift());
  return out;
};
const chosen = [...pick(editorial, Math.round(MAX * 0.4)), ...pick(substantive, Math.round(MAX * 0.6))];
const pairs = [];
for (const c of chosen) {
  const before = xmlToText(await get(sectionUrl(c.before_date, c.title, c.part, c.section), `sections/${c.section}@${c.before_date}.xml`));
  const after = xmlToText(await get(sectionUrl(c.after_date, c.title, c.part, c.section), `sections/${c.section}@${c.after_date}.xml`));
  if (before.length > 15000 || after.length > 15000) continue;
  pairs.push({ ...c, before, after, identical_text: before === after });
}
fs.writeFileSync(path.join(HERE, 'raw', 'pairs.json'), JSON.stringify(pairs, null, 1));
console.log(`pairs kept (<= 15000 chars): ${pairs.length}; identical text: ${pairs.filter((p) => p.identical_text).length}; editorial ${pairs.filter((p) => !p.substantive).length}; network calls ${calls}`);
