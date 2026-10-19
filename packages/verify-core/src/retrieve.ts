/**
 * Bounded evidence selection for adjudication prompts.
 *
 * A model never sees more of the caller's sources than it needs: for each
 * claim, the sentences that share the most content (numbers, dates and names
 * weigh double) plus their neighbours, capped by characters. Excerpts are
 * verbatim slices with original offsets, so any quote a model copies from an
 * excerpt can be located in the full source.
 */
import type { SourceInput } from './contract';
import { extractDates, extractQuantities } from './numbers';
import { splitSentences, type TextRange } from './sentences';
import { contentStems } from './text';

export interface Excerpt {
  source_id: string;
  title: string | null;
  retrieved_at: string | null;
  ranges: TextRange[];
}

export interface ScoredSentence {
  source_id: string;
  range: TextRange;
  score: number;
}

function valueTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const q of extractQuantities(text)) out.add(`q:${q.dimension}:${q.value}`);
  for (const d of extractDates(text)) out.add(`d:${d.year}:${d.month}:${d.day}`);
  return out;
}

export function scoreSentences(claim: string, sources: SourceInput[]): ScoredSentence[] {
  const stems = contentStems(claim);
  const stemSet = new Set(stems);
  const vals = valueTokens(claim);
  const out: ScoredSentence[] = [];
  for (const s of sources) {
    for (const range of splitSentences(s.text)) {
      const sStems = new Set(contentStems(range.text));
      let score = 0;
      for (const st of stemSet) if (sStems.has(st)) score += 1;
      if (vals.size) for (const v of valueTokens(range.text)) if (vals.has(v)) score += 2;
      if (score > 0) out.push({ source_id: s.id, range, score: score / Math.sqrt(Math.max(4, sStems.size)) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function selectExcerpts(
  claim: string,
  sources: SourceInput[],
  opts: { maxChars?: number; topSentences?: number; neighbours?: number } = {},
): Excerpt[] {
  const maxChars = opts.maxChars ?? 6_000;
  const top = opts.topSentences ?? 6;
  const neighbours = opts.neighbours ?? 1;
  const scored = scoreSentences(claim, sources).slice(0, top);
  const bySource = new Map<string, Set<number>>();
  const sentencesBySource = new Map<string, TextRange[]>();
  for (const s of sources) sentencesBySource.set(s.id, splitSentences(s.text));
  for (const hit of scored) {
    const list = sentencesBySource.get(hit.source_id) ?? [];
    const idx = list.findIndex((r) => r.start === hit.range.start);
    const set = bySource.get(hit.source_id) ?? new Set<number>();
    for (let i = Math.max(0, idx - neighbours); i <= Math.min(list.length - 1, idx + neighbours); i++) set.add(i);
    bySource.set(hit.source_id, set);
  }
  let used = 0;
  const out: Excerpt[] = [];
  // Keep the caller's source order so excerpts read naturally.
  for (const s of sources) {
    const idxs = bySource.get(s.id);
    if (!idxs) continue;
    const list = sentencesBySource.get(s.id) ?? [];
    const ranges: TextRange[] = [];
    for (const i of [...idxs].sort((a, b) => a - b)) {
      const r = list[i];
      if (used + r.text.length > maxChars) break;
      // Merge adjacent sentences into one range so context reads continuously.
      const prev = ranges[ranges.length - 1];
      if (prev && list[i - 1] && prev.end === list[i - 1].end) {
        ranges[ranges.length - 1] = { start: prev.start, end: r.end, text: s.text.slice(prev.start, r.end) };
      } else {
        ranges.push(r);
      }
      used += r.text.length;
    }
    if (ranges.length) out.push({ source_id: s.id, title: s.title ?? null, retrieved_at: s.retrieved_at ?? null, ranges });
  }
  return out;
}
