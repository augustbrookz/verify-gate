/**
 * Resolve the golden set's sources: checked-in files only, read from inside
 * the repository, each compared with the sha256 the golden set pins. A changed
 * file is a hold (XYN-006), never a silent re-baseline; a missing or empty
 * file is a hold too (the case abstains).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { SourceSpec } from './config';

export interface ResolvedSource {
  spec: SourceSpec;
  text: string | null;
  sha256: string | null;
  status: 'ok' | 'hash_mismatch' | 'missing';
  detail: string | null;
}

export const MAX_SOURCE_BYTES = 2_000_000;

export function sha256File(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** True when `p`, after resolving symlinks, stays inside `root`. */
export function insideRoot(root: string, p: string): boolean {
  const real = realpathSync(p);
  const rel = relative(realpathSync(root), real);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

export function resolveSources(specs: SourceSpec[], root: string): ResolvedSource[] {
  return specs.map((spec) => {
    const abs = resolve(join(root, spec.path));
    if (!existsSync(abs)) return { spec, text: null, sha256: null, status: 'missing', detail: `${spec.path} does not exist` };
    if (!insideRoot(root, abs)) return { spec, text: null, sha256: null, status: 'missing', detail: `${spec.path} resolves outside the repository` };
    const st = statSync(abs);
    if (!st.isFile()) return { spec, text: null, sha256: null, status: 'missing', detail: `${spec.path} is not a file` };
    if (st.size > MAX_SOURCE_BYTES) return { spec, text: null, sha256: null, status: 'missing', detail: `${spec.path} is larger than ${MAX_SOURCE_BYTES} bytes` };
    const bytes = readFileSync(abs);
    const hash = sha256File(bytes);
    const text = bytes.toString('utf8');
    if (!text.trim()) return { spec, text: null, sha256: hash, status: 'missing', detail: `${spec.path} is empty` };
    if (spec.sha256 && spec.sha256 !== hash) return { spec, text, sha256: hash, status: 'hash_mismatch', detail: `${spec.path} sha256 is ${hash.slice(0, 12)}…, the golden set pins ${spec.sha256.slice(0, 12)}…` };
    return { spec, text, sha256: hash, status: 'ok', detail: null };
  });
}
