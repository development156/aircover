import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, tenantTables } from './helpers/pglite-tenant'

/**
 * HOW FAR A MEMBER'S OWN DELETE COULD REACH — measured, not remembered.
 *
 * ── WHAT THIS FILE USED TO ASSERT, AND WHY IT CHANGED ────────────────────────
 * Until 2026-08-23 it asserted that `your-data-panel.tsx` rendered "Delete
 * everything" as a PARAGRAPH and never as a `<button>`. That was right while it
 * was true: most of a workspace's tables have no DELETE policy for a member, so
 * a button driven by the client would have deleted part of it and reported
 * success — the worst failure there is, because it is invisible and the customer
 * believes their data is gone.
 *
 * `public.erase_workspace` changed the fact those assertions described. It is a
 * `SECURITY DEFINER` function, so it is not bound by the policies below, and it
 * runs in one transaction.
 *
 * Those four assertions were rewritten IN THE SAME COMMIT that made the button
 * real, deliberately and by hand — not deleted to get a green run, and not
 * worked around by shaping the button to pass them. A test that pins an absence
 * has to be retired when the absence is filled, and the honest way to do that is
 * to replace what it asserted with what is now true. (This repo has the opposite
 * case on record: nine assertions that required a disabled "Saved" button, so a
 * correct fix looked like a regression.)
 *
 * ── WHAT IT ASSERTS NOW ──────────────────────────────────────────────────────
 * The measurement is unchanged and still matters: it is the REASON the erasure
 * has to be a definer function rather than a client loop. If a member could
 * delete everything themselves, the definer function would be unjustified
 * privilege. If they can delete NOTHING, the panel is claiming something the
 * database cannot do. Both directions are checked, and the panel is checked for
 * the sentences a customer has to be shown before they press it.
 *
 * It does NOT assert an exact count. Pinning 26 would fail on every migration
 * and train people to edit the number rather than think about it — the mistake
 * this repo has already recorded once. The counts are PRINTED so anybody who
 * does look is looking at a real number.
 */

let db: PGlite

/** The tables the panel names by hand, and the reason a definer function exists. */
const MOST_PERSONAL = ['brand_memory', 'inbox_threads', 'inbox_messages', 'leads']

const PANEL = resolve(
  import.meta.dirname,
  '../../../apps/web/src/components/settings/your-data-panel.tsx',
)
const MIGRATION = resolve(
  import.meta.dirname,
  '../supabase/migrations/20260823000000_dpdp_erasure.sql',
)

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

async function withoutMemberDelete(): Promise<string[]> {
  const tables = await tenantTables(db)
  const policies = (
    await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public'`,
    )
  ).rows
  const deletable = new Set(
    policies.filter((p) => p.cmd === 'DELETE' || p.cmd === 'ALL').map((p) => p.tablename),
  )
  return tables.filter((t) => !deletable.has(t))
}

describe('a member could not do this themselves', () => {
  it('cannot reach a substantial share of what a workspace owns', async () => {
    const tables = await tenantTables(db)
    const blocked = await withoutMemberDelete()
    // Printed so any comment quoting these figures can be corrected from a real
    // number rather than from memory.
    console.info(
      `[deletion reach] ${tables.length} workspace-owned tables; ` +
        `${blocked.length} with no member DELETE policy: ${blocked.join(', ')}`,
    )
    expect(blocked.length).toBeGreaterThan(0)
  })

  it('cannot reach the four tables holding the most personal data', async () => {
    // These four are the argument for a definer function. If a member could
    // delete them, `erase_workspace` would be privilege nobody needs.
    const blocked = new Set(await withoutMemberDelete())
    for (const table of MOST_PERSONAL) {
      expect(blocked.has(table), `${table} is now member-deletable`).toBe(true)
    }
  })
})

describe('so the erasure is a definer function, and it says so', () => {
  it('exists, is SECURITY DEFINER, and pins its search_path', async () => {
    const fn = (
      await db.query<{ secdef: boolean; config: string[] | null }>(
        `select p.prosecdef as secdef, p.proconfig as config
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'erase_workspace'`,
      )
    ).rows[0]
    expect(fn, 'public.erase_workspace does not exist').toBeDefined()
    expect(fn?.secdef).toBe(true)
    // A definer function without a pinned search_path is a privilege escalation
    // waiting for somebody to create `public.workspace_members` in a schema
    // earlier on the path.
    expect((fn?.config ?? []).join(',')).toMatch(/search_path=/)
  })

  it('is callable by a signed-in member and by nobody else', async () => {
    const grants = (
      await db.query<{ grantee: string }>(
        `select grantee from information_schema.role_routine_grants
          where routine_schema = 'public' and routine_name = 'erase_workspace'`,
      )
    ).rows.map((r) => r.grantee)
    expect(grants).toContain('authenticated')
    expect(grants).not.toContain('anon')
    expect(grants).not.toContain('PUBLIC')
  })

  it('names an owner check and a typed confirmation in its own source', async () => {
    // Behaviour is proven in `erasure.pglite.test.ts` against a real database.
    // This is the cheaper guard against somebody relaxing the gate later without
    // reading that suite.
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toMatch(/ERASURE_NOT_OWNER/)
    expect(sql).toMatch(/ERASURE_NAME_MISMATCH/)
    expect(sql).toMatch(/role = 'owner'/)
  })

  it('never writes to credit_ledger — not one statement', async () => {
    // The ledger never lies. A deletion path that could edit financial records
    // would be a bigger integrity problem than the one it solves, so this reads
    // the erasure's own source for any write to it.
    const sql = readFileSync(MIGRATION, 'utf8')
    const body = sql.slice(sql.indexOf('function public.erase_workspace'))
    expect(body).not.toMatch(/\b(update|insert\s+into|delete\s+from)\s+credit_ledger\b/i)
  })
})

describe('what the screen must say before somebody presses it', () => {
  it('names enquiries in what a deletion removes', () => {
    // The DPDP half the export cannot cover: a lead is a third party's name,
    // address and number, and the deletion route has to say it goes.
    const source = readFileSync(PANEL, 'utf8')
    const deleteSection = source.slice(source.indexOf('Delete everything'))
    expect(deleteSection).toMatch(/enquiries/i)
  })

  it('does not promise the credit record goes, because it does not', () => {
    const source = readFileSync(PANEL, 'utf8')
    const deleteSection = source.slice(source.indexOf('Delete everything'))
    expect(deleteSection).toMatch(/credit and payment record is kept/i)
  })

  it('says the pictures go from storage too', () => {
    // Postgres holds no files. A deletion that says "everything" and leaves the
    // photographs in a bucket is the same lie one layer down.
    const source = readFileSync(PANEL, 'utf8')
    expect(source).toMatch(/from storage as well as from here/i)
  })

  it('sends a just-erased person somewhere that works', () => {
    // NO DEAD ENDS. `/` redirects to `/home`, and `/home` renders its whole
    // shell against a workspace that no longer exists — which this repo already
    // has on record as reading "could not read balance". `/onboarding` is the
    // one route written to handle somebody with no workspace.
    const source = readFileSync(PANEL, 'utf8')
    expect(source).toMatch(/location\.assign\('\/onboarding'\)/)
  })

  it('requires the workspace name to be TYPED, not merely a second click', () => {
    const source = readFileSync(PANEL, 'utf8')
    expect(source).toMatch(/to confirm/i)
    // The button is disabled until it matches — and the server and the database
    // both re-check, which `erasure.pglite.test.ts` proves.
    expect(source).toMatch(/disabled=\{!nameMatches/)
  })
})
