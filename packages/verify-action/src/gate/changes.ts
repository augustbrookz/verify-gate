/**
 * Cost control: run only when files that can change an answer change. The
 * default relevant paths are prompts/, retrieval/, every source the golden set
 * names, and verify-gate.yml itself, plus the configured `paths`. When the
 * changed files are unknown, the Gate runs (failing safe).
 */
export const DEFAULT_PATHS = ['prompts/**', 'retrieval/**'];

/** Glob to RegExp: ** spans directories, * stays within one, ? is one character. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  const g = glob.replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') i++;
        re += '(?:.*/)?' + (g[i + 1] === undefined ? '.*' : '');
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function relevantPatterns(o: { config_path: string; source_paths: string[]; paths: string[] }): string[] {
  return [...DEFAULT_PATHS, o.config_path, ...o.source_paths, ...o.paths];
}

/** null = run (changed files unknown); otherwise the relevant changed files. */
export function relevantChanges(changed: string[] | null, patterns: string[]): string[] | null {
  if (changed === null) return null;
  const res = patterns.map(globToRegExp);
  return changed.filter((f) => res.some((r) => r.test(f.replace(/^\.\//, ''))));
}
