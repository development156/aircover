import { defineConfig } from 'vitest/config'

/**
 * Same trap packages/mesh, shared and publishing each hit: the root config's
 * `include` is `scripts/**\/*.test.mjs`, so every test under `src/` would be
 * uncollected and `turbo test` would report green on a suite that never ran.
 * `*.live.test.ts` costs real Firecrawl credits and is excluded here; run it
 * with vitest.live.config.ts.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.live.test.ts'],
  },
})
