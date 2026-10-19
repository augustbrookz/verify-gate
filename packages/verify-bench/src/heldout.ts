/**
 * HELD-OUT ENFORCEMENT. The held-out split is read through this function and
 * nothing else, and only for a final evaluation whose methodology was
 * pre-registered: the caller must present the SHA-256 of
 * docs/benchmark-methodology.md, and it must equal the hash recorded in
 * preregistration.json when the methodology was committed — before any run.
 *
 * Development code (rule changes, prompt changes, calibration bin design)
 * imports dataset.ts and can only see split=dev. A test fails the build if any
 * other module imports this file.
 */
import heldout from '../data/verify-bench-v1.heldout.json';
import { PREREGISTRATION as prereg } from './preregistration';
import { HeldoutAccessError } from './heldout-error';
import type { BenchItem } from './types';

export { HeldoutAccessError };

export function loadHeldoutForFinalEvaluation(access: { purpose: 'final_evaluation'; preregistration_sha256: string }): BenchItem[] {
  if (access?.purpose !== 'final_evaluation') {
    throw new HeldoutAccessError('The held-out split is only readable for a final evaluation.');
  }
  if (!prereg.methodology_sha256 || access.preregistration_sha256 !== prereg.methodology_sha256) {
    throw new HeldoutAccessError('Held-out access requires the SHA-256 of the pre-registered methodology (packages/verify-bench/preregistration.json).');
  }
  return heldout as BenchItem[];
}

export { PREREGISTRATION } from './preregistration';
