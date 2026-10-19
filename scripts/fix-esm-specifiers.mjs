#!/usr/bin/env node
/**
 * Make a package's tsc output loadable by Node directly (ESM): give every relative import
 * its file extension, and JSON imports their import attribute.
 *
 *   node scripts/fix-esm-specifiers.mjs packages/verify-core/dist
 *
 * The sources keep extensionless imports (moduleResolution "bundler", which the app and
 * vitest use). Rewriting the build output instead of the sources leaves the hashed rule
 * files untouched, so a packaging fix never changes a rules version.
 *
 *   './contract'          → './contract.js'        (a file)
 *   './gate'              → './gate/index.js'      (a directory)
 *   '../data/x.json'      → '../data/x.json' with { type: 'json' }   (.js only)
 * In .d.ts files the same paths get '.js' too (TypeScript resolves them to the .d.ts).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
if (!existsSync(root)) {
  console.error(`no such directory: ${root}`);
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|d\.ts)$/.test(name)) yield p;
  }
}

const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]*)\2(\s*with\s*\{[^}]*\})?/g;
let changed = 0;
for (const file of walk(root)) {
  const dts = file.endsWith('.d.ts');
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SPEC, (whole, lead, q, spec, attrs) => {
    const base = resolve(dirname(file), spec);
    if (/\.json$/.test(spec)) return dts || attrs ? whole : `${lead}${q}${spec}${q} with { type: 'json' }`;
    if (/\.(m?js|cjs)$/.test(spec)) return whole;
    const ext = dts ? '.d.ts' : '.js';
    if (existsSync(base + ext)) return `${lead}${q}${spec}.js${q}${attrs ?? ''}`;
    if (existsSync(join(base, `index${ext}`))) return `${lead}${q}${spec.replace(/\/$/, '')}/index.js${q}${attrs ?? ''}`;
    return whole;
  });
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`fix-esm-specifiers: ${changed} file(s) updated under ${root}`);
