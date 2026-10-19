/**
 * HELD-OUT ENFORCEMENT for verify-bench v1.1, as for v1-alpha (heldout.ts):
 * the v1.1 held-out split is read through this function and nothing else, and
 * only for a final evaluation that presents the SHA-256 of
 * docs/benchmark-methodology-v1.1-addendum.md as recorded in
 * preregistration-v1.1.json before any run. Rule and prompt development reads
 * dataset-v11.ts (dev only). A test fails the build if any other module
 * imports this file.
 */
import heldout from '../data/verify-bench-v1.1.heldout.json';
import prereg from '../preregistration-v1.1.json';
import { HeldoutAccessError } from './heldout-error';
import type { BenchItem } from './types';

export const PREREGISTRATION_V11: { version: string; methodology_sha256: string | null; methodology_commit: string | null; committed_at: string | null } = prereg;

export function loadHeldoutV11ForFinalEvaluation(access: { purpose: 'final_evaluation'; preregistration_sha256: string }): BenchItem[] {
  if (access?.purpose !== 'final_evaluation') {
    throw new HeldoutAccessError('The v1.1 held-out split is only readable for a final evaluation.');
  }
  if (!PREREGISTRATION_V11.methodology_sha256 || access.preregistration_sha256 !== PREREGISTRATION_V11.methodology_sha256) {
    throw new HeldoutAccessError('v1.1 held-out access requires the SHA-256 of the pre-registered addendum (packages/verify-bench/preregistration-v1.1.json).');
  }
  return heldout as BenchItem[];
}
