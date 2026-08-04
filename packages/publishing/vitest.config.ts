import { defineConfig } from 'vitest/config'

/**
 * Without this file the package inherits a root config whose `include` is
 * `scripts/**\/*.test.mjs`, and EIGHT test files under `src/` — every adapter, both
 * OAuth flows and the token vault — never ran at all. They passed `turbo test`
 * forever by not existing as far as the runner was concerned.
 *
 * Same defect, same fix, as packages/shared. The lesson both times: "the suite is
 * green" is a claim about what the runner collected, not about what is in the repo.
 */
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
