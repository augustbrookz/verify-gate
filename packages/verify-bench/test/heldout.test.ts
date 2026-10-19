import { describe, expect, it } from 'vitest';
import { HeldoutAccessError, loadHeldoutForFinalEvaluation, PREREGISTRATION } from '../src/heldout';

describe('loadHeldoutForFinalEvaluation', () => {
  it('refuses access without the pre-registered methodology hash', () => {
    expect(() => loadHeldoutForFinalEvaluation({ purpose: 'final_evaluation', preregistration_sha256: 'nope' })).toThrow(HeldoutAccessError);
    expect(() => loadHeldoutForFinalEvaluation({ purpose: 'tuning' as 'final_evaluation', preregistration_sha256: PREREGISTRATION.methodology_sha256 ?? '' })).toThrow(HeldoutAccessError);
  });

  it('opens for a final evaluation that presents the registered hash', () => {
    if (!PREREGISTRATION.methodology_sha256) return; // not yet registered
    const items = loadHeldoutForFinalEvaluation({ purpose: 'final_evaluation', preregistration_sha256: PREREGISTRATION.methodology_sha256 });
    expect(items.length).toBeGreaterThan(100);
  });
});
