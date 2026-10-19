// Build @xyntherium/verify-bench for Node: bundle the library and the reproduce CLI (JSON data
// and @xyntherium/verify-core stay external; the data ships in data/ and results/), then give
// the JSON imports their import attribute. Types: tsc --emitDeclarationOnly (tsconfig.build.json).
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
const common = { bundle: true, platform: 'node', target: 'node20', format: 'esm', external: ['@xyntherium/verify-core', '*.json'], logLevel: 'info' };
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...common, entryPoints: ['src/reproduce-cli.ts'], outfile: 'dist/reproduce-cli.js' });
execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
execFileSync('node', ['../../scripts/fix-esm-specifiers.mjs', 'dist'], { stdio: 'inherit' });
