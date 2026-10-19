// Bundle the CLI (with verify-core, verify-policy and the Gate runner) into one file.
import { build } from 'esbuild';
await build({ entryPoints: ['src/bin.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: 'dist/cli.js', banner: { js: '#!/usr/bin/env node' }, logLevel: 'info' });
