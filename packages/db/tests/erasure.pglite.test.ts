import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import {
  asMember,
  bootFullSchema,
  probe,
  seedTwoWorkspaces,
  tenantTables,
} from './helpers/pglite-tenant'

/**
 * ONE FULL ERASURE, END TO END, AGAINST A REAL POSTGRES.
 *
 * ── WHAT THIS PROVES ─────────────────────────────────────────────────────────
 * A workspace is created, EVERY tenant table it owns is populated, the row
 * counts are read from the catalog, `public.erase_workspace` runs with the
 * append-only triggers ARMED, and the counts are read again. Zero rows must
 * remain anywhere except the financial record — and a second workspace, seeded
 * identically, must be untouched.
 *
 * ── THE FOUR WAYS THIS TEST COULD LIE TO ITSELF ─────────────────────────────
 *
 *  1. READING THE RESULT THROUGH RLS CONFIRMS ITSELF. This is not a hypothetical
 *     — the first version of this file did it. Erasure deletes
 *     `workspace_members`, so `app.member_workspace_ids()` immediately returns
 *     nothing, and every `select` the erasing member makes afterwards answers
 *     ZERO ROWS for every table in the database. The retained ledger read empty.
 *     The OTHER WORKSPACE read empty. An erasure that deleted nothing at all
 *     would have passed every count. So the verification drops back to the
 *     superuser (`reset role`) before it counts anything, and `countsAreNotRls`
 *     asserts the drop actually happened.
 *
 *  2. A TABLE THAT NEVER HELD A ROW passes "zero rows remain" vacuously. The
 *     BEFORE counts are asserted positive per table, and `seedTwoWorkspaces`
 *     reporting anything in `unseeded` FAILS the suite rather than printing it.
 *
 *  3. THE SEEDER DISARMS EVERY TRIGGER (`disable trigger all`) and re-arms them
 *     before returning. If the erasure ran while they were off, nothing here
 *     would say anything about `app.block_mutations` — which is the whole
 *     question, because four workspace-owned append-only tables can only be
 *     reached by a direct DELETE at depth 1. Read from `pg_trigger` immediately
 *     before the erasure, not assumed.
 *
 *  4. A DELETE WITH A MISSING `where` looks identical to a correct one when only
 *     one workspace exists. Workspace B is seeded from the same generic seeder
 *     and its counts are compared before and after.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * Storage objects (Postgres holds none — `storage.test.ts` covers the sweep),
 * and production's schema: this is the MIGRATION FILES. Both stated in docs/38
 * rather than left to be discovered.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
/** A third workspace whose rows are related to each other for real — see below. */
const WS_C = '33333333-3333-4333-8333-333333333333'
const USER_A = 'user_erasure_a'
const USER_B = 'user_erasure_b'
const USER_C = 'user_erasure_c'

/** The law's list, and the only thing erasure is allowed to leave behind. */
const RETAINED = ['credit_balances', 'credit_ledger', 'invoices', 'ledger_actor_redactions']

let db: PGlite
let tables: string[]
let before: Map<string, { a: number; b: number }>

/**
 * Erase as the OWNER, then verify as the SUPERUSER, in one transaction that is
 * rolled back.
 *
 * The role change is what makes the erasure run under the same identity a real
 * request has; `reset role` is what makes the verification see the database
 * rather than the erased member's view of it. Both halves matter and they are
 * not the same half — see trap 1 in the header.
 */
async function eraseThenVerify<T>(
  userId: string,
  workspaceId: string,
  typedName: string,
  verify: (tx: PGlite, result: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    const result = (
      await db.query<{ j: Record<string, unknown> }>(`select public.erase_workspace($1, $2) as j`, [
        workspaceId,
        typedName,
      ])
    ).rows[0]!.j
    await db.exec('reset role')
    return await verify(db, result)
  } finally {
    await db.exec('rollback')
  }
}

async function countAll(tx: PGlite): Promise<Map<string, { a: number; b: number }>> {
  const out = new Map<string, { a: number; b: number }>()
  for (const table of tables) {
    const row = (
      await tx.query<{ a: number; b: number }>(
        `select count(*) filter (where workspace_id = $1)::int as a,
                count(*) filter (where workspace_id = $2)::int as b
           from public."${table}"`,
        [WS_A, WS_B],
      )
    ).rows[0]
    out.set(table, { a: row?.a ?? 0, b: row?.b ?? 0 })
  }
  return out
}

/** Read from pg_trigger, because "the seeder re-armed them" is a claim, not a fact. */
async function armedGuards(tx: PGlite): Promise<string[]> {
  return (
    await tx.query<{ t: string }>(
      `select distinct tgrelid::regclass::text as t
         from pg_trigger
        where tgfoid = 'app.block_mutations'::regproc
          and tgenabled <> 'D'
        order by 1`,
    )
  ).rows.map((r) => r.t)
}

/**
 * Workspace C, whose rows actually REFERENCE each other.
 *
 * `seedTwoWorkspaces` runs with `disable trigger all`, and in Postgres a foreign
 * key IS a trigger — so its rows carry unrelated ids and nothing cascades to
 * anything. That is correct for its own purpose (it exists to give a POLICY
 * something to filter) and it makes it useless for the question "does the
 * cascade or the per-table delete do the work here", because with an unrelated
 * graph the answer is always "the per-table delete", by construction.
 *
 * So this fixture is inserted with the triggers ARMED and the keys real.
 */
async function seedRelated(): Promise<void> {
  await db.exec(`
    insert into workspaces (id, name, slug, created_by)
      values ('${WS_C}', 'Erasure Gamma', 'erasure-gamma', '${USER_C}');
    insert into workspace_members (workspace_id, user_id, role)
      values ('${WS_C}', '${USER_C}', 'owner');

    insert into sites (id, workspace_id, name, slug)
      values ('c0000000-0000-4000-8000-000000000001', '${WS_C}', 'Shop', 'shop');
    insert into site_pages (id, workspace_id, site_id, path, title)
      values ('c0000000-0000-4000-8000-000000000002', '${WS_C}',
              'c0000000-0000-4000-8000-000000000001', '/', 'Home');
    insert into site_sections (id, workspace_id, page_id, kind, sort, content)
      values ('c0000000-0000-4000-8000-000000000003', '${WS_C}',
              'c0000000-0000-4000-8000-000000000002', 'hero', 1, '{}'::jsonb);

    insert into connections (id, workspace_id, platform, external_account, status)
      values ('c0000000-0000-4000-8000-000000000004', '${WS_C}', 'x', '{}'::jsonb, 'active');
    insert into connection_secrets (connection_id, access_token_enc)
      values ('c0000000-0000-4000-8000-000000000004', '{}'::jsonb);

    insert into posts (id, workspace_id, title, status, channels)
      values ('c0000000-0000-4000-8000-000000000005', '${WS_C}', 'A post', 'draft', '{x}');
    insert into post_variants (id, workspace_id, post_id, channel, body)
      values ('c0000000-0000-4000-8000-000000000006', '${WS_C}',
              'c0000000-0000-4000-8000-000000000005', 'x', 'hello');
  `)
}

beforeAll(async () => {
  db = await bootFullSchema()
  tables = await tenantTables(db)

  await db.exec(`
    insert into workspaces (id, name, slug, created_by) values
      ('${WS_A}', 'Erasure Alpha', 'erasure-alpha', '${USER_A}'),
      ('${WS_B}', 'Erasure Beta', 'erasure-beta', '${USER_B}');
    insert into workspace_members (workspace_id, user_id, role) values
      ('${WS_A}', '${USER_A}', 'owner'), ('${WS_B}', '${USER_B}', 'owner');
    insert into users_profile (user_id, email, display_name) values
      ('${USER_A}', 'alpha@example.test', 'Alpha Owner'),
      ('${USER_B}', 'beta@example.test', 'Beta Owner');
  `)

  const report = await seedTwoWorkspaces(db, WS_A, WS_B, { [WS_A]: USER_A, [WS_B]: USER_B })
  if (report.unseeded.length > 0) {
    // NOT a console.log. A table the seeder could not fill is a table this file
    // silently excuses from every assertion below, and that is the exact shape
    // of a suite that proves nothing while reporting green.
    throw new Error(
      `the erasure proof cannot run: ${report.unseeded.length} tenant table(s) unseeded:\n` +
        report.unseeded.map((u) => `    ${u.table} — ${u.reason}`).join('\n'),
    )
  }

  await seedRelated()
  before = await countAll(db)
}, 180_000)

describe('the harness can fail', () => {
  it('found every tenant table from the catalog', () => {
    expect(tables.length).toBeGreaterThan(40)
  })

  it('populated every one of them for BOTH workspaces before anything is erased', () => {
    const empty = tables.filter(
      (t) => (before.get(t)?.a ?? 0) === 0 || (before.get(t)?.b ?? 0) === 0,
    )
    // Without this, "zero rows remain" is satisfied by a table that never had any.
    expect(empty, `these tables held no rows to erase: ${empty.join(', ')}`).toEqual([])
  })

  it('has the append-only guards ARMED, after the seeder turned them off', async () => {
    const armed = await armedGuards(db)
    expect(armed.length).toBeGreaterThanOrEqual(9)
    expect(armed).toContain('credit_ledger')
    expect(armed).toContain('audit_logs')
  })

  it('counts as the superuser, so an erased member’s empty view cannot pass for success', async () => {
    // The assertion that keeps trap 1 closed. If `eraseThenVerify` ever stops
    // dropping the role, this fails HERE rather than turning every count below
    // into a tautology.
    const seen = await eraseThenVerify(USER_A, WS_A, 'Erasure Alpha', async (tx) => {
      const row = (
        await tx.query<{ user: string; superuser: string }>(
          `select current_user as "user", current_setting('is_superuser') as superuser`,
        )
      ).rows[0]!
      // Workspace B's rows are visible only to somebody who is NOT reading
      // through USER_A's membership.
      const b = (
        await tx.query<{ n: number }>(
          `select count(*)::int as n from posts where workspace_id = $1`,
          [WS_B],
        )
      ).rows[0]!.n
      return { ...row, b }
    })
    expect(seen.superuser).toBe('on')
    expect(seen.b).toBeGreaterThan(0)
  })
})

describe('who may erase', () => {
  it('refuses somebody who is not signed in', async () => {
    // An anonymous PostgREST request carries an EMPTY `sub`, not a missing one.
    const out = await asMember(db, '', (tx) =>
      probe(tx, `select public.erase_workspace($1, $2)`, [WS_A, 'Erasure Alpha']),
    )
    expect('denied' in out ? out.denied : '').toMatch(/ERASURE_NOT_SIGNED_IN/)
  })

  it('refuses a member of ANOTHER workspace', async () => {
    const out = await asMember(db, USER_B, (tx) =>
      probe(tx, `select public.erase_workspace($1, $2)`, [WS_A, 'Erasure Alpha']),
    )
    expect('denied' in out ? out.denied : '').toMatch(/ERASURE_NOT_OWNER/)
  })

  it('refuses the owner when the typed name does not match', async () => {
    const out = await asMember(db, USER_A, (tx) =>
      probe(tx, `select public.erase_workspace($1, $2)`, [WS_A, 'Erasure Alfa']),
    )
    expect('denied' in out ? out.denied : '').toMatch(/ERASURE_NAME_MISMATCH/)
  })

  it('does not make the owner match case or spacing', async () => {
    // A confirmation the customer is COPYING BACK, not a password. A refusal on
    // a trailing space is a dead end with no message that could explain it.
    const out = await asMember(db, USER_A, (tx) =>
      probe(tx, `select public.erase_workspace($1, $2)`, [WS_A, '  erasure alpha ']),
    )
    expect('rows' in out).toBe(true)
  })
})

describe('the erasure itself', () => {
  it('leaves zero rows everywhere except the financial record, and B untouched', async () => {
    const result = await eraseThenVerify(USER_A, WS_A, 'Erasure Alpha', async (tx, run) => {
      const after = await countAll(tx)
      const ws = (
        await tx.query<{
          name: string
          slug: string
          created_by: string
          deleted_at: string | null
        }>(`select name, slug, created_by, deleted_at from workspaces where id = $1`, [WS_A])
      ).rows[0]!
      const profiles = (
        await tx.query<{ user_id: string }>(`select user_id from users_profile order by 1`)
      ).rows.map((r) => r.user_id)
      return { run, after, ws, profiles }
    })

    // 1 · Nothing of A's is left outside the retained set. Named, not counted.
    const leftover = tables.filter(
      (t) => !RETAINED.includes(t) && (result.after.get(t)?.a ?? 0) > 0,
    )
    expect(leftover, `rows survived the erasure in: ${leftover.join(', ')}`).toEqual([])

    // 2 · The retained set is retained — the same number of rows, not merely some.
    for (const table of RETAINED) {
      expect(result.after.get(table)?.a, `${table} was erased and must not be`).toBe(
        before.get(table)?.a,
      )
    }

    // 3 · Workspace B is exactly as it was. This is the assertion that catches a
    //     DELETE whose `where` went missing — indistinguishable from success when
    //     only one workspace exists.
    const collateral = tables.filter(
      (t) => (result.after.get(t)?.b ?? 0) !== (before.get(t)?.b ?? 0),
    )
    expect(collateral, `workspace B lost rows in: ${collateral.join(', ')}`).toEqual([])

    // 4 · The tombstone. The row survives because the retained rows need a parent,
    //     and it says nothing about the customer any more.
    expect(result.ws.name).toBe('Deleted workspace')
    expect(result.ws.created_by).toBe('erased')
    expect(result.ws.slug).toBe(`deleted-${WS_A}`)
    expect(result.ws.deleted_at).not.toBeNull()

    // 5 · The sign-in profile of the person left with no workspace. Keyed by
    //     user_id, so NO sweep over workspace-owned tables could reach it.
    expect(result.profiles).toEqual([USER_B])

    // 6 · The result names what it kept, so the caller does not re-derive it.
    expect(result.run.retained).toEqual([
      'credit_ledger',
      'credit_balances',
      'invoices',
      'ledger_actor_redactions',
    ])
  }, 180_000)

  it('MEASURES which path removed each table — direct delete or cascade', async () => {
    const perTable = await eraseThenVerify(
      USER_C,
      WS_C,
      'Erasure Gamma',
      async (_tx, run) => (run as { perTable: Record<string, number> }).perTable,
    )

    // Workspace C's rows reference each other for real (see `seedRelated`). A
    // table whose OWN delete reported rows took the per-table path; one that
    // held rows and reported none was already gone when its turn came, because a
    // parent's cascade reached it first.
    const byDelete = Object.entries(perTable)
      .filter(([, n]) => n > 0)
      .map(([t]) => t)

    // MEASURED, and it is a fact about the ALPHABETICAL order the erasure walks:
    // `site_pages` sorts before `sites`, so the page is deleted directly and
    // `site_sections` — whose parent is the page — is reached by the CASCADE.
    expect(byDelete).toContain('sites')
    expect(byDelete).toContain('site_pages')
    expect(byDelete).not.toContain('site_sections')

    // `post_variants` sorts before `posts`, so it takes the per-table path.
    expect(byDelete).toContain('posts')
    expect(byDelete).toContain('post_variants')
  }, 180_000)

  it('takes `connection_secrets` with the connection, which no sweep could reach', async () => {
    // It is keyed by `connection_id` and carries no `workspace_id`, so it is
    // absent from the catalog query the erasure is built from. The ONLY thing
    // that removes it is the cascade — and it holds the OAuth tokens, which is
    // the single worst row in this database to leave behind.
    const left = await eraseThenVerify(
      USER_C,
      WS_C,
      'Erasure Gamma',
      async (tx) =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from connection_secrets`))
          .rows[0]!.n,
    )
    expect(left).toBe(0)
  }, 180_000)
})

describe('the append-only guard, and the size of its exception', () => {
  /**
   * These run as the SUPERUSER on purpose — the service-role case.
   *
   * Run as a member they would prove nothing: RLS gives `authenticated` no
   * DELETE policy on any of these tables, so the statement matches zero rows,
   * the per-row trigger never fires, and the delete "succeeds" having done
   * nothing. That is a green test watching the wrong half.
   */
  it('still refuses a DELETE on the ledger, exemption set or not', async () => {
    await db.exec('begin')
    await db.query(`select set_config('app.erasing_workspace', $1, true)`, [WS_A])
    const out = await probe(db, `delete from credit_ledger where workspace_id = $1`, [WS_A])
    await db.exec('rollback')
    expect('denied' in out ? out.denied : '').toMatch(/append-only/)
  })

  it('still refuses a DELETE on invoices, exemption set or not', async () => {
    await db.exec('begin')
    await db.query(`select set_config('app.erasing_workspace', $1, true)`, [WS_A])
    const out = await probe(db, `delete from invoices where workspace_id = $1`, [WS_A])
    await db.exec('rollback')
    expect('denied' in out ? out.denied : '').toMatch(/append-only/)
  })

  it('never permits an UPDATE, exemption set or not', async () => {
    await db.exec('begin')
    await db.query(`select set_config('app.erasing_workspace', $1, true)`, [WS_A])
    const out = await probe(db, `update audit_logs set action = 'x' where workspace_id = $1`, [
      WS_A,
    ])
    await db.exec('rollback')
    expect('denied' in out ? out.denied : '').toMatch(/append-only/)
  })

  it('still refuses a DELETE on an append-only table with NO exemption set', async () => {
    // The guard is unchanged for everybody who is not erasing. Without this the
    // three above would pass on a trigger that had simply stopped working.
    await db.exec('begin')
    const out = await probe(db, `delete from audit_logs where workspace_id = $1`, [WS_A])
    await db.exec('rollback')
    expect('denied' in out ? out.denied : '').toMatch(/append-only/)
  })

  it('hands a MEMBER nothing: every guarded tenant table refuses them a DELETE anyway', async () => {
    // The exemption is a GUC, and any role may set a custom GUC. What stands
    // between a member and these rows is RLS, and this is the measurement that
    // says so rather than the argument.
    const guarded = (
      await db.query<{ t: string }>(
        `select distinct tgrelid::regclass::text as t from pg_trigger
          where tgfoid = 'app.block_mutations'::regproc order by 1`,
      )
    ).rows.map((r) => r.t)
    const tenantGuarded = guarded.filter((t) => tables.includes(t))
    expect(tenantGuarded.length).toBeGreaterThanOrEqual(9)

    const deletable = (
      await db.query<{ tablename: string }>(
        `select tablename from pg_policies
          where schemaname = 'public' and (cmd = 'DELETE' or cmd = 'ALL')
            and 'authenticated' = any(roles)`,
      )
    ).rows.map((r) => r.tablename)

    const reachable = tenantGuarded.filter((t) => deletable.includes(t))
    expect(
      reachable,
      `these append-only tables now have a member DELETE policy, so the erasure ` +
        `exemption would hand a member a way through: ${reachable.join(', ')}`,
    ).toEqual([])
  })
})

describe('the ledger redaction mechanism is built and INERT', () => {
  it('is not callable by a member at all', async () => {
    const out = await asMember(db, USER_A, (tx) =>
      probe(tx, `select app.redact_ledger_actor($1, $2)`, [WS_A, 'x']),
    )
    expect('denied' in out ? out.denied : '').toMatch(/permission denied/)
  })

  it('erasure does not redact — the decision is not taken by an implementation', async () => {
    // Asked of workspace C, which the generic seeder never filled — so a row
    // here could only have been written by the erasure itself.
    const rows = await eraseThenVerify(
      USER_C,
      WS_C,
      'Erasure Gamma',
      async (tx) =>
        (
          await tx.query<{ n: number }>(
            `select count(*)::int as n from ledger_actor_redactions where workspace_id = $1`,
            [WS_C],
          )
        ).rows[0]!.n,
    )
    expect(rows).toBe(0)
  })

  it('redacts at READ time and never edits the ledger', async () => {
    await db.exec('begin')
    const actorBefore = (
      await db.query<{ actor: string | null }>(
        `select actor from credit_ledger where workspace_id = $1 limit 1`,
        [WS_A],
      )
    ).rows[0]?.actor
    await db.query(`select app.redact_ledger_actor($1, $2)`, [WS_A, 'counsel ruling, pending'])
    const view = (
      await db.query<{
        actor: string | null
        actor_disclosed: string | null
        actor_redacted: boolean
      }>(
        `select actor, actor_disclosed, actor_redacted
           from credit_ledger_readable where workspace_id = $1 limit 1`,
        [WS_A],
      )
    ).rows[0]!
    await db.exec('rollback')

    // The stored bytes are untouched — the property that keeps the ledger's
    // integrity intact while what is DISCLOSED changes.
    expect(view.actor).toBe(actorBefore)
    expect(view.actor_redacted).toBe(true)
    expect(view.actor_disclosed).toBeNull()
  })

  it('refuses a redaction with no authority recorded', async () => {
    await db.exec('begin')
    const out = await probe(db, `select app.redact_ledger_actor($1, $2)`, [WS_A, '   '])
    await db.exec('rollback')
    expect('denied' in out ? out.denied : '').toMatch(/authority/)
  })

  it('the view runs with the CALLER’s rights, not its owner’s', async () => {
    // A view over an RLS-protected table that runs as its owner hands every
    // workspace's ledger to anyone who selects it. `security_invoker` is off
    // unless spelled, and nothing about the definition hints at it.
    const opt = (
      await db.query<{ ok: boolean }>(
        `select coalesce((select option = 'security_invoker=true'
                            from unnest(cl.reloptions) as option
                           where option like 'security_invoker=%' limit 1), false) as ok
           from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
          where n.nspname = 'public' and cl.relname = 'credit_ledger_readable'`,
      )
    ).rows[0]
    expect(opt?.ok).toBe(true)
  })
})

describe('the preview the confirmation screen is built from', () => {
  it('counts every tenant table and says which are kept', async () => {
    const rows = await asMember(
      db,
      USER_A,
      async (tx) =>
        (
          await tx.query<{ table_name: string; rows_held: number; disposition: string }>(
            `select table_name, rows_held::int as rows_held, disposition
               from public.workspace_erasure_preview($1) order by table_name`,
            [WS_A],
          )
        ).rows,
    )
    expect(rows.map((r) => r.table_name)).toEqual([...tables].sort())
    const kept = rows.filter((r) => r.disposition === 'kept').map((r) => r.table_name)
    expect(kept.sort()).toEqual(RETAINED)
    // Real counts, not a shape. A preview of zeroes would let the screen say
    // "nothing to remove" about a full workspace.
    expect(rows.every((r) => r.rows_held > 0)).toBe(true)
  })

  it('refuses a member of another workspace', async () => {
    const out = await asMember(db, USER_B, (tx) =>
      probe(tx, `select * from public.workspace_erasure_preview($1)`, [WS_A]),
    )
    expect('denied' in out ? out.denied : '').toMatch(/ERASURE_NOT_OWNER/)
  })
})
