import { defineConfig } from 'vitest/config';

// Unit tests. Pipeline tests (need the local database) run through vitest.pipeline.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/pipeline/**', 'node_modules/**'],
    testTimeout: 60_000,
  },
});
