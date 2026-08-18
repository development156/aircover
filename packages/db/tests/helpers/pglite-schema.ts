import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The REAL migration files, executed against a real Postgres, in process.
 *
 * ── WHY THIS IS NOT ANOTHER HAND-WRITTEN DDL ─────────────────────────────────
 * `apps/jobs` already runs SQL against PGlite, but each of those suites declares
 * its own cut-down `create table` covering only the columns its statement
 * touches. That is honest about what it proves and the board card for it says so
 * out loud: the STATEMENTS are proven, the SCHEMA is not — a table that has since
 * gained a constraint or lost a default still passes.
 *
 * This helper closes that gap for the migrations in the 2026-08-19 batch by
 * loading the actual `.sql` files off disk. A migration that would fail on apply —
 * a missing composite-unique a foreign key needs, a column named twice, a
 * function whose signature does not match its own grant — fails HERE, at
 * authoring time, instead of in the founder's terminal.
 *
 * ── WHAT IS STUBBED, AND WHY IT IS HONEST TO STUB IT ─────────────────────────
 * Two things Supabase supplies that plain Postgres does not:
 *
 *   · the `authenticated` / `anon` / `service_role` roles, so `grant` statements
 *     have something to name;
 *   · the `auth` schema, whose `auth.jwt()` reads the request's claims. The stub
 *     below reads `request.jwt.claims` exactly as Supabase's does.
 *
 * Neither stub can flatter a result. They let the DDL run; they decide nothing.
 *
 * ── WHAT THIS CANNOT PROVE ───────────────────────────────────────────────────
 * Nothing about the LIVE database. These tests build an empty Postgres from the
 * migration files, so they prove the files are internally consistent and that the
 * statements behave as claimed. Whether production actually matches is
 * `migration_integrity.test.ts`'s job, and it needs a real connection.
 *
 * Row-level security policies are CREATED here but not exercised: PGlite connects
 * as a superuser, which bypasses them. Tests may assert that RLS is switched on —
 * a structural fact — and must not claim a policy was enforced.
 */

const MIGRATIONS = resolve(import.meta.dirname, '../../supabase/migrations')

/** Everything Supabase provides before the first migration runs. */
const SUPABASE_PRELUDE = `
  create role authenticated;
  create role anon;
  create role service_role;

  create schema if not exists auth;
  grant usage on schema auth to authenticated, anon, service_role;

  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
`

/**
 * The migrations every content test needs underneath it, in apply order.
 *
 * Deliberately the FOUNDATION only, not every file in the directory. Loading all
 * thirty-odd would drag in ops, billing and seed data that no test here reads,
 * and would make an unrelated migration's breakage look like this one's.
 */
export const CONTENT_FOUNDATION = [
  '20260718000001_helpers.sql',
  '20260718000002_identity.sql',
  '20260718000003_brand.sql',
  '20260718000004_content.sql',
] as const

export function migrationSql(file: string): string {
  return readFileSync(resolve(MIGRATIONS, file), 'utf8')
}

/** A fresh Postgres with `files` applied in order. Ephemeral and in-memory. */
export async function bootSchema(files: readonly string[]): Promise<PGlite> {
  const db = await new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_PRELUDE)
  for (const file of files) await db.exec(migrationSql(file))
  return db
}

/** Apply one more migration file to a database that is already up. */
export async function applyMigration(db: PGlite, file: string): Promise<void> {
  await db.exec(migrationSql(file))
}
