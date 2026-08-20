import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import type { Pool } from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A `pg.Pool`-shaped handle onto an in-process Postgres with the real schema.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Twenty-six integration tests in this package — withCredits (6), entitlements
 * (13), webhooks (6), applyPlanGrant (1) — are `describe.skipIf(!LIVE_DB_URL)`,
 * and `LIVE_DB_URL` is the empty string unless SAHODA_ALLOW_LIVE_TESTS=1. Nobody
 * sets it, correctly, because the only Postgres this repo is pointed at is
 * PRODUCTION: on 2026-07-27 these very suites ran against it, which is why the
 * gate exists.
 *
 * So the gate is right and the consequence is wrong. MEASURED 2026-08-20:
 * `vitest --reporter=json` reports packages/billing as 270 passed / 26 SKIPPED,
 * and vitest reports a suite that executed nothing as a pass. Among the 26 is a
 * release check that could not have passed against any database — it has never
 * run at all.
 *
 * The fix is not to loosen the gate. It is to give the suites a Postgres that is
 * not production: PGlite, in process, built from `packages/db`'s own migration
 * files, thrown away at the end of the run. The live path stays exactly as it
 * was and is still the only thing that can speak for production.
 *
 * ── WHY IT READS packages/db's FILES DIRECTLY ────────────────────────────────
 * Because the alternative is a second copy of the schema in this package, and a
 * copy is a thing that drifts. Reading the .sql off disk means a migration that
 * changes `app.apply_ledger_entry` changes what these tests run against, on the
 * same commit, with nobody remembering to update anything.
 *
 * ── WHAT IT CANNOT PROVE ─────────────────────────────────────────────────────
 * Nothing about production. It proves the migration FILES behave as the ledger
 * claims. Whether production matches them is `migration_integrity.test.ts`'s
 * job, and that one genuinely needs a connection.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../../../db/supabase/migrations')

/**
 * What Supabase creates before the first migration runs.
 *
 * Read from packages/db's own file rather than restated here: three harnesses
 * boot this schema, and a prelude copied into each is a schema that drifts one
 * role at a time while all three go on reporting green.
 */
const PRELUDE = readFileSync(
  resolve(MIGRATIONS, '../../tests/helpers/supabase-prelude.sql'),
  'utf8',
)

export type PglitePool = Pool & { pglite: PGlite }

/**
 * Boot the schema and hand back something `createPgLedgerPort` will accept.
 *
 * The ports here use exactly three things off a Pool — `query(text, values)`,
 * `on('error', …)` and `end()` — so the surface is small enough to satisfy
 * honestly rather than to mock. The cast is to `Pool` because `pg`'s type is a
 * class with dozens of members no caller in this package touches; narrowing it
 * would mean changing production signatures to suit a test, which is the wrong
 * way round.
 */
export async function createPglitePool(): Promise<PglitePool> {
  const pglite = await new PGlite({ extensions: { pgcrypto } })
  await pglite.exec(PRELUDE)
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pglite.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
  }
  // Supabase's project-creation grants. Absent them every read is `permission
  // denied`, which reads exactly like a policy doing its job.
  await pglite.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
  `)

  const pool = {
    pglite,
    query: (text: string, values?: unknown[]) => pglite.query(text, values),
    // The ports register an idle-client error handler. PGlite has no idle
    // clients and no such event; accepting the registration and never firing it
    // is the truthful shape, not a stub that pretends.
    on: () => pool,
    end: () => pglite.close(),
  }
  return pool as unknown as PglitePool
}

/** How many migration files the boot applied — so a suite can prove it booted one. */
export function migrationCount(): number {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).length
}
