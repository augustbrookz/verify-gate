import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/verify-action/test/**/*.test.ts'], environment: 'node' } });
