import { defineConfig } from 'vitest/config';

// Pipeline tests: the importer end to end against the local database (CI job `food-import`).
// They share one database, so files and tests run one at a time.
export default defineConfig({
  test: {
    include: ['test/pipeline/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
