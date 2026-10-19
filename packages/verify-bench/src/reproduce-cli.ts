#!/usr/bin/env node
/** verify-bench-reproduce: rerun a published verify-bench v1.1 run (see reproduce.ts). */
import { reproduce } from './reproduce';

reproduce().then(
  (ok) => process.exit(ok ? 0 : 1),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  },
);
