#!/usr/bin/env node
/**
 * Build the GitHub Marketplace copy of the Action (augustbrookz/verify-gate-action).
 *
 *   npm run build && node scripts/build-action-dist.mjs <out-dir>
 *
 * GitHub Marketplace lists an Action only from a repository with one action.yml at its root
 * and no workflow files. This repository keeps its CI and the npm release workflow (npm
 * provenance needs them here), so the listed copy is a separate repository holding only:
 * action.yml (main → dist/index.js), the self-contained bundle, README, LICENSE, SECURITY.md.
 * It is the same Action: `uses: augustbrookz/verify-gate@v0` and
 * `uses: augustbrookz/verify-gate-action@v0` run identical code at the same version.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: build-action-dist.mjs <out-dir>');
const bundle = join(root, 'packages/verify-action/dist/index.js');
if (!existsSync(bundle)) throw new Error('packages/verify-action/dist/index.js is missing: run npm run build first');

const action = readFileSync(join(root, 'action.yml'), 'utf8');
const main = 'main: packages/verify-action/dist/index.js';
if (!action.includes(main)) throw new Error(`action.yml no longer has "${main}"`);

// Keep the output's .git (the distribution repository's history); replace everything else.
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f !== '.git') rmSync(join(out, f), { recursive: true, force: true });
mkdirSync(join(out, 'dist'), { recursive: true });
writeFileSync(join(out, 'action.yml'), action.replace(main, 'main: dist/index.js'));
copyFileSync(bundle, join(out, 'dist/index.js'));
for (const f of ['LICENSE', 'SECURITY.md']) copyFileSync(join(root, f), join(out, f));
copyFileSync(join(root, 'action-dist/README.md'), join(out, 'README.md'));

const sha = createHash('sha256').update(readFileSync(bundle)).digest('hex');
const version = JSON.parse(readFileSync(join(root, 'packages/verify-action/package.json'), 'utf8')).version;
writeFileSync(join(out, 'dist/SOURCE.json'), `${JSON.stringify({ source: 'https://github.com/augustbrookz/verify-gate', package: '@xyntherium/verify-action', version, bundle_sha256: sha }, null, 2)}\n`);
const bad = readdirSync(out).filter((f) => f === '.github');
if (bad.length) throw new Error('the distribution must not contain .github/');
console.log(`wrote ${out}: action.yml, dist/index.js (sha256 ${sha.slice(0, 12)}…), README.md, LICENSE, SECURITY.md`);
