/**
 * The development view of verify-bench v1.1. Only split=dev is reachable from
 * here; see heldout-v11.ts for the guarded held-out loader.
 *
 * Deliberately not exported from index.ts: the v1.1 files are several MB, and
 * nothing in the app bundle should pull them in. Scripts and tests import this
 * module by path.
 */
import dev from '../data/verify-bench-v1.1.dev.json';
import manifest from '../data/manifest-v1.1.json';
import reviewQueue from '../data/review-queue-v1.1.json';
import type { BenchItem, Manifest, ReviewQueueEntry } from './types';

export function loadDevV11(): BenchItem[] {
  return dev as BenchItem[];
}

export function loadManifestV11(): Manifest & { public_sources?: { file: string; source: string; license: string; sha256: string }[] } {
  return manifest as Manifest;
}

export function loadReviewQueueV11(): ReviewQueueEntry[] {
  return reviewQueue as ReviewQueueEntry[];
}
