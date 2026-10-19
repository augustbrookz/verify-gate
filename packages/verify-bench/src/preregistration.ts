/** The pre-registration record: the SHA-256 of docs/benchmark-methodology.md as committed before any run. */
import prereg from '../preregistration.json';

export const PREREGISTRATION: { methodology_sha256: string | null; committed_at: string | null; note?: string } = prereg;
