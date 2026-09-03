import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

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
/**
 * ONE BOOT, IN A HOOK, AND THE REASON IS A GATE FAILURE THIS FILE CAUSED.
 *
 * Every other suite in this package boots its database in `beforeAll`, which
 * `vitest.config.ts` gives 60 seconds. This file was the only one booting inside
 * test BODIES, where the limit is `testTimeout`, 30 seconds — and it did it three
 * times, once per test.
 *
 * MEASURED 2026-08-29 under `turbo run typecheck lint test --force`: the file took
 * 72.2s, one of its three boots took 41.7s on its own, and that one failed with
 * `Test timed out in 30000ms`. The other two came in under the limit. Which of the
 * three loses is decided by what else the machine is compiling, so the same commit
 * passes alone and fails under turbo — the signature the config's own header
 * describes. An earlier unexplained `@sahoda/db#test` failure that did not
 * reproduce was almost certainly this, unmeasured at the time.
 *
 * The repair is not a bigger number. Two of the three boots were redundant: the
 * first two tests only READ the catalog, so they share one database. The third
 * creates views and gets its own, in a nested hook, so nothing depends on the
 * order tests happen to run in.
 */
let shared: PGlite

beforeAll(async () => {
  shared = await bootFullSchema()
})

describe('the isolation suite’s catalog', () => {
  it('is derived from this tree’s migrations, and reports its size', async () => {
    const tables = await tenantTables(shared)

    console.log(`migration files in this tree : ${migrationFiles().length}`)
    console.log(`tenant tables the suite sees : ${tables.length}`)
    console.log(tables.join(', '))

    // Catalog-driven, not list-driven: a real database answered.
    expect(tables.length).toBeGreaterThan(20)
    // And it is the branch's schema — the count moves with the migration set.
    expect(migrationFiles().length).toBeGreaterThan(40)
  })
})

/**
 * EVERY WORKSPACE-SCOPED VIEW MUST BE `security_invoker`.
 *
 * A view without it runs as its OWNER. `knowledge_current_chunks` selects
 * `workspace_id` out of `knowledge_chunks`, so owned by `postgres` it would hand
 * workspace B every row of workspace A's passages — RLS on the underlying table
 * would never be consulted, because the reader is no longer the caller.
 *
 * Driven from `pg_class.reloptions`, never from a list of view names: a view
 * added by a later migration joins this check on the day it lands.
 *
 * MEASURED 2026-08-22 against production (63 migrations applied): one view,
 * `knowledge_current_chunks`, `security_invoker = true`. It is created by a
 * migration this tree does not carry, so the assertion below currently
 * enumerates ZERO views here — which is why the count is printed and asserted
 * rather than left implicit. A guard that silently found nothing to check is the
 * failure mode this whole suite exists to avoid.
 */
/** The detector, as one function, so the same code answers both questions below. */
async function leakyViews(db: PGlite): Promise<string[]> {
  const rows = (
    await db.query<{ name: string; security_invoker: string; scoped: boolean }>(`
      select c.relname as name,
             coalesce((select option_value from pg_options_to_table(c.reloptions)
                       where option_name = 'security_invoker'), 'NOT SET') as security_invoker,
             exists (select 1 from information_schema.columns col
                     where col.table_schema = 'public'
                       and col.table_name = c.relname
                       and col.column_name = 'workspace_id') as scoped
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('v', 'm')
      order by c.relname
    `)
  ).rows
  console.log(`views seen: ${rows.length}`)
  for (const v of rows)
    console.log(`  ${v.name} scoped=${v.scoped} security_invoker=${v.security_invoker}`)
  return rows.filter((v) => v.scoped && v.security_invoker !== 'true').map((v) => v.name)
}

describe('workspace-scoped views', () => {
  it('never read as their owner', async () => {
    expect(await leakyViews(shared)).toEqual([])
  })

  /**
   * The guard above currently enumerates ZERO views in this tree, so on its own
   * it is a pass that proves nothing — the exact shape this suite exists to
   * catch. This one hands the same detector a view that IS leaky and requires it
   * to say so. Without this, deleting the detector's body would leave both green.
   *
   * It gets its own database because it CREATES views, and the test above asserts
   * that there are none to find. Sharing one instance would make that assertion a
   * statement about which test ran first.
   *
   * MEASURED, and stated because a guard never shown to fail is not a guard:
   * pointing `dirty` back at `shared` leaves all three tests GREEN. It passes on
   * declaration order alone, and would go red the day someone moved this block
   * above the one that asserts no leaky view exists. The separation below is
   * structural, not asserted — no test in this file fails if it is undone.
   */
  describe('when a leaky view exists', () => {
    let dirty: PGlite

    beforeAll(async () => {
      dirty = await bootFullSchema()
    })

    it('names a workspace-scoped view that is missing security_invoker', async () => {
      await dirty.exec(`create view audit_leaky_view as select workspace_id, id from posts`)
      expect(await leakyViews(dirty)).toEqual(['audit_leaky_view'])

      // And the correctly-declared form is not flagged, so the detector is not
      // simply answering "every view".
      await dirty.exec(
        `create view audit_safe_view with (security_invoker = true)
           as select workspace_id, id from posts`,
      )
      expect(await leakyViews(dirty)).toEqual(['audit_leaky_view'])
    })
  })
})
