import { defineConfig } from 'vitest/config'

// The reaper's integration suite talks to the LIVE Supabase project over the network and
// deliberately sleeps past a short HOLD TTL to reach the expired state. That pushes single
// tests well past the 5s default, where they would fail as timeouts rather than as real
// defects. Unit suites here are unaffected — they run in milliseconds.
/**
 * ── 60s, BECAUSE 30 WAS EXCEEDED BY CONTENTION AND NOT BY A DEFECT ───────────
 * MEASURED 2026-09-04 on `wt-core` at the merge of `wt-divas3`, on a 4-core box.
 *
 *   under `turbo run test`, all 27 tasks   2 failed, both at ~31s
 *   `vitest run` in apps/jobs, alone       41 files, 472 tests, ALL PASSED, 84s
 *
 * The two were `lease.pglite.test.ts` and `backfill/store.pglite.test.ts`, both
 * timing out in a test body rather than failing an assertion. Alone the same
 * suite reports `tests 224.41s` against an 84s wall clock, so file parallelism is
 * already saturating the box before turbo adds `packages/db`'s 41 PGlite suites
 * beside it. Each boots a Postgres.
 *
 * A QA sweep filed this as a red leg and a later investigation could not
 * reproduce it in four runs, including under deliberate load — so the honest
 * record is that it is INTERMITTENT and depends on what else is running.
 *
 * `packages/db` met the same symptom and answered it with `hookTimeout: 60_000`
 * plus `fileParallelism: false`. Only the timeout is copied here, deliberately:
 * the tests are STARVED, not wrong, and a bigger budget costs nothing on an idle
 * machine while serialising every file costs wall clock on every gate run. If 60s
 * is exceeded too, `fileParallelism: false` is the next lever — but on measured
 * failing output, not on suspicion.
 */
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
