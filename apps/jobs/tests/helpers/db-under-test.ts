import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import type { Pool } from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ENV } from './env'
import { pgPool } from './db'
import { hasLedgerEnv } from './env'

/**
 * The Postgres these suites run against, and the reason they now run at all.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 * `publishStore.integration.test.ts` (9 tests) and `holds.integration.test.ts`
 * (7) were `describe.skipIf(!hasLedgerEnv)`, and `hasLedgerEnv` is false unless
 * SAHODA_ALLOW_LIVE_TESTS=1. Nobody sets it, correctly, because the only
 * Postgres this repo points at is production. MEASURED 2026-08-20 with
 * `vitest --reporter=json`: apps/jobs reports 264 passed / 16 SKIPPED, and
 * vitest reports a suite that executed nothing exactly as it reports one that
 * passed.
 *
 * publishStore's own header says it is "the only thing that catches drift
 * between post_publish_logs' DDL and the row this job writes". It had never run.
 *
 * ── WHY NOT JUST USE THE EXISTING .pglite SUITES ─────────────────────────────
 * Because they prove something narrower and say so. Each `*.pglite.test.ts` here
 * declares its own cut-down `create table` covering only the columns its
 * statement touches — honest about it, and the board card for it says the
 * STATEMENTS are proven and the SCHEMA is not. A table that has since gained a
 * constraint or lost a default still passes.
 *
 * This one applies the REAL migration files, so column drift is exactly what it
 * catches — which is what the skipped suite was for.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../../../../packages/db/supabase/migrations')
const PRELUDE = resolve(MIGRATIONS, '../../tests/helpers/supabase-prelude.sql')

export type DbUnderTest = {
  pool: Pool
  kind: 'pglite' | 'live'
  close(): Promise<void>
}

/**
 * Boot the real schema in process and hand back a `pg.Pool`-shaped handle.
 *
 * The stores here use `query(text, values)` and `end()` and nothing else, which
 * is a small enough surface to satisfy honestly rather than mock. `on` accepts
 * the idle-client error handler the pool guards register: PGlite has no idle
 * clients and no such event, and accepting a registration that can never fire is
 * the truthful shape — a stub that pretended to fire would be worse.
 */
async function pglitePool(): Promise<Pool & { pglite: PGlite }> {
  const pglite = await new PGlite({ extensions: { pgcrypto } })
  await pglite.exec(readFileSync(PRELUDE, 'utf8'))
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pglite.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
  }
  // NO GRANTs here, deliberately, and this is not an oversight.
  //
  // packages/db's harness needs Supabase's project-creation grants because it
  // drops to `authenticated` and asks what a policy allows. These suites never
  // `set role` — they connect as PGlite's superuser, exactly as the job does
  // through a service-role pool — so RLS and table privileges are both bypassed
  // and a GRANT block here would decide nothing.
  //
  // MEASURED: a mutant deleting the grants left all 16 tests green. Rather than
  // record that as a hole it is not, the inert setup is gone. Setup no test
  // exercises is the same claim-without-evidence this file was written to fix,
  // one level down.
  const pool = {
    pglite,
    query: (text: string, values?: unknown[]) => pglite.query(text, values),
    on: () => pool,
    end: () => pglite.close(),
  }
  return pool as unknown as Pool & { pglite: PGlite }
}

/** The live database when opted in, an ephemeral one built from the migrations otherwise. */
export async function openDbUnderTest(): Promise<DbUnderTest> {
  if (hasLedgerEnv && ENV.dbUrl.length > 0) {
    const pool = pgPool()
    return { pool, kind: 'live', close: () => pool.end() }
  }
  const pool = await pglitePool()
  return { pool, kind: 'pglite', close: () => pool.end() }
}
