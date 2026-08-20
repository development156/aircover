import type { Pool } from 'pg'

import { LIVE_DB_URL } from './live-env'
import { createPglitePool } from './pglite-pool'

/**
 * The database this package's integration suites run against, and the reason
 * they now run at all.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * Four suites were `describe.skipIf(!LIVE_DB_URL)`, and `LIVE_DB_URL` is the
 * empty string unless the operator sets SAHODA_ALLOW_LIVE_TESTS=1. Nobody does,
 * and nobody should: the only Postgres this repo points at is production. So all
 * twenty-six tests reported green having executed nothing —
 * `vitest --reporter=json`, 2026-08-20: 270 passed, 26 SKIPPED — and vitest
 * reports a suite that ran no assertions exactly as it reports one that passed.
 *
 * The skip was never the mistake. Having no other database was.
 *
 * ── THE SHAPE OF THE FIX ─────────────────────────────────────────────────────
 * The suites no longer decide whether to run. They ask for a database and get
 * one either way:
 *
 *   default                          → PGlite, in process, built from
 *                                      packages/db's real migration files,
 *                                      discarded at the end of the run.
 *   SAHODA_ALLOW_LIVE_TESTS=1        → the live DSN, exactly as before.
 *
 * The live path is untouched and is still the only thing that can speak for
 * production. What changed is that its absence no longer means "prove nothing".
 */
export type DbUnderTest = {
  pool: Pool
  /** 'pglite' or 'live' — asserted by the suites, so a run says which it was. */
  kind: 'pglite' | 'live'
  /** Passed to createPgLedgerPort/createPgPlanResolver, which require a string. */
  connectionString: string
  close(): Promise<void>
}

/**
 * A Postgres to test against.
 *
 * `connectionString` is deliberately a marker rather than an empty string on the
 * PGlite path: the ports take one, `pgSsl()` parses it, and an empty value would
 * make a TLS decision from nothing. `pglite://memory` has no Supabase hostname,
 * so `pgSsl` returns undefined and the injected pool is used untouched — which
 * is the whole point of the injection.
 */
export async function openDbUnderTest(): Promise<DbUnderTest> {
  if (LIVE_DB_URL) {
    // The live path builds no pool here — each suite's port makes its own from
    // the DSN, exactly as it did before this file existed.
    return {
      pool: undefined as unknown as Pool,
      kind: 'live',
      connectionString: LIVE_DB_URL,
      close: async () => {},
    }
  }
  const pool = await createPglitePool()
  return {
    pool,
    kind: 'pglite',
    connectionString: 'pglite://memory',
    close: async () => {
      await pool.end()
    },
  }
}
