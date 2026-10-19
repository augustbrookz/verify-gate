/**
 * What a Verify Gate result does and does not establish. These exact strings
 * are required: ASSURANCE_SCOPE is a required field of every Gate ledger and
 * is rendered on every PR comment, job summary, SARIF rule and dashboard view;
 * a test fails the build if any surface omits it.
 */
export const ASSURANCE_SCOPE =
  'evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.' as const;

/** The sentence form, for prose surfaces. */
export const ASSURANCE_SCOPE_SENTENCE =
  'Assurance scope: evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.' as const;

/** Attached to every framework reference (NIST, OWASP). */
export const FRAMEWORK_DISCLAIMER = 'Informational mapping; not a certification or compliance determination.' as const;

/** How a signed ledger is described. Never "tamper-proof". */
export const SIGNATURE_WORDING = 'cryptographically signed by the configured verifier key' as const;
