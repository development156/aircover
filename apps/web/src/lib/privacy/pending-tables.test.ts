import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  splitPhantoms,
  tablesCreatedByMigrations,
  tablesWithWorkspaceId,
} from '@/lib/privacy/pending-tables'
import { EXPORT_TABLES, OMITTED_BY_DESIGN } from '@/lib/privacy/export-manifest'

/**
 * "INVENTED" AND "NOT YET APPLIED" MUST STAY APART.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM export-drift.test.ts ────────────────
 * That suite needs a live database and skips without one, and in this sandbox it
 * cannot resolve the host at all. So the logic it now depends on would ship
 * unexercised — a guard nothing has shown to fail. This tests the same functions
 * with no database in sight.
 */

const MIGRATIONS_DIR = resolve(
  import.meta.dirname,
  '../../../../../packages/db/supabase/migrations',
)

/**
 * `OMITTED_BY_DESIGN.table` is prose, not data: several entries name more than
 * one table joined by ` · `, and one of them — the ops row — trails off into
 * "and other ops tables" rather than naming every one. Splitting on the
 * separator and keeping only the leading identifier-looking token off each
 * piece reads the real names out of that without pretending the trailing
 * prose is a table.
 */
function omittedTableNames(): string[] {
  return OMITTED_BY_DESIGN.flatMap((entry) =>
    entry.table
      .split('·')
      .map((piece) => /^[a-z_][a-z0-9_]*/.exec(piece.trim())?.[0])
      .filter((name): name is string => name !== undefined),
  )
}

describe('tablesCreatedByMigrations', () => {
  const created = tablesCreatedByMigrations(MIGRATIONS_DIR)

  it('finds the migrations at all, so an empty scan cannot excuse everything', () => {
    // If this ever collapses to a handful, the scan broke and every manifest
    // entry would be classified as "pending" — the guard silently stops
    // guarding, which is the exact failure this list is meant to prevent.
    expect(created.size).toBeGreaterThan(40)
  })

  it('finds tables written plainly and with IF NOT EXISTS', () => {
    expect(created.has('loop_cycles')).toBe(true)
    expect(created.has('loop_autopilot_log')).toBe(true)
    expect(created.has('credit_ledger')).toBe(true)
  })

  it('does not invent a table no migration creates', () => {
    expect(created.has('a_table_nobody_wrote')).toBe(false)
  })

  /**
   * The manifest is the input the drift test feeds this. Every entry in it
   * should be creatable by a migration on this branch — an entry that is not is
   * either a typo or a table that has been renamed away, and both are the defect
   * the phantom check exists for.
   */
  it('every export-manifest table is created by some migration on this branch', () => {
    const orphans = EXPORT_TABLES.map((t) => t.table).filter((t) => !created.has(t))
    expect(orphans, `manifest entries no migration creates: ${orphans.join(', ')}`).toEqual([])
  })
})

describe('splitPhantoms', () => {
  const migrations = new Set(['applied_table', 'written_not_applied'])

  it('says nothing when every manifest entry is live', () => {
    expect(splitPhantoms(['applied_table'], ['applied_table'], migrations)).toEqual({
      invented: [],
      pending: [],
    })
  })

  /**
   * THE STATE THIS WAS BUILT FOR. `db push = ASK`, so a table lives in the
   * migration files before it lives in production, and the manifest must
   * already name it because the pglite suite runs against the branch schema.
   */
  it('calls a table with a migration and no live row PENDING, not invented', () => {
    expect(splitPhantoms(['written_not_applied'], [], migrations)).toEqual({
      invented: [],
      pending: ['written_not_applied'],
    })
  })

  /**
   * AND THE DEFECT IS STILL CAUGHT. A manifest naming a table no migration
   * creates means a customer's export silently omits data, which is the one
   * claim an export must never make falsely.
   */
  it('calls a table with NO migration invented, which is still a failure', () => {
    expect(splitPhantoms(['typo_tabel'], [], migrations)).toEqual({
      invented: ['typo_tabel'],
      pending: [],
    })
  })

  it('separates the two when both are present in one manifest', () => {
    const r = splitPhantoms(
      ['applied_table', 'written_not_applied', 'typo_tabel'],
      ['applied_table'],
      migrations,
    )
    expect(r.invented).toEqual(['typo_tabel'])
    expect(r.pending).toEqual(['written_not_applied'])
  })
})

describe('tablesWithWorkspaceId', () => {
  const derived = tablesWithWorkspaceId(MIGRATIONS_DIR)

  it('finds an ordinary table declared with the column at create time', () => {
    expect(derived.has('posts')).toBe(true)
    expect(derived.has('connections')).toBe(true)
  })

  it('does not invent a table no migration creates', () => {
    expect(derived.has('a_table_nobody_wrote')).toBe(false)
  })

  it('does not claim a table that genuinely has no workspace_id', () => {
    // connection_secrets is keyed by connection_id and deliberately carries no
    // workspace_id of its own — see OMITTED_BY_DESIGN's entry for it.
    expect(derived.has('connection_secrets')).toBe(false)
  })

  /**
   * THE ALWAYS-ON GUARD Q-23 EXISTS FOR.
   *
   * `export-drift.test.ts` asks this same question of the LIVE database and
   * skips without one — which in this sandbox is every run, per its own
   * header. `export_manifest.pglite.test.ts` (packages/db) asks it against a
   * real Postgres with every migration applied, but it only diffs against
   * `EXPORT_TABLES`, not the union with `OMITTED_BY_DESIGN` — so a
   * workspace-owned table someone filed as a deliberate omission, rather than
   * an export entry, would still read as "missing" there rather than as the
   * documented decision it is.
   *
   * This is the one guard that runs everywhere, needs no database, and checks
   * the union: every table the migrations give a `workspace_id` must be named
   * either as something the export produces, or as something it deliberately
   * does not — never neither.
   */
  it('names every workspace_id table in the export manifest or in a stated omission', () => {
    const manifestTables = new Set(EXPORT_TABLES.map((t) => t.table))
    const omittedTables = new Set(omittedTableNames())
    const unaccounted = [...derived].filter((t) => !manifestTables.has(t) && !omittedTables.has(t))
    expect(
      unaccounted,
      `these tables carry workspace_id and are named in NEITHER the export ` +
        `manifest nor OMITTED_BY_DESIGN, so an export cannot honestly claim to ` +
        `cover them either way: ${unaccounted.join(', ')}`,
    ).toEqual([])
  })
})
