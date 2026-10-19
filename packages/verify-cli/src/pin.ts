/**
 * `xyntherium-verify pin`: write each source's current sha256 into
 * verify-gate.yml, changing nothing else in the file. Run it after a reviewed
 * change to a source; until then, a changed source holds the Gate.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

export function pinSources(yamlText: string, root: string): { text: string; changed: { id: string; from: string | null; to: string }[]; missing: string[] } {
  const doc = load(yamlText) as { sources?: { id: string; path: string; sha256?: string }[] };
  let text = yamlText;
  const changed: { id: string; from: string | null; to: string }[] = [];
  const missing: string[] = [];
  for (const s of doc.sources ?? []) {
    const file = join(root, s.path);
    if (!existsSync(file)) {
      missing.push(s.path);
      continue;
    }
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (s.sha256 === hash) continue;
    const esc = s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The block (or flow mapping) of this source: from its id up to the next source id.
    const idRe = new RegExp(`(^|[{,\\s-])id:\\s*['"]?${esc}['"]?(?=[\\s,}]|$)`, 'm');
    const m = idRe.exec(text);
    if (!m) continue;
    const start = m.index;
    const nextId = /(^\s*-\s*\{?\s*id:|^\s*-\s+id:)/m.exec(text.slice(start + m[0].length));
    const end = nextId ? start + m[0].length + nextId.index : text.length;
    const block = text.slice(start, end);
    let next: string;
    if (/sha256:\s*['"]?[0-9a-f]*['"]?/.test(block)) next = block.replace(/sha256:\s*['"]?[0-9a-fA-F]*['"]?/, `sha256: ${hash}`);
    else if (/path:\s*[^\n,}]+/.test(block)) next = block.replace(/(path:\s*[^\n,}]+)(\s*\n(\s*))?/, (all, p1: string, nl: string | undefined, indent: string | undefined) => (nl ? `${p1}\n${indent}sha256: ${hash}\n${indent}` : `${p1}, sha256: ${hash}`));
    else continue;
    text = text.slice(0, start) + next + text.slice(end);
    changed.push({ id: s.id, from: s.sha256 ?? null, to: hash });
  }
  return { text, changed, missing };
}
