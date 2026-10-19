/**
 * The development view of the benchmark. Only split=dev is reachable from
 * here; see heldout.ts for the guarded held-out loader.
 */
import dev from '../data/verify-bench-v1.dev.json';
import manifest from '../data/manifest.json';
import reviewQueue from '../data/review-queue.json';
import type { BenchItem, Manifest, ReviewQueueEntry } from './types';

export function loadDev(): BenchItem[] {
  return dev as BenchItem[];
}

export function loadManifest(): Manifest {
  return manifest as Manifest;
}

export function loadReviewQueue(): ReviewQueueEntry[] {
  return reviewQueue as ReviewQueueEntry[];
}
