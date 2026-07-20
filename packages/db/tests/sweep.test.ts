import { describe, it, expect, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient } from './helpers/db'
import { sweepStaleFixtures } from './helpers/sweep'

/**
 * The sweep runs in each suite's beforeAll, BEFORE that suite has any fixtures — so a
 * broken time floor or an over-broad prefix would delete a concurrent run's live data
 * (or a real user's workspace) and every one of those suites would still pass. Its
 * failure mode is invisible where it is used, so it is verified here instead.
 *
 * Uses a prefix no suite uses, so this file can never sweep another suite's fixtures
 * or be swept by one.
 */
describe.skipIf(!hasRlsEnv)('sweepStaleFixtures', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const PREFIX = 'user_sweep_'
  const STALE = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const created: string[] = []

  async function makeWorkspace(createdBy: string, createdAt?: string): Promise<string> {
    const row: Record<string, unknown> = {
      name: 'sweep probe',
      slug: `sweep-${created.length}-${run}`,
      created_by: createdBy,
    }
    if (createdAt) row.created_at = createdAt
    const r = await svc().from('workspaces').insert(row).select('id').single()
    expect(r.error).toBeNull()
    created.push(r.data!.id)
    return r.data!.id
  }

  const exists = async (id: string): Promise<boolean> => {
    const r = await svc().from('workspaces').select('id').eq('id', id)
    return (r.data ?? []).length === 1
  }

  afterAll(async () => {
    // by id: the wildcard-trap row deliberately does NOT carry the sweep prefix
    for (const id of created) await svc().from('workspaces').delete().eq('id', id)
    await svc().from('users_profile').delete().like('user_id', 'user\\_sweep\\_%')
  })

  /**
   * A client that throws on ANY use. The unsafe-prefix test must never be handed a
   * live client: this assertion is about a throw that happens BEFORE any I/O, and
   * `''` expands to the pattern `%`, which matches every row in the table. Handing
   * it a real service client means that the moment the guard regresses — or is
   * deliberately disabled to check the test has teeth — the test itself performs an
   * unbounded delete. That is not hypothetical: it is exactly how this suite wiped
   * every tenant row out of the shared dev DB once.
   *
   * With this stub the test still fails if the guard regresses (the sweep reaches
   * for the client and throws the wrong error), but it cannot destroy anything.
   */
  const forbiddenClient = (): SupabaseClient =>
    new Proxy({} as SupabaseClient, {
      get() {
        throw new Error('sweep performed I/O despite an unsafe prefix')
      },
    })

  it('refuses a prefix that would widen the blast radius', async () => {
    // the guard is the reason a typo cannot become a mass delete
    for (const bad of ['', 'user_', 'user', 'user_boot', '%', 'user_BOOT_']) {
      await expect(sweepStaleFixtures(forbiddenClient(), bad)).rejects.toThrow(
        /sweep prefix must match/,
      )
    }
  })

  it('removes stale fixtures and spares fresh ones', async () => {
    const stale = await makeWorkspace(`${PREFIX}stale_${run}`, STALE)
    const fresh = await makeWorkspace(`${PREFIX}fresh_${run}`)

    await sweepStaleFixtures(svc(), PREFIX)

    expect(await exists(stale)).toBe(false)
    // the whole point of the floor: a concurrent run's live workspace must survive
    expect(await exists(fresh)).toBe(true)
  })

  it('treats _ as a literal, not as a single-character wildcard', async () => {
    // In SQL LIKE, `_` matches ANY character — so an unescaped 'user_sweep_%' also
    // matches 'userXsweepY…', and real Clerk subjects are literally `user_<base58>`.
    // This row is stale enough to be swept and would be, if the escaping regressed.
    const trap = await makeWorkspace(`userXsweepY_trap_${run}`, STALE)

    await sweepStaleFixtures(svc(), PREFIX)

    expect(await exists(trap)).toBe(true)
  })

  it('sweeps users_profile, which no workspace cascade reaches', async () => {
    // users_profile is keyed on user_id with no FK to workspaces, so bootstrap's
    // profile rows outlive their workspaces — user_boot_prof was exactly that.
    const staleId = `${PREFIX}profstale_${run}`
    const freshId = `${PREFIX}proffresh_${run}`
    // Both rows carry created_at explicitly. A PostgREST bulk insert requires a
    // UNIFORM key set: a key present on one row and absent on another is sent as
    // NULL rather than taking the column default, so the heterogeneous version of
    // this insert died on created_at's NOT NULL and silently inserted nothing.
    const seeded = await svc()
      .from('users_profile')
      .insert([
        { user_id: staleId, email: 'stale@example.com', created_at: STALE },
        { user_id: freshId, email: 'fresh@example.com', created_at: new Date().toISOString() },
      ])
    expect(seeded.error).toBeNull() // an unasserted fixture insert hides exactly this

    await sweepStaleFixtures(svc(), PREFIX)

    const left = await svc().from('users_profile').select('user_id').like('user_id', `${PREFIX}%`)
    const ids = (left.data ?? []).map((r) => r.user_id)
    expect(ids).toContain(freshId)
    expect(ids).not.toContain(staleId)
  })

  it('never touches a workspace outside the test-fixture namespace', async () => {
    // the failure that actually matters on a shared dev DB
    const realBefore = await svc()
      .from('workspaces')
      .select('id')
      .not('created_by', 'like', 'user\\_%')

    for (const prefix of ['user_sweep_', 'user_boot_', 'user_rls_', 'user_conn_']) {
      await sweepStaleFixtures(svc(), prefix)
    }

    const realAfter = await svc()
      .from('workspaces')
      .select('id')
      .not('created_by', 'like', 'user\\_%')

    // Survival, not set equality. What the sweep must never do is DELETE a workspace
    // outside its fixture namespace; it has no opinion on rows that APPEAR. Vitest runs
    // test files in parallel against this one shared dev project, so a sibling suite
    // committing a workspace between these two reads is normal — seed_demo.test.ts does
    // exactly that, and its `demo_seed_…` created_by is (by design) not `user_`-prefixed,
    // so it lands in both snapshots' scope. Asserting equality made this suite fail on a
    // concurrent INSERT, which is not the property under test.
    const before = new Set((realBefore.data ?? []).map((r) => r.id))
    const after = new Set((realAfter.data ?? []).map((r) => r.id))
    const deleted = [...before].filter((id) => !after.has(id))
    expect(deleted, 'the sweep deleted a workspace outside its fixture namespace').toEqual([])
  })
})
