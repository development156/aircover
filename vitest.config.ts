import { defineConfig } from 'vitest/config'

/**
 * Root-level tests for `scripts/` — the ops sync protocol's pure logic.
 *
 * These live outside every workspace package, so `turbo run test` (which fans
 * out to package `test` scripts) does not reach them. The root `test` script
 * runs turbo AND this, so `pnpm test` is still one command that covers
 * everything.
 *
 * Worth knowing: the Stop-hook gate calls `turbo run typecheck test` directly,
 * not `pnpm test`, so it does NOT cover these. That gap is deliberate for now
 * and tracked — see the Stop-hook note in LEARNINGS.
 */
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
})
