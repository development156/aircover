import { describe, it, expect } from 'vitest'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * The 2026-08-19 batch, APPLIED, in the order docs/24_Migration_Batch.md gives.
 *
 * ── WHAT THIS CATCHES THAT READING THE FILES DOES NOT ────────────────────────
 * A migration can be entirely sensible and still fail on apply: a foreign key
 * pointing at a pair of columns with no matching unique constraint, a `grant`
 * naming a signature that differs from the function's by one argument, a table
 * created after the table that references it. Every one of those is invisible in
 * review and instantly fatal in a terminal — and this repo has twice applied a
 * migration that did not do what its name said.
 *
 * These files apply to PRODUCTION and the founder runs them by hand. The least
 * this run can do is prove they run.
 *
 * ── WHAT IT DOES NOT PROVE ───────────────────────────────────────────────────
 * That production matches this schema. This builds an empty database from the
 * migration files. `migration_integrity.test.ts` is the one that compares against
 * a live catalog, and it needs a real connection to do it.
 */

const BATCH = [
  '20260819000000_post_variant_version_cas.sql',
  '20260819000100_post_metric_snapshots.sql',
  '20260819000200_post_variant_format.sql',
  '20260819000300_templates.sql',
  '20260819000400_assets.sql',
  '20260819000500_campaigns.sql',
] as const

/** Every table the batch creates, and the rule that each must satisfy. */
const NEW_TABLES = [
  'post_metric_snapshots',
  'templates',
  'assets',
  'asset_usages',
  'campaigns',
  'campaign_posts',
] as const

describe('the 2026-08-19 migration batch (real Postgres, in-process)', () => {
  it('applies in order, on top of the schema production already has', async () => {
    const db = await bootSchema([...CONTENT_FOUNDATION, ...BATCH])

    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    const live = new Set(r.rows.map((row) => row.tablename))
    expect([...NEW_TABLES].filter((t) => !live.has(t))).toEqual([])

    await db.close()
  })

  it('applies each file on its own, so the order is a preference and not a trap', async () => {
    // docs/24 tells the founder these are independent. That sentence is only true
    // if each file runs against the schema as it is TODAY, with none of its
    // siblings applied. If one of them ever grows a dependency on another, this
    // fails and doc 24 gets corrected instead of quietly misleading.
    for (const file of BATCH) {
      const db = await bootSchema([...CONTENT_FOUNDATION, file])
      await db.close()
    }
    expect(BATCH).toHaveLength(6)
  })

  it('gives every new table row-level security, as the standing rule requires', async () => {
    const db = await bootSchema([...CONTENT_FOUNDATION, ...BATCH])

    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relname = any($1) and relkind = 'r'`,
      [[...NEW_TABLES]],
    )

    expect(r.rows).toHaveLength(NEW_TABLES.length)
    expect(r.rows.filter((row) => !row.relrowsecurity).map((row) => row.relname)).toEqual([])

    await db.close()
  })

  it('scopes every policy on every new table to the workspace', async () => {
    // A table with security switched on and a policy that forgot the workspace is
    // WORSE than one with no policy: the first looks protected in a catalog listing
    // and hands one customer another's rows.
    const db = await bootSchema([...CONTENT_FOUNDATION, ...BATCH])

    const r = await db.query<{ tablename: string; policyname: string; qual: string | null }>(
      `select tablename, policyname, coalesce(qual, with_check) as qual
         from pg_policies where tablename = any($1)`,
      [[...NEW_TABLES]],
    )

    expect(r.rows.length).toBeGreaterThan(0)
    const unscoped = r.rows
      .filter((row) => !(row.qual ?? '').includes('member_workspace_ids'))
      .map((row) => `${row.tablename}.${row.policyname}`)
    expect(unscoped).toEqual([])

    // And every one of them has at least one policy. A table whose policies were
    // forgotten entirely is unreadable rather than leaky, but it is still broken.
    const covered = new Set(r.rows.map((row) => row.tablename))
    expect([...NEW_TABLES].filter((t) => !covered.has(t))).toEqual([])

    await db.close()
  })

  it('indexes the workspace column every policy filters on', async () => {
    const db = await bootSchema([...CONTENT_FOUNDATION, ...BATCH])

    const r = await db.query<{ tablename: string; indexdef: string }>(
      `select tablename, indexdef from pg_indexes where tablename = any($1)`,
      [[...NEW_TABLES]],
    )

    const indexed = new Set(
      r.rows.filter((row) => /\(workspace_id\b/.test(row.indexdef)).map((row) => row.tablename),
    )
    expect([...NEW_TABLES].filter((t) => !indexed.has(t))).toEqual([])

    await db.close()
  })
})
