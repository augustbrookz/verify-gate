import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/verify-mcp/test/**/*.test.ts'], environment: 'node' } });
