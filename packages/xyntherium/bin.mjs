#!/usr/bin/env node
// `npx xyntherium …` runs the Verify Gate CLI (@xyntherium/verify-cli) unchanged.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
await import(require.resolve('@xyntherium/verify-cli/dist/cli.js'));
