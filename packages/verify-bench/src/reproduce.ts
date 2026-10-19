/**
 * Reproduce a published verify-bench v1.1 run (the numbers on /verify/benchmark).
 *
 *   npx -y -p @xyntherium/verify-core@<version> -p @xyntherium/verify-bench verify-bench-reproduce
 *
 * Runs the INSTALLED @xyntherium/verify-core (code only: no model, no network, no key) on all
 * 2,040 published items, both splits, through the guarded held-out loader; scores them with the
 * published scorer; prints the held-out figures with their 95% Wilson intervals; and compares
 * every prediction with the published results files for each rules version. Exit code 0 when
 * the installed rules version reproduces its published run exactly, 1 otherwise.
 *
 * The v1.1 held-out split has been scored once per rules version since 1.0.0, so it is no
 * longer an untouched test set; that is why its items and labels are public. A fresh held-out
 * set, whose labels are not published, ships with benchmark v1.2.
 *
 * Runs no model and tunes nothing: it only re-runs frozen, published rule versions.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { RULES_VERSION, runEngine } from '@xyntherium/verify-core';
import { loadDevV11 } from './dataset-v11';
import { loadHeldoutV11ForFinalEvaluation, PREREGISTRATION_V11 } from './heldout-v11';
import { aggregateVerdict, scoreMethod, type Rate } from './score';
import type { BenchItem, Prediction } from './types';

const RESULTS = new URL('../results/', import.meta.url);
const KEYS = ['false_supported_rate', 'unsupported_release_rate', 'supported_recall', 'qualifier_loss_detection', 'contradiction_detection', 'abstention_rate'] as const;
const LABEL: Record<(typeof KEYS)[number], string> = {
  false_supported_rate: 'flawed answers wrongly approved (false-supported)',
  unsupported_release_rate: 'unsupported answers released',
  supported_recall: 'supported answers released (recall)',
  qualifier_loss_detection: 'dropped conditions caught',
  contradiction_detection: 'contradictions caught',
  abstention_rate: 'sent to a person (abstention)',
};

interface Published {
  rules_version: string;
  report: { by_split: { heldout: Record<string, Rate> } };
  predictions: Prediction[];
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const fmt = (r: Rate) => `${r.k} of ${r.n} = ${pct(r.p)} (95% CI ${pct(r.lo)}–${pct(r.hi)})`;
const same = (a: Prediction, b: Prediction) =>
  a.predicted_verdict === b.predicted_verdict && a.predicted_reason === b.predicted_reason && a.predicted_release === b.predicted_release && a.qualifier_loss_flag === b.qualifier_loss_flag;

async function predict(items: BenchItem[]): Promise<Prediction[]> {
  const out: Prediction[] = [];
  for (const it of items) {
    const r = await runEngine({ question: it.question, answer: it.answer, sources: it.sources, options: { require_citations: !!it.require_citations } }, {});
    const agg = aggregateVerdict(r.claims);
    out.push({ item_id: it.id, method: 'code_only', predicted_verdict: agg.verdict, predicted_reason: agg.reason, predicted_release: r.release_recommendation, qualifier_loss_flag: r.qualifier_loss_detected, internal_score: r.internal_scores[0] ?? null, latency_ms: 0, cost_cents: 0, error: null });
  }
  return out;
}

export async function reproduce(log: (s: string) => void = console.log): Promise<boolean> {
  const heldout = loadHeldoutV11ForFinalEvaluation({ purpose: 'final_evaluation', preregistration_sha256: PREREGISTRATION_V11.methodology_sha256 as string });
  const items = [...loadDevV11(), ...heldout];
  const predictions = await predict(items);
  const h = scoreMethod('code_only', items, predictions).by_split.heldout!;
  log(`verify-bench v1.1 · rules ${RULES_VERSION} · code only · ${items.length.toLocaleString('en-US')} items (${heldout.length} held-out)`);
  for (const k of KEYS) log(`  ${LABEL[k]}: ${fmt(h[k] as Rate)}`);

  const mine = new Map(predictions.map((p) => [p.item_id, p]));
  let ok = false;
  log('Compared with the published runs:');
  for (const f of readdirSync(RESULTS).filter((n) => /-v1\.1-code-only-rules-[\d.]+\.json$/.test(n)).sort()) {
    const pub = JSON.parse(readFileSync(new URL(f, RESULTS), 'utf8')) as Published;
    const differ = pub.predictions.filter((p) => !mine.has(p.item_id) || !same(p, mine.get(p.item_id)!)).length;
    const metricsSame = KEYS.every((k) => pub.report.by_split.heldout[k]?.k === (h[k] as Rate).k && pub.report.by_split.heldout[k]?.n === (h[k] as Rate).n);
    log(`  rules ${pub.rules_version}: ${differ.toLocaleString('en-US')} of ${pub.predictions.length.toLocaleString('en-US')} predictions differ; held-out figures ${metricsSame ? 'identical' : 'differ'}`);
    if (pub.rules_version === RULES_VERSION && differ === 0 && metricsSame) ok = true;
  }
  log(ok ? `Reproduced: rules ${RULES_VERSION} matches its published run exactly.` : `Not reproduced: no published run of rules ${RULES_VERSION} matches.`);
  return ok;
}
