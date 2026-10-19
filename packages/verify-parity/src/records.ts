/**
 * Parity results as ledger records. Verify Gate's hash-chained ledger carries
 * them as chain entries of kind "parity" (ledger 1.1.0); each record is
 * hashed like every other entry (payload_hash = sha256(JCS(record))).
 * Text appears only when the run includes text; otherwise sentences and
 * conditions are referenced by SHA-256.
 */
import { sha256Hex } from '@xyntherium/verify-core';
import type { SourceChange } from './source-change';
import type { TriageResult, VerifierRun } from './triage';
import { PARITY_VERSION } from './version';

export interface SourceChangeRecord {
  record_type: 'source_change';
  parity_version: typeof PARITY_VERSION;
  /** Set by the hosted Gate on records the Action computed: signed as reported, not as evaluated. */
  reported_by?: 'verify-gate-action';
  source_id: string;
  path: string;
  schema: 'source-document@1';
  kind: SourceChange['kind'];
  before_parity_sha256: string;
  after_parity_sha256: string;
  before_text_sha256: string;
  after_text_sha256: string;
  counts: SourceChange['counts'];
  changes: { type: string; class: string | null; before_sha256: string | null; after_sha256: string | null; before?: string | null; after?: string | null }[];
}

export interface TriageRecord {
  record_type: 'disagreement_triage';
  parity_version: typeof PARITY_VERSION;
  reported_by?: 'verify-gate-action';
  subject: string;
  runs: VerifierRun[];
  kind: TriageResult['kind'];
  route: TriageResult['route'];
  outcomes: string[];
  mismatched_sources: string[];
  explanation: string;
}

export type ParityRecord = SourceChangeRecord | TriageRecord;

const h = (s: string | null) => (s === null ? null : sha256Hex(s));

/** A source change as a record. Pass a change detected with include_text, so its texts can be hashed. */
export function sourceChangeRecord(change: SourceChange, meta: { source_id: string; path: string; include_text: boolean }): SourceChangeRecord {
  return {
    record_type: 'source_change',
    parity_version: PARITY_VERSION,
    source_id: meta.source_id,
    path: meta.path,
    schema: 'source-document@1',
    kind: change.kind,
    before_parity_sha256: change.before_parity_sha256,
    after_parity_sha256: change.after_parity_sha256,
    before_text_sha256: change.before_text_sha256,
    after_text_sha256: change.after_text_sha256,
    counts: change.counts,
    changes: change.changes.map((c) => ({ type: c.type, class: c.class, before_sha256: h(c.before), after_sha256: h(c.after), ...(meta.include_text ? { before: c.before, after: c.after } : {}) })),
  };
}

export function triageRecord(subject: string, runs: VerifierRun[], t: TriageResult): TriageRecord {
  return { record_type: 'disagreement_triage', parity_version: PARITY_VERSION, subject, runs, kind: t.kind, route: t.route, outcomes: t.outcomes, mismatched_sources: t.mismatched_sources.map((m) => m.source_id), explanation: t.explanation };
}
