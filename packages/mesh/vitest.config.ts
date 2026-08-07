import { defineConfig } from 'vitest/config'

/**
 * The THIRD package found inheriting a root config whose `include` is
 * `scripts/**\/*.test.mjs` — after packages/shared and packages/publishing. Every
 * test under `src/` was uncollected, so `turbo test` reported green on a package
 * whose suite never executed.
 *
 * `smoke.live.test.ts` hits real providers and is excluded: it belongs to the
 * live-smoke gate, not to `turbo test`, and pulling it in would make the ordinary
 * suite spend money and fail without keys.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.live.test.ts'],
  },
})
