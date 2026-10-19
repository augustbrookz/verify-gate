/**
 * Citation markers in an answer, and whether they point at the passage that
 * actually supports the claim.
 *
 * Recognised markers: [1], [S1], [source: S1], [^1], [1, 3], 【1】. A numeric
 * marker resolves to a source whose id is that number, else to the n-th
 * source (1-based).
 */
import type { SourceInput } from './contract';
import { sentenceAround } from './sentences';

export interface CitationMarker {
  start: number;
  end: number;
  ids: string[];
}

const MARKER_RE = /\[(?:\^|source:\s*|src:\s*)?([A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*)\]|【([0-9]+)】/g;

export function parseCitations(answer: string, sources: SourceInput[]): CitationMarker[] {
  const byId = new Map(sources.map((s) => [s.id.toLowerCase(), s.id]));
  const out: CitationMarker[] = [];
  for (const m of answer.matchAll(MARKER_RE)) {
    const tokens = (m[1] ?? m[2] ?? '').split(/\s*,\s*/).filter(Boolean);
    const ids: string[] = [];
    for (const t of tokens) {
      const direct = byId.get(t.toLowerCase());
      if (direct) ids.push(direct);
      else if (/^\d+$/.test(t) && sources[Number(t) - 1]) ids.push(sources[Number(t) - 1].id);
    }
    if (ids.length) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, ids });
  }
  return out;
}

/** Source ids cited in the sentence that contains the claim. */
export function citedFor(answer: string, markers: CitationMarker[], claimStart: number | null, claimEnd: number | null): string[] {
  if (claimStart === null || claimEnd === null) return [];
  const sentence = sentenceAround(answer, claimStart, claimEnd);
  // A marker often sits just after the sentence's full stop: include a short tail.
  const tailEnd = Math.min(answer.length, sentence.end + 12);
  return [...new Set(markers.filter((m) => m.start >= sentence.start && m.start < tailEnd).flatMap((m) => m.ids))];
}

export type CitationStatus = 'ok' | 'missing' | 'mismatch' | 'not_required';

export function citationStatus(required: boolean, cited: string[], supportingSourceIds: string[]): CitationStatus {
  if (!required) return 'not_required';
  if (cited.length === 0) return 'missing';
  return cited.some((c) => supportingSourceIds.includes(c)) ? 'ok' : 'mismatch';
}
