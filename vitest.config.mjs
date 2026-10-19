import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@xyntherium/verify-core': `${root}/packages/verify-core/src/index.ts`,
      '@xyntherium/verify-sdk': `${root}/packages/verify-sdk/src/index.ts`,
      '@xyntherium/verify-bench': `${root}/packages/verify-bench/src/index.ts`,
      '@xyntherium/verify-policy': `${root}/packages/verify-policy/src/index.ts`,
      '@xyntherium/verify-parity': `${root}/packages/verify-parity/src/index.ts`,
    },
  },
  test: { environment: 'node', include: ['packages/*/test/**/*.test.ts'] },
});
