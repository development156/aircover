import { defineConfig } from 'vitest/config'

// The reaper's integration suite talks to the LIVE Supabase project over the network and
// deliberately sleeps past a short HOLD TTL to reach the expired state. That pushes single
// tests well past the 5s default, where they would fail as timeouts rather than as real
// defects. Unit suites here are unaffected — they run in milliseconds.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    // ── THE HOOK GETS LONGER THAN THE TEST, AND FOR A DIFFERENT REASON ───────
    // Six suites here boot PGlite through every migration in a `beforeAll`.
    // That is a fixed, one-off cost that has nothing to do with how long any
    // assertion takes, and 30s is tight for it on a loaded machine: MEASURED
    // 2026-09-04, three of them — backfill, gate and reconcile — failed
    // together with the SAME message, `Hook timed out in 30000ms`, while a web
    // suite ran beside them. Re-run alone on the same commit: 41 files, 472
    // tests, green.
    //
    // `packages/db` settled this already and its number is borrowed rather than
    // guessed: same boot, `testTimeout: 30_000` with `hookTimeout: 60_000`.
    // This is not loosening an assertion — nothing below is skipped, quarantined
    // or made less strict. It is refusing to report a fixed setup cost as a
    // defect, which is how a gate teaches people to re-run instead of read.
    hookTimeout: 60_000,
  },
})
