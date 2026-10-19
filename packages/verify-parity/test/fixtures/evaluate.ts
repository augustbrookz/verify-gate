/**
 * Scores source change detection on the eCFR fixture (real amendment history, cosmetic
 * edits derived from it) and on labelled synthetic edits of the same texts. Shared by
 * ecfr-fixtures.test.ts and build/04-report.ts, so the committed report is what the code
 * computes.
 *
 * Positive = the detector says "real". Precision and recall are on real changes; a
 * "none" (identical text) or "cosmetic" label is a negative.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilson } from '@xyntherium/verify-core';
import { detectSourceChange, PARITY_VERSION, type NamedChange, type SourceChange } from '@xyntherium/verify-parity';
import { ALL_COSMETIC, CONSERVATIVE, COSMETIC, REAL, type Named, type Transform } from './synthetic';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PATH = path.join(HERE, 'ecfr-pairs.json');
export const REPORT_PATH = path.join(HERE, 'report.json');
const AT = '2026-10-18T00:00:00.000Z';

interface Expect {
  amount?: [string, string];
  citation?: string;
  added?: boolean;
  removed?: boolean;
  exception_added?: boolean;
}
interface Pair {
  id: string;
  origin: 'history' | 'derived_cosmetic';
  citation: string;
  before: string;
  after: string;
  label: 'none' | 'cosmetic' | 'real';
  cosmetic_kind?: string;
  expect?: Expect;
}
interface Fixture {
  texts: Record<string, string>;
  pairs: Pair[];
}

export function loadFixture(): { fixture: Fixture; sha256: string } {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return { fixture: JSON.parse(raw) as Fixture, sha256: crypto.createHash('sha256').update(raw).digest('hex') };
}

const numbers = (s: string | null) => ((s ?? '').replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const addedAny = (r: SourceChange) => r.changes.some((c) => c.type === 'sentence_added' || c.type === 'condition_added') || r.counts.added > 0;
const removedAny = (r: SourceChange) => r.changes.some((c) => c.type === 'sentence_removed' || c.type === 'condition_removed') || r.counts.removed > 0;
/** A named change carries the before and after figures. */
const figures = (cs: NamedChange[], [a, b]: [string, string]) => cs.some((c) => numbers(c.before).includes(Number(a)) && numbers(c.after).includes(Number(b)));

/** Whether what a reviewer needs is named. */
function namedHistory(r: SourceChange, e: Expect): boolean {
  if (e.amount && !figures(r.changes, e.amount)) return false;
  if (e.citation && !r.changes.some((c) => c.type === 'citation_changed' && (c.after ?? '').includes(e.citation as string))) return false;
  if (e.added && !addedAny(r)) return false;
  if (e.removed && !removedAny(r)) return false;
  if (e.exception_added && !r.changes.some((c) => (c.type === 'condition_added' || c.type === 'condition_changed') && c.class === 'exception')) return false;
  return true;
}

function namedSynthetic(r: SourceChange, e: Named, fig?: [string, string]): boolean {
  switch (e) {
    case 'amount':
      return figures(r.changes, fig as [string, string]);
    case 'period':
      // Named with its figures (as a deadline, quantity or eligibility condition, or a value).
      return figures(r.changes, fig as [string, string]);
    case 'negation':
      return r.changes.some((c) => c.type === 'negation_changed' || c.type === 'modality_changed');
    case 'modality':
      return r.changes.some((c) => c.type === 'modality_changed');
    case 'exception_removed':
      return r.changes.some((c) => (c.type === 'condition_removed' || c.type === 'condition_changed') && c.class === 'exception');
    case 'citation':
      return r.changes.some((c) => c.type === 'citation_changed');
    case 'removed':
      return removedAny(r);
    case 'wording':
      return r.changes.length > 0;
  }
}

const rate = (k: number, n: number) => {
  const w = wilson(k, n);
  const r = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);
  return { k, n, p: r(w.p), lo95: r(w.lo), hi95: r(w.hi) };
};

export function evaluate() {
  const { fixture, sha256 } = loadFixture();
  const text = (h: string) => fixture.texts[h];
  const detect = (before: string, after: string) => detectSourceChange({ before, after, captured_at: AT, include_text: true });

  // Amendment history.
  const history = fixture.pairs.filter((p) => p.origin === 'history');
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const misses: string[] = [];
  const falseFlags: { id: string; label: string; cosmetic_kind: string | null; named: string[] }[] = [];
  const noneNotNone: string[] = [];
  const naming = { checked: 0, named: 0, failures: [] as string[] };
  const byLabel: Record<string, Record<string, number>> = {};
  for (const p of history) {
    const r = detect(text(p.before), text(p.after));
    (byLabel[p.label] ??= {})[r.kind] = (byLabel[p.label][r.kind] ?? 0) + 1;
    const flagged = r.kind === 'real';
    if (p.label === 'none' && r.kind !== 'none') noneNotNone.push(p.id);
    if (p.label === 'real' && flagged) tp++;
    else if (p.label === 'real') {
      fn++;
      misses.push(p.id);
    } else if (flagged) {
      fp++;
      falseFlags.push({ id: p.id, label: p.label, cosmetic_kind: p.cosmetic_kind ?? null, named: [...new Set(r.changes.map((c) => c.type))].sort() });
    } else tn++;
    if (p.label === 'real' && p.expect && flagged) {
      naming.checked++;
      if (namedHistory(r, p.expect)) naming.named++;
      else naming.failures.push(p.id);
    }
  }

  // Cosmetic-only edits derived from real amendments.
  const derived = fixture.pairs.filter((p) => p.origin === 'derived_cosmetic');
  const derivedFlagged = derived.filter((p) => detect(text(p.before), text(p.after)).kind === 'real').map((p) => p.id);

  // Synthetic edits of each section's latest text.
  const latest = new Map<string, string>();
  for (const p of history) latest.set(p.citation, text(p.after));
  const bases = [...latest.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const synth = (ts: Transform[], expectFlag = false) => {
    const by: Record<string, { cases: number; flagged: number; named?: number; failures: string[] }> = {};
    for (const t of ts) {
      const row = (by[t.id] = { cases: 0, flagged: 0, ...(t.kind === 'real' ? { named: 0 } : {}), failures: [] as string[] });
      for (const [citation, base] of bases) {
        const edit = t.apply(base);
        if (!edit) continue;
        row.cases++;
        const r = detect(base, edit.text);
        const flagged = r.kind === 'real';
        if (flagged) row.flagged++;
        if (t.kind === 'cosmetic' && flagged !== expectFlag) row.failures.push(citation);
        if (t.kind === 'real') {
          if (!flagged) row.failures.push(citation);
          else if (namedSynthetic(r, t.expect as Named, edit.figures)) row.named = (row.named ?? 0) + 1;
          else row.failures.push(`${citation} (not named)`);
        }
      }
    }
    const rows = Object.values(by);
    return { cases: rows.reduce((a, r) => a + r.cases, 0), flagged: rows.reduce((a, r) => a + r.flagged, 0), named: rows.reduce((a, r) => a + (r.named ?? 0), 0), by_transform: by };
  };
  const cosmetic = synth([...COSMETIC, ALL_COSMETIC]);
  const conservative = synth(CONSERVATIVE, true);
  const real = synth(REAL);

  return {
    parity_version: PARITY_VERSION,
    fixture_sha256: sha256,
    history: {
      pairs: history.length,
      labels: { real: tp + fn, cosmetic: history.filter((p) => p.label === 'cosmetic').length, none: history.filter((p) => p.label === 'none').length },
      detected_by_label: byLabel,
      confusion: { tp, fp, fn, tn },
      precision: rate(tp, tp + fp),
      recall: rate(tp, tp + fn),
      identical_text_not_none: noneNotNone,
      misses,
      false_flags: falseFlags,
      naming: { ...naming, rate: rate(naming.named, naming.checked) },
    },
    derived_cosmetic: { pairs: derived.length, flagged: derivedFlagged.length, flagged_ids: derivedFlagged },
    synthetic: {
      bases: bases.length,
      cosmetic: { cases: cosmetic.cases, flagged: cosmetic.flagged, by_transform: cosmetic.by_transform },
      /** Meaning-preserving but flagged by design (spelling is not tolerated); failures = not flagged. */
      conservative: { cases: conservative.cases, flagged: conservative.flagged, by_transform: conservative.by_transform },
      real: { cases: real.cases, flagged: real.flagged, named: real.named, recall: rate(real.flagged, real.cases), by_transform: real.by_transform },
    },
  };
}
export type Report = ReturnType<typeof evaluate>;
