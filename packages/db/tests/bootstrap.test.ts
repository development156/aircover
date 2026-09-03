import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asRole, bootFullSchema, probe } from './helpers/pglite-tenant'

/**
 * `public.bootstrap_workspace`, EXECUTED, on every gate run.
 *
 * ── WHAT THIS FILE USED TO BE ────────────────────────────────────────────────
 * Nine tests over PostgREST with minted member JWTs, under
 * `describe.skipIf(!hasRlsEnv)`. `hasRlsEnv` needs `SAHODA_ALLOW_LIVE_TESTS=1`
 * AND a target that is not production, and the only Supabase project this
 * repository owns IS production, so those nine had never executed anywhere.
 * The one write into the identity tables, the only free-credit source and the
 * one-workspace-per-user guard had zero executing coverage, and a regression
 * would have shipped green.
 *
 * ── WHAT RUNS HERE ───────────────────────────────────────────────────────────
 * Every migration on PGlite, the caller as `authenticated` with a `sub` claim
 * (`auth.jwt()` reads `request.jwt.claims`, exactly as it does behind
 * PostgREST), and the verification as the superuser after `reset role` so that
 * an erased or denied member's empty view can never pass for success.
 *
 * ── WHAT CANNOT RUN HERE, SAID PLAINLY ───────────────────────────────────────
 * The 4-way parallel first call (the double-submit race). PGlite is a
 * single-connection Postgres, so the `pg_advisory_xact_lock` in step 3 never
 * contends and a "race" of four sequential calls proves only the replay guard,
 * which the sequential test already covers. It is NOT pretended to execute.
 * And PostgREST's own grant boundary (the 42501 an anon client gets) is a
 * property of the role grants, tested here as `anon` being refused EXECUTE.
 *
 * ── THE GUARD THE MIGRATION `signup_grant_per_user` ADDED ────────────────────
 * The workspace dedupe is the advisory lock plus the owner replay guard, and
 * both key off `workspace_members`. `erase_workspace` deletes that row, so
 * bootstrap → erase → bootstrap made a second workspace AND a second 100-credit
 * grant, repeatable without limit from one account. The ledger survives erasure
 * and carries the Clerk sub as `actor`, so the grant is now skipped when that
 * actor has already been granted once. The erase test below is the proof.
 */

type Workspace = { id: string; name: string; slug: string; created_by: string }
type BootstrapResult = { workspace: Workspace; replayed: boolean }

let db: PGlite

/** Run `fn` as a signed-in member, then verify as the superuser; roll everything back. */
async function asUserThenVerify<T>(
  sub: string,
  act: (tx: PGlite) => Promise<unknown>,
  verify: (tx: PGlite) => Promise<T>,
): Promise<T> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    await act(db)
    await db.exec('reset role')
    return await verify(db)
  } finally {
    await db.exec('rollback')
  }
}

/** Switch the acting member mid-transaction (the superuser can always set a role). */
async function become(tx: PGlite, sub: string): Promise<void> {
  await tx.exec('reset role')
  await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub, role: 'authenticated' }),
  ])
  await tx.exec('set local role authenticated')
}

async function bootstrap(
  tx: PGlite,
  args: { name: string; slug: string; email?: string; displayName?: string },
): Promise<{ data: BootstrapResult | null; error: string | null }> {
  const out = await probe<{ j: BootstrapResult }>(
    tx,
    `select public.bootstrap_workspace($1, $2, $3, $4) as j`,
    [args.name, args.slug, args.email ?? null, args.displayName ?? null],
  )
  if ('denied' in out) return { data: null, error: out.denied }
  return { data: out.rows[0]?.j ?? null, error: null }
}

async function signupGrantsFor(tx: PGlite, sub: string): Promise<{ ws: string; amount: number }[]> {
  return (
    await tx.query<{ ws: string; amount: number }>(
      `select workspace_id::text as ws, amount from credit_ledger
        where entry_type = 'GRANT' and action_type = 'signup_grant' and actor = $1
        order by seq`,
      [sub],
    )
  ).rows
}

async function balanceOf(tx: PGlite, ws: string): Promise<number | null> {
  const rows = (
    await tx.query<{ balance_total: number }>(
      `select balance_total from credit_balances where workspace_id = $1`,
      [ws],
    )
  ).rows
  return rows[0]?.balance_total ?? null
}

beforeAll(async () => {
  db = await bootFullSchema()
}, 180_000)

describe('the harness can fail', () => {
  it('drops the superuser bit while acting, and gets it back to verify', async () => {
    const seen = await asUserThenVerify(
      'user_boot_harness',
      async (tx) => {
        const row = (
          await tx.query<{ superuser: string }>(
            `select current_setting('is_superuser') as superuser`,
          )
        ).rows[0]!
        expect(row.superuser).toBe('off')
      },
      async (tx) =>
        (
          await tx.query<{ superuser: string }>(
            `select current_setting('is_superuser') as superuser`,
          )
        ).rows[0]!.superuser,
    )
    expect(seen).toBe('on')
  })
})

describe('public.bootstrap_workspace', () => {
  it('creates workspace + owner membership + profile + signup grant atomically', async () => {
    const sub = 'user_boot_a'
    let result: BootstrapResult | null = null
    const seen = await asUserThenVerify(
      sub,
      async (tx) => {
        const { data, error } = await bootstrap(tx, {
          name: 'Boot A',
          slug: 'boot-a',
          email: 'a@example.com',
          displayName: 'Boot A',
        })
        expect(error).toBeNull()
        result = data
      },
      async (tx) => {
        const ws = result!.workspace.id
        const member = (
          await tx.query<{ role: string }>(
            `select role from workspace_members where workspace_id = $1 and user_id = $2`,
            [ws, sub],
          )
        ).rows
        const profile = (
          await tx.query<{ email: string }>(`select email from users_profile where user_id = $1`, [
            sub,
          ])
        ).rows
        return { member, profile, balance: await balanceOf(tx, ws) }
      },
    )
    expect(result!.replayed).toBe(false)
    expect(result!.workspace.slug).toBe('boot-a')
    expect(result!.workspace.created_by).toBe(sub)
    expect(seen.member).toEqual([{ role: 'owner' }])
    expect(seen.profile).toEqual([{ email: 'a@example.com' }])
    expect(seen.balance).toBe(100)
  })

  it('second call replays the existing workspace, and no second workspace exists', async () => {
    const sub = 'user_boot_replay'
    const seen = await asUserThenVerify(
      sub,
      async (tx) => {
        const first = await bootstrap(tx, { name: 'Once', slug: 'boot-once' })
        const second = await bootstrap(tx, { name: 'Twice', slug: 'boot-twice' })
        expect(first.error).toBeNull()
        expect(second.error).toBeNull()
        expect(second.data!.replayed).toBe(true)
        expect(second.data!.workspace.id).toBe(first.data!.workspace.id)
      },
      async (tx) =>
        (
          await tx.query<{ n: number }>(
            `select count(*)::int as n from workspaces where created_by = $1`,
            [sub],
          )
        ).rows[0]!.n,
    )
    expect(seen).toBe(1)
  })

  it('writes the signup grant exactly once, under the per-workspace key, even after a replay', async () => {
    const sub = 'user_boot_grant'
    let ws = ''
    const ledger = await asUserThenVerify(
      sub,
      async (tx) => {
        const first = await bootstrap(tx, { name: 'Grant', slug: 'boot-grant' })
        await bootstrap(tx, { name: 'Grant', slug: 'boot-grant2' })
        ws = first.data!.workspace.id
      },
      async (tx) =>
        (
          await tx.query<{ entry_type: string; amount: number; idempotency_key: string }>(
            `select entry_type, amount, idempotency_key from credit_ledger where workspace_id = $1`,
            [ws],
          )
        ).rows,
    )
    expect(ledger).toEqual([
      { entry_type: 'GRANT', amount: 100, idempotency_key: `grant:signup:${ws}` },
    ])
  })

  /**
   * THE REOPENED HOLE. LEARNINGS 2026-08-23 declared "unlimited free workspaces
   * x 100 credits" closed because bootstrap replays for an existing owner.
   * `erase_workspace` removes exactly the membership row that reasoning relied
   * on. This test is the loop a free-plan user could run from Settings > Your
   * data > Erase, then Create workspace, then spend, for ever.
   */
  it('bootstrap → erase → bootstrap grants the signup credits ONCE per person', async () => {
    const sub = 'user_boot_regrant'
    let firstWs = ''
    let secondWs = ''
    const seen = await asUserThenVerify(
      sub,
      async (tx) => {
        const first = await bootstrap(tx, { name: 'Mine', slug: 'boot-mine' })
        expect(first.error).toBeNull()
        firstWs = first.data!.workspace.id

        const erased = await probe<{ j: { rowsRemoved: number } }>(
          tx,
          `select public.erase_workspace($1, $2) as j`,
          [firstWs, 'Mine'],
        )
        expect('rows' in erased, 'denied' in erased ? erased.denied : '').toBe(true)

        const second = await bootstrap(tx, { name: 'Mine again', slug: 'boot-mine-2' })
        expect(second.error).toBeNull()
        expect(second.data!.replayed).toBe(false)
        secondWs = second.data!.workspace.id
        expect(secondWs).not.toBe(firstWs)
      },
      async (tx) => ({
        grants: await signupGrantsFor(tx, sub),
        secondBalance: await balanceOf(tx, secondWs),
      }),
    )
    expect(seen.grants).toEqual([{ ws: firstWs, amount: 100 }])
    // No row, or a row at zero. Either is "nothing was minted"; 100 is the defect.
    expect(seen.secondBalance ?? 0).toBe(0)
  })

  it('an existing profile row is kept, not clobbered (upsert conflict path)', async () => {
    const sub = 'user_boot_prof'
    const profile = await asUserThenVerify(
      sub,
      async (tx) => {
        await tx.exec('reset role')
        await tx.query(
          `insert into users_profile (user_id, email) values ($1, 'kept@example.com')`,
          [sub],
        )
        await become(tx, sub)
        const { data, error } = await bootstrap(tx, {
          name: 'Prof',
          slug: 'boot-prof',
          displayName: 'Prof P',
        })
        expect(error).toBeNull()
        expect(data!.replayed).toBe(false)
      },
      async (tx) =>
        (
          await tx.query<{ email: string; display_name: string }>(
            `select email, display_name from users_profile where user_id = $1`,
            [sub],
          )
        ).rows,
    )
    expect(profile).toEqual([{ email: 'kept@example.com', display_name: 'Prof P' }])
  })

  it('an invited editor still bootstraps their own workspace (owner-only replay guard)', async () => {
    const owner = 'user_boot_emp_o'
    const editor = 'user_boot_emp_e'
    await asUserThenVerify(
      owner,
      async (tx) => {
        const employer = await bootstrap(tx, { name: 'Employer', slug: 'boot-emp' })
        expect(employer.error).toBeNull()
        await tx.exec('reset role')
        await tx.query(
          `insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'editor')`,
          [employer.data!.workspace.id, editor],
        )
        await become(tx, editor)
        const own = await bootstrap(tx, { name: 'My Own', slug: 'boot-own' })
        expect(own.error).toBeNull()
        expect(own.data!.replayed).toBe(false)
        expect(own.data!.workspace.id).not.toBe(employer.data!.workspace.id)
      },
      async () => undefined,
    )
  })

  it("cross-user: B's bootstrap cannot claim A's slug or see A's workspace", async () => {
    const subA = 'user_boot_x_a'
    const subB = 'user_boot_x_b'
    let aId = ''
    const seen = await asUserThenVerify(
      subA,
      async (tx) => {
        const a = await bootstrap(tx, { name: 'Tenant A', slug: 'boot-x' })
        expect(a.error).toBeNull()
        aId = a.data!.workspace.id

        await become(tx, subB)
        const stolen = await bootstrap(tx, { name: 'Tenant B', slug: 'boot-x' })
        expect(stolen.data).toBeNull()
        expect(stolen.error).toMatch(/SLUG_TAKEN/)

        const b = await bootstrap(tx, { name: 'Tenant B', slug: 'boot-x-b' })
        expect(b.error).toBeNull()
        expect(b.data!.workspace.id).not.toBe(aId)

        // Through RLS, as B: the denial must be an empty successful read.
        const peek = await probe<{ id: string }>(tx, `select id from workspaces where id = $1`, [
          aId,
        ])
        expect('rows' in peek).toBe(true)
        expect('rows' in peek ? peek.rows : []).toHaveLength(0)
      },
      async (tx) =>
        (
          await tx.query<{ created_by: string }>(
            `select created_by from workspaces where id = $1`,
            [aId],
          )
        ).rows,
    )
    expect(seen).toEqual([{ created_by: subA }])
  })

  it('rejects blank names (incl. tab/NBSP) and malformed slugs with typed errors', async () => {
    await asUserThenVerify(
      'user_boot_bad',
      async (tx) => {
        expect((await bootstrap(tx, { name: '   ', slug: 'boot-bad' })).error).toMatch(
          /INVALID_NAME/,
        )
        expect((await bootstrap(tx, { name: '\t\n', slug: 'boot-bad2' })).error).toMatch(
          /INVALID_NAME/,
        )
        expect((await bootstrap(tx, { name: '\u00a0', slug: 'boot-bad3' })).error).toMatch(
          /INVALID_NAME/,
        )
        expect((await bootstrap(tx, { name: 'Bad', slug: 'Not A Slug!' })).error).toMatch(
          /INVALID_SLUG/,
        )
      },
      async () => undefined,
    )
  })

  it('refuses a caller with no sub inside the function, and anon at the grant boundary', async () => {
    const noSub = await asRole(db, 'authenticated', { role: 'authenticated' }, (tx) =>
      bootstrap(tx, { name: 'Nobody', slug: 'boot-nobody' }),
    )
    expect(noSub.error).toMatch(/AUTH_REQUIRED/)

    // EXECUTE is revoked from anon. If this ever reads AUTH_REQUIRED instead,
    // the grant boundary is gone and only the in-function check is left.
    const anon = await asRole(db, 'anon', { role: 'anon' }, (tx) =>
      bootstrap(tx, { name: 'Anon', slug: 'boot-anon' }),
    )
    expect(anon.error).toMatch(/permission denied/)
    expect(anon.error).not.toMatch(/AUTH_REQUIRED/)
  })
})
