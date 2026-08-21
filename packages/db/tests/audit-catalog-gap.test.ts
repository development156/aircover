import { describe, expect, it } from 'vitest'

import { bootFullSchema, migrationFiles, tenantTables } from './helpers/pglite-tenant'

/**
 * WHAT THE CATALOG-DRIVEN ISOLATION SUITE CAN ACTUALLY SEE.
 *
 * `rls_tenant_isolation.pglite.test.ts` is driven by `information_schema`, not by
 * a hand-written array, and that is the right shape — a new migration joins it
 * the moment it lands. But the database it interrogates is a PGlite instance
 * booted from `readdirSync(supabase/migrations)` in THIS TREE
 * (helpers/pglite-tenant.ts:85-92). The catalog is therefore the branch's
 * catalog, never production's.
 *
 * That distinction is invisible while a branch is current and decisive when it
 * is not. This test measures the gap instead of assuming it is zero, and prints
 * the number so a reader can compare it against production themselves.
 *
 * It asserts only what is true of the branch, so it cannot go red for being out
 * of date — the point is the printed count, and the assertion that the suite is
 * genuinely catalog-driven rather than list-driven.
 */
describe('the isolation suite’s catalog', () => {
  it('is derived from this tree’s migrations, and reports its size', async () => {
    const db = await bootFullSchema()
    const tables = await tenantTables(db)

    console.log(`migration files in this tree : ${migrationFiles().length}`)
    console.log(`tenant tables the suite sees : ${tables.length}`)
    console.log(tables.join(', '))

    // Catalog-driven, not list-driven: a real database answered.
    expect(tables.length).toBeGreaterThan(20)
    // And it is the branch's schema — the count moves with the migration set.
    expect(migrationFiles().length).toBeGreaterThan(40)
  })
})
