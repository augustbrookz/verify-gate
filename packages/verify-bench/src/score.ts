/**
 * Scoring harness. Pure functions: items with gold labels in, predictions in,
 * metrics with 95% Wilson intervals out. The definitions here are the ones
 * pre-registered in docs/benchmark-methodology.md.
 */
import { wilson } from '@xyntherium/verify-core';
import type { BenchItem, Prediction, Split } from './types';

export interface Rate {
  k: number;
  n: number;
  p: number | null;
  lo: number | null;
  hi: number | null;
}

function rate(k: number, n: number): Rate {
  const w = wilson(k, n);
  return { k, n, p: w.p, lo: w.lo, hi: w.hi };
}

export interface Metrics {
  n: number;
  errors: number;
  false_supported_rate: Rate;
  unsupported_release_rate: Rate;
  supported_recall: Rate;
  qualifier_loss_detection: Rate;
  qualifier_loss_named: Rate | null;
  contradiction_detection: Rate;
  abstention_rate: Rate;
  exact_verdict_accuracy: Rate;
  release_accuracy: Rate | null;
  latency_ms_p50: number | null;
  latency_ms_p95: number | null;
  cost_cents_per_check: number | null;
}

export function isQualifierLoss(item: BenchItem): boolean {
  return item.gold.failure_reason === 'qualifier_loss';
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[idx];
}

export function computeMetrics(items: BenchItem[], preds: Map<string, Prediction>): Metrics {
  const pairs = items.map((it) => ({ it, p: preds.get(it.id) }));
  const v = (x: { p?: Prediction }) => x.p?.predicted_verdict ?? null; // null = error = abstention
  const notSupported = pairs.filter((x) => x.it.gold.verdict !== 'supported');
  const unsupported = pairs.filter((x) => x.it.gold.verdict === 'unsupported');
  const supported = pairs.filter((x) => x.it.gold.verdict === 'supported');
  const ql = pairs.filter((x) => isQualifierLoss(x.it));
  const contradicted = pairs.filter((x) => x.it.gold.verdict === 'contradicted');
  const withReason = ql.filter((x) => x.p?.predicted_reason !== undefined);
  const withRelease = pairs.filter((x) => x.p?.predicted_release);
  const lat = pairs.map((x) => x.p?.latency_ms).filter((n): n is number => typeof n === 'number');
  const costs = pairs.map((x) => x.p?.cost_cents).filter((n): n is number => typeof n === 'number');
  return {
    n: pairs.length,
    errors: pairs.filter((x) => !x.p || x.p.predicted_verdict === null).length,
    false_supported_rate: rate(notSupported.filter((x) => v(x) === 'supported').length, notSupported.length),
    unsupported_release_rate: rate(unsupported.filter((x) => v(x) === 'supported').length, unsupported.length),
    supported_recall: rate(supported.filter((x) => v(x) === 'supported').length, supported.length),
    qualifier_loss_detection: rate(ql.filter((x) => v(x) !== null && v(x) !== 'supported').length, ql.length),
    qualifier_loss_named: withReason.length ? rate(withReason.filter((x) => x.p?.predicted_reason === 'qualifier_loss' || x.p?.qualifier_loss_flag === true).length, withReason.length) : null,
    contradiction_detection: rate(contradicted.filter((x) => v(x) === 'contradicted').length, contradicted.length),
    abstention_rate: rate(pairs.filter((x) => v(x) === 'unverifiable' || v(x) === null).length, pairs.length),
    exact_verdict_accuracy: rate(pairs.filter((x) => v(x) === x.it.gold.verdict).length, pairs.length),
    release_accuracy: withRelease.length ? rate(withRelease.filter((x) => x.p?.predicted_release === x.it.gold.expected_release).length, withRelease.length) : null,
    latency_ms_p50: quantile(lat, 0.5),
    latency_ms_p95: quantile(lat, 0.95),
    cost_cents_per_check: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
  };
}

export interface MethodReport {
  method: string;
  overall: Metrics;
  by_split: Partial<Record<Split, Metrics>>;
  by_category: Record<string, Metrics>;
}

/** Per-category results are published only at this held-out size; smaller categories are labelled preliminary. */
export const MIN_PUBLISHED_CATEGORY_N = 80;

/**
 * The v1.1 reporting category (docs/benchmark-methodology-v1.1-addendum.md §5):
 * every number change is "numeric", v1-alpha's adversarial families are one group.
 */
export function reportCategory(item: BenchItem): string {
  if (item.category === 'numeric' || (item.category === 'contradicted' && item.subcategory === 'number')) return 'numeric';
  return item.category;
}

export interface CategoryReport {
  metrics: Metrics;
  status: 'published' | 'preliminary';
}

/** Scores by reporting category, each marked published (n ≥ 80) or preliminary. */
export function scoreByReportCategory(method: string, items: BenchItem[], predictions: Prediction[]): Record<string, CategoryReport> {
  const preds = new Map(predictions.filter((p) => p.method === method).map((p) => [p.item_id, p]));
  const out: Record<string, CategoryReport> = {};
  for (const key of [...new Set(items.map(reportCategory))].sort()) {
    const subset = items.filter((i) => reportCategory(i) === key);
    out[key] = { metrics: computeMetrics(subset, preds), status: subset.length >= MIN_PUBLISHED_CATEGORY_N ? 'published' : 'preliminary' };
  }
  return out;
}

export function categoryKey(item: BenchItem): string {
  return item.category === 'adversarial' ? `adversarial/${item.subcategory}` : item.category;
}

export function scoreMethod(method: string, items: BenchItem[], predictions: Prediction[]): MethodReport {
  const preds = new Map(predictions.filter((p) => p.method === method).map((p) => [p.item_id, p]));
  const bySplit: Partial<Record<Split, Metrics>> = {};
  for (const split of ['dev', 'heldout'] as const) {
    const subset = items.filter((i) => i.split === split);
    if (subset.length) bySplit[split] = computeMetrics(subset, preds);
  }
  const byCategory: Record<string, Metrics> = {};
  for (const key of [...new Set(items.map(categoryKey))].sort()) {
    byCategory[key] = computeMetrics(items.filter((i) => categoryKey(i) === key), preds);
  }
  return { method, overall: computeMetrics(items, preds), by_split: bySplit, by_category: byCategory };
}

/**
 * Item-level verdict from per-claim verdicts: the answer is released as
 * "supported" only if every claim is. Precedence follows the release rules.
 */
export function aggregateVerdict(claims: { verdict: string; failure_reason: string | null }[]): { verdict: Prediction['predicted_verdict']; reason: string | null } {
  if (!claims.length) return { verdict: 'unverifiable', reason: 'no_claims' };
  const find = (pred: (c: { verdict: string; failure_reason: string | null }) => boolean) => claims.find(pred);
  const con = find((c) => c.verdict === 'contradicted');
  if (con) return { verdict: 'contradicted', reason: con.failure_reason };
  const ql = find((c) => c.verdict === 'unsupported' && c.failure_reason === 'qualifier_loss');
  if (ql) return { verdict: 'unsupported', reason: 'qualifier_loss' };
  const uns = find((c) => c.verdict === 'unsupported');
  if (uns) return { verdict: 'unsupported', reason: uns.failure_reason };
  const unv = find((c) => c.verdict === 'unverifiable');
  if (unv) return { verdict: 'unverifiable', reason: unv.failure_reason };
  return { verdict: 'supported', reason: null };
}
