/**
 * Result cache: identical inputs reuse the prior verdict at zero billable
 * units, marked "cached" in the ledger. Keyed by
 * hash(question + answer + source set + config + rules version), so a changed
 * answer, source, golden set or rules version is always checked afresh.
 *
 * Stored as one JSON file in the cache directory, which the workflow persists
 * between runs with actions/cache. Holds only hashes and structural results:
 * no question, answer or source text unless the run includes text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LedgerCase } from '../../../verify-policy/src/index';

interface Entry {
  at: string;
  rules_version: string;
  case: LedgerCase;
}

export const MAX_CACHE_ENTRIES = 5_000;

export class ResultCache {
  private entries: Record<string, Entry> = {};
  private dirty = false;
  readonly path: string;

  constructor(dir: string) {
    this.path = join(dir, 'verify-gate-cache.json');
    try {
      if (existsSync(this.path)) {
        const d = JSON.parse(readFileSync(this.path, 'utf8')) as { version: number; entries: Record<string, Entry> };
        if (d.version === 1 && d.entries && typeof d.entries === 'object') this.entries = d.entries;
      }
    } catch {
      this.entries = {}; // a corrupt cache is ignored, never trusted
    }
  }

  get(key: string, rulesVersion: string): LedgerCase | null {
    const e = this.entries[key];
    return e && e.rules_version === rulesVersion ? e.case : null;
  }

  set(key: string, rulesVersion: string, c: LedgerCase, now: string): void {
    // Only checked cases with no integrity problem are reusable.
    if (c.status !== 'checked' || c.decision === 'hold') return;
    this.entries[key] = { at: now, rules_version: rulesVersion, case: c };
    this.dirty = true;
  }

  save(): void {
    if (!this.dirty) return;
    const keys = Object.keys(this.entries).sort((a, b) => (this.entries[b].at < this.entries[a].at ? -1 : 1));
    const kept = Object.fromEntries(keys.slice(0, MAX_CACHE_ENTRIES).map((k) => [k, this.entries[k]]));
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify({ version: 1, entries: kept })}\n`);
  }
}

/**
 * Document change mode: each linked test's last verdict, with the source
 * snapshots (verify-parity parity hashes) it was made on, so the next change
 * compares with the previous result, and a disagreement can be triaged: same
 * snapshots or not. Keyed by hash(test id + saved answer + required
 * conditions + rules version). Verdicts and hashes only.
 */
export interface DocResult {
  verdict: 'supported' | 'contradicted' | 'unsupported' | 'unverifiable';
  sources: Record<string, string>;
}

export class DocResultStore {
  private entries: Record<string, { at: string } & DocResult> = {};
  private dirty = false;
  readonly path: string;

  constructor(dir: string) {
    this.path = join(dir, 'verify-gate-doc-results.json');
    try {
      if (existsSync(this.path)) {
        const d = JSON.parse(readFileSync(this.path, 'utf8')) as { version: number; entries: Record<string, { at: string } & DocResult> };
        if (d.version === 2 && d.entries && typeof d.entries === 'object') this.entries = d.entries;
      }
    } catch {
      this.entries = {};
    }
  }

  get(key: string): DocResult | null {
    const e = this.entries[key];
    if (!e || !['supported', 'contradicted', 'unsupported', 'unverifiable'].includes(e.verdict) || !e.sources || typeof e.sources !== 'object') return null;
    return { verdict: e.verdict, sources: e.sources };
  }

  set(key: string, verdict: string, sources: Record<string, string>, now: string): void {
    this.entries[key] = { at: now, verdict: verdict as DocResult['verdict'], sources };
    this.dirty = true;
  }

  save(): void {
    if (!this.dirty) return;
    const keys = Object.keys(this.entries).sort((a, b) => (this.entries[b].at < this.entries[a].at ? -1 : 1));
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify({ version: 2, entries: Object.fromEntries(keys.slice(0, MAX_CACHE_ENTRIES).map((k) => [k, this.entries[k]])) })}\n`);
  }
}
