import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { splitPhantoms, tablesCreatedByMigrations } from '@/lib/privacy/pending-tables'
import { EXPORT_TABLES } from '@/lib/privacy/export-manifest'

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
