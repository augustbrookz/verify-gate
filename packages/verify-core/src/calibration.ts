/**
 * Calibration: how often a verdict at a given internal score was right on
 * the benchmark.
 *
 * Bins are defined from the DEV split and validated on HELD-OUT. The value
 * returned per claim (calibrated_confidence) is the held-out precision of that
 * verdict in that score bin, labelled with the benchmark version. It is a
 * measured hit rate on labelled benchmark items. It is NOT a probability that
 * the claim is true.
 */
import type { Verdict } from './contract';

/** Lower edges of the internal-score bins (fixed in advance, not tuned). */
export const SCORE_BIN_EDGES = [0, 0.6, 0.7, 0.8, 0.9, 0.95] as const;

export function scoreBin(score: number): number {
  let bin = 0;
  for (let i = 0; i < SCORE_BIN_EDGES.length; i++) if (score >= SCORE_BIN_EDGES[i]) bin = i;
  return bin;
}

export function binLabel(bin: number): string {
  const lo = SCORE_BIN_EDGES[bin];
  const hi: number | undefined = SCORE_BIN_EDGES[bin + 1];
  return `[${lo.toFixed(2)}, ${hi === undefined ? '1.00]' : `${hi.toFixed(2)})`}`;
}

/** 95% Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.959963984540054): { p: number | null; lo: number | null; hi: number | null } {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export interface CalibrationObservation {
  verdict: Verdict;
  internal_score: number;
  correct: boolean;
}

export interface CalibrationBin {
  verdict: Verdict;
  bin: number;
  range: string;
  dev_n: number;
  dev_correct: number;
  dev_precision: number | null;
  dev_lo: number | null;
  dev_hi: number | null;
  heldout_n: number;
  heldout_correct: number;
  heldout_precision: number | null;
  /** Held-out precision falls inside the dev 95% interval (or n too small to say). */
  consistent: boolean | null;
}

export const MIN_BIN_N = 10;

export function buildBins(dev: CalibrationObservation[], heldout: CalibrationObservation[]): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  const verdicts: Verdict[] = ['supported', 'contradicted', 'unsupported', 'unverifiable'];
  for (const v of verdicts) {
    for (let b = 0; b < SCORE_BIN_EDGES.length; b++) {
      const d = dev.filter((o) => o.verdict === v && scoreBin(o.internal_score) === b);
      const h = heldout.filter((o) => o.verdict === v && scoreBin(o.internal_score) === b);
      if (!d.length && !h.length) continue;
      const dk = d.filter((o) => o.correct).length;
      const hk = h.filter((o) => o.correct).length;
      const dw = wilson(dk, d.length);
      const hp = h.length ? hk / h.length : null;
      const consistent =
        d.length >= MIN_BIN_N && h.length >= MIN_BIN_N && dw.lo !== null && dw.hi !== null && hp !== null ? hp >= dw.lo && hp <= dw.hi : null;
      out.push({
        verdict: v,
        bin: b,
        range: binLabel(b),
        dev_n: d.length,
        dev_correct: dk,
        dev_precision: dw.p,
        dev_lo: dw.lo,
        dev_hi: dw.hi,
        heldout_n: h.length,
        heldout_correct: hk,
        heldout_precision: hp,
        consistent,
      });
    }
  }
  return out;
}

/** Expected calibration error of the dev bins measured against held-out outcomes. */
export function expectedCalibrationError(bins: CalibrationBin[]): number | null {
  const usable = bins.filter((b) => b.dev_precision !== null && b.heldout_precision !== null && b.heldout_n > 0);
  const n = usable.reduce((a, b) => a + b.heldout_n, 0);
  if (!n) return null;
  return usable.reduce((a, b) => a + (b.heldout_n / n) * Math.abs((b.dev_precision as number) - (b.heldout_precision as number)), 0);
}

export interface CalibrationTable {
  version: string;
  bins: CalibrationBin[];
  validated: boolean;
}

/**
 * The calibrated confidence for a verdict at a score, or null when there is
 * no validated bin with enough held-out items.
 */
export function calibratedConfidence(table: CalibrationTable | null, verdict: Verdict, score: number): { value: number; label: string } | null {
  if (!table || !table.validated) return null;
  const bin = table.bins.find((b) => b.verdict === verdict && b.bin === scoreBin(score));
  if (!bin || bin.heldout_n < MIN_BIN_N || bin.heldout_precision === null || bin.consistent === false) return null;
  return { value: Math.round(bin.heldout_precision * 1000) / 1000, label: `calibrated on benchmark ${table.version}` };
}
