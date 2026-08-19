import { defineConfig } from 'vitest/config'

// Every live suite here talks to the ONE Supabase project over the network (there is no
// local Docker stack — packages/db/CLAUDE.md), and every `.pglite.` suite boots a real
// Postgres compiled to WebAssembly. Vitest runs test files in parallel, so both kinds
// routinely exceed the 5s default and fail as timeouts rather than as real defects.
// 30s is sized for that, not for a slow assertion.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    /**
     * PGlite suites are CPU-bound, not I/O-bound, and that breaks the assumption file
     * parallelism is built on.
     *
     * MEASURED on this machine (12 cores): with four `.pglite.` files the package passed —
     * 9 files, 159 tests. A FIFTH tipped four of them into `Hook timed out in 30000ms`,
     * every one of them in `beforeAll`, every one of them while merely booting its
     * database. Nothing was wrong with any of those files; several WebAssembly Postgres
     * instances compiling at once simply do not fit, and the failure lands on whichever
     * file was unlucky. `migration_batch_applies.pglite.test.ts` already carried a comment
     * saying it "timed out under a full parallel run while passing alone — a flake, not a
     * finding". This is that flake made deterministic rather than survived.
     *
     * ── AND A WARNING, BECAUSE THE FIRST ATTEMPT AT THIS WAS A NO-OP ────────────
     * This was first written as `poolOptions: { threads: { maxThreads: 3 } }`, which is
     * the Vitest 3 spelling. Vitest 4 REMOVED it and made these top-level, so the setting
     * was silently ignored — and the suite then passed anyway, which would have been read
     * as proof the cap worked. Vitest prints `DEPRECATED test.poolOptions was removed`
     * when it happens; that line is the only thing that distinguishes a working cap from
     * an ignored one, because both look green on a quiet machine.
     *
     * Raising the timeout alone would also have been the wrong repair: it does not remove
     * the contention, it only moves the threshold, and the next suite added finds it.
     */
    /**
     * ONE PGlite at a time, full stop.
     *
     * `maxWorkers: 3` caps concurrency WITHIN this package, and that was not enough: turbo
     * runs the other nine packages' suites at the same time, so the machine still had several
     * WebAssembly Postgres instances compiling alongside everything else. MEASURED — the
     * package passed standalone (11 files, 209 tests) and failed under `turbo run test` on the
     * same commit, which is the signature of contention rather than of a defect.
     *
     * Serial file execution removes the variable entirely: whatever else is running, this
     * package boots one database at a time. It costs about a minute of wall clock and buys a
     * suite that means the same thing every run — which is the only property a gate has.
     */
    fileParallelism: false,
  },
})
