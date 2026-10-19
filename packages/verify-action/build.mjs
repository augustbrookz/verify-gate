// Bundle the Action (and the SDK it wraps) into dist/index.js, which is committed: Actions run it directly.
import { build } from 'esbuild';
await build({ entryPoints: ['src/main.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', outfile: 'dist/index.js', logLevel: 'info' });
