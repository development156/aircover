import { defineConfig } from 'vitest/config'

/**
 * Without this the package inherits a root config whose `include` is
 * `scripts/**\/*.test.mjs`, and every test under `src/` is never collected —
 * `turbo test` then reports green on a suite that did not run.
 *
 * This is the FIFTH package found this way, after shared, publishing, mesh and
 * its sibling here. The root cause is shared and worth naming: a workspace
 * package with no config of its own silently adopts a pattern written for the
 * repo's build scripts, and nothing anywhere says that its own tests were
 * skipped — the runner reports success for collecting zero files.
 *
 * `*.live.test.ts` is excluded: those hit real services and belong to the live
 * gate, not to `turbo test`, which must pass with no credentials.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.live.test.ts'],
    // The four integration suites each boot an in-process Postgres and apply all
    // 44 migration files in `beforeAll`. Alone that is ~2s; four vitest workers
    // doing it at once on this machine went past the 10s default and the suites
    // failed as HOOK TIMEOUTS while passing individually — a failure about the
    // box, dressed as a failure about the code. Same reasoning, and the same
    // number, as packages/db and apps/jobs.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
