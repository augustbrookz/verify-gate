#!/usr/bin/env node
// Build every package in dependency order. The libraries are tsc + fix-esm-specifiers (Node
// loads their output directly); the Action, CLI, MCP server and benchmark CLI are esbuild bundles.
import { execSync } from 'node:child_process';

const ORDER = ['verify-core', 'verify-parity', 'verify-policy', 'verify-sdk', 'verify-bench', 'verify-cli', 'verify-action', 'verify-mcp'];
for (const p of ORDER) {
  console.log(`\n== ${p}`);
  execSync('npm run build', { cwd: `packages/${p}`, stdio: 'inherit' });
}
