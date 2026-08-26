import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'
import { WorkspaceSchema } from '@sahoda/shared'

import { BUSINESS_MODELS, LOCALES, REGIMES } from '@/lib/onboarding/intake'

/**
 * THE `workspaces` ROW, HELD TO ITS TWO MIRRORS.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `WorkspaceSchema` in `@sahoda/shared` is supposed to mirror the table. On
 * 2026-08-26 it did not: `deleted_at` had been on the table since
 * `20260823000000_dpdp_erasure` and had never been added to the schema. Nothing
 * caught it for three days because nothing compares the two, and nothing
 * imports `WorkspaceSchema` either — a mirror with no reader and no guard is
 * just a comment that looks like code.
 *
 * The same trap sits under the three intake columns. Their CHECK lists are a
 * copy of `BUSINESS_MODELS`, `REGIMES` and `LOCALES`, which live in the
 * onboarding lane. Add a regime in TypeScript, forget the migration, and
 * onboarding classifies a business the database then refuses to store — at the
 * end of an eight-screen flow, on the write.
 *
 * ── WHY PGlite AND NOT A REGEX OVER THE MIGRATION FILES ──────────────────────
 * `check-constraints.ts` reads the SQL as text, which is the right tool for
 * scanning every table at once. Here the question is narrow and exact, so this
 * boots the real migrations and asks Postgres what it ended up with. A text
 * scan would have to model `add column if not exists`, later `alter`s and the
 * drop-and-replace convention this repo uses for widening a CHECK; Postgres
 * has already done all of that.
 */

/** Columns Postgres reports for one table. */
async function columnsOf(db: PGlite, table: string): Promise<string[]> {
  const r = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by column_name`,
    [table],
  )
  return r.rows.map((row) => row.column_name)
}

/**
 * The values a named CHECK admits.
 *
 * `pg_get_constraintdef` renders the constraint as Postgres holds it, which for
 * an `in (…)` list comes back as `= ANY (ARRAY['a'::text, …])`. Pulling the
 * quoted literals out of that is enough, and is what `check-constraints.ts`
 * does against the migration text for the same reason.
 */
async function checkValues(db: PGlite, constraint: string): Promise<string[]> {
  const r = await db.query<{ def: string }>(
    `select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`,
    [constraint],
  )
  const def = r.rows[0]?.def
  if (def === undefined) throw new Error(`no constraint named ${constraint}`)
  return [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1] as string).sort()
}

describe('the workspaces row and its two mirrors', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
  })

  it('has every column the shared schema claims, and no column it omits', async () => {
    const inDatabase = await columnsOf(db, 'workspaces')
    const inSchema = Object.keys(WorkspaceSchema.shape).sort()

    // Stated as one equality rather than two subset checks, so a column added
    // on either side names itself in the diff.
    expect(inSchema).toEqual(inDatabase)
  })

  it('is not vacuously comparing two empty lists', async () => {
    // The failure this guard could have: a renamed table, a schema that stopped
    // being a ZodObject, and both sides come back empty and agree.
    const inDatabase = await columnsOf(db, 'workspaces')
    expect(inDatabase.length).toBeGreaterThanOrEqual(11)
    expect(inDatabase).toContain('deleted_at')
    expect(inDatabase).toContain('timezone')
  })

  it('admits exactly the business models onboarding can produce', async () => {
    expect(await checkValues(db, 'workspaces_business_model_check')).toEqual(
      [...BUSINESS_MODELS].sort(),
    )
  })

  it('admits exactly the regimes onboarding can produce', async () => {
    expect(await checkValues(db, 'workspaces_regime_check')).toEqual([...REGIMES].sort())
  })

  it('admits exactly the locales onboarding can produce', async () => {
    expect(await checkValues(db, 'workspaces_locale_check')).toEqual([...LOCALES].sort())
  })
})
