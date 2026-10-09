import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    pool: 'threads',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
