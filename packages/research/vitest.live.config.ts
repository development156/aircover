import { defineConfig } from 'vitest/config'

/** The inverse of vitest.config.ts — live tests only. See smoke notes in each file. */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 180000,
  },
})
