import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'
import { sweepStaleFixtures } from './helpers/sweep'

type Workspace = { id: string; name: string; slug: string; created_by: string }
type BootstrapResult = { workspace: Workspace; replayed: boolean }

// public.bootstrap_workspace is the ONE client-reachable write into the identity
// tables (their RLS has no INSERT policies by design). Exercised over PostgREST
// with minted member JWTs — the exact path apps/web will use.
describe.skipIf(!hasRlsEnv)('public.bootstrap_workspace', () => {
  // lazy: creating the client at collection time would throw before skipIf applies
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const users: string[] = []
  const workspaces: string[] = []

  function freshUser(tag: string): string {
    const sub = `user_boot_${tag}_${run}`
    users.push(sub)
    return sub
  }

  async function bootstrap(
    sub: string,
    args: { name: string; slug: string; email?: string; displayName?: string },
  ): Promise<{ data: BootstrapResult | null; error: { message: string } | null }> {
    const { data, error } = await userClient(sub).rpc('bootstrap_workspace', {
      p_name: args.name,
      p_slug: args.slug,
      p_email: args.email,
      p_display_name: args.displayName,
    })
    if (data?.workspace?.id) workspaces.push(data.workspace.id)
    return { data, error }
  }

  // This suite strands MORE than workspaces: bootstrap_workspace also writes
  // users_profile, which has no FK to workspaces and so survives the workspace
  // cascade. sweepStaleFixtures clears both. See helpers/sweep.ts.
  beforeAll(async () => {
    await sweepStaleFixtures(svc(), 'user_boot_')
  })

  afterAll(async () => {
    for (const id of [...new Set(workspaces)]) {
      await svc().from('workspaces').delete().eq('id', id)
    }
    if (users.length > 0) await svc().from('users_profile').delete().in('user_id', users)
  })

  it('creates workspace + owner membership + profile + signup grant atomically', async () => {
    const sub = freshUser('a')
    const { data, error } = await bootstrap(sub, {
      name: 'Boot A',
      slug: `boot-a-${run}`,
      email: 'a@example.com',
      displayName: 'Boot A',
    })
    expect(error).toBeNull()
    expect(data!.replayed).toBe(false)
    expect(data!.workspace.slug).toBe(`boot-a-${run}`)
    expect(data!.workspace.created_by).toBe(sub)

    const me = userClient(sub)
    const member = await me
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', data!.workspace.id)
      .eq('user_id', sub)
    expect(member.error).toBeNull()
    expect(member.data).toEqual([{ role: 'owner' }])

    const profile = await me.from('users_profile').select('email').eq('user_id', sub)
    expect(profile.error).toBeNull()
    expect(profile.data).toEqual([{ email: 'a@example.com' }])

    // 100cr signup grant (free plan credits), visible to the member
    const bal = await me
      .from('credit_balances')
      .select('balance_total, balance_held')
      .eq('workspace_id', data!.workspace.id)
    expect(bal.error).toBeNull()
    expect(bal.data).toEqual([{ balance_total: 100, balance_held: 0 }])
  })

  it('second call replays the existing workspace — no second workspace', async () => {
    const sub = freshUser('replay')
    const first = await bootstrap(sub, { name: 'Once', slug: `boot-once-${run}` })
    expect(first.error).toBeNull()

    const second = await bootstrap(sub, { name: 'Twice', slug: `boot-twice-${run}` })
    expect(second.error).toBeNull()
    expect(second.data!.replayed).toBe(true)
    expect(second.data!.workspace.id).toBe(first.data!.workspace.id)

    const owned = await svc().from('workspaces').select('id').eq('created_by', sub)
    expect(owned.error).toBeNull()
    expect(owned.data).toHaveLength(1)
  })

  it('grant appears exactly once with the signupGrantKey, even after a replay', async () => {
    const sub = freshUser('grant')
    const first = await bootstrap(sub, { name: 'Grant', slug: `boot-grant-${run}` })
    await bootstrap(sub, { name: 'Grant', slug: `boot-grant2-${run}` })
    const ws = first.data!.workspace.id

    const ledger = await userClient(sub)
      .from('credit_ledger')
      .select('entry_type, amount, idempotency_key')
      .eq('workspace_id', ws)
    expect(ledger.error).toBeNull()
    expect(ledger.data).toEqual([
      { entry_type: 'GRANT', amount: 100, idempotency_key: `grant:signup:${ws}` },
    ])
  })

  it('parallel first calls converge on one workspace (double-submit guard)', async () => {
    const sub = freshUser('race')
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        bootstrap(sub, { name: 'Race', slug: `boot-race-${i}-${run}` }),
      ),
    )
    for (const r of results) expect(r.error).toBeNull()
    const ids = new Set(results.map((r) => r.data!.workspace.id))
    expect(ids.size).toBe(1)
    expect(results.filter((r) => r.data!.replayed === false)).toHaveLength(1)
  })

  it('an existing profile row is kept, not clobbered (upsert conflict path)', async () => {
    const sub = freshUser('prof')
    const seeded = await svc()
      .from('users_profile')
      .insert({ user_id: sub, email: 'kept@example.com' })
    expect(seeded.error).toBeNull()

    // bootstrap without an email must keep the stored one; display_name still fills
    const { data, error } = await bootstrap(sub, {
      name: 'Prof',
      slug: `boot-prof-${run}`,
      displayName: 'Prof P',
    })
    expect(error).toBeNull()
    expect(data!.replayed).toBe(false)

    const profile = await userClient(sub)
      .from('users_profile')
      .select('email, display_name')
      .eq('user_id', sub)
    expect(profile.error).toBeNull()
    expect(profile.data).toEqual([{ email: 'kept@example.com', display_name: 'Prof P' }])
  })

  it('an invited editor still bootstraps their own workspace (owner-only replay guard)', async () => {
    const owner = freshUser('emp_o')
    const editor = freshUser('emp_e')
    const employer = await bootstrap(owner, { name: 'Employer', slug: `boot-emp-${run}` })
    expect(employer.error).toBeNull()

    const invite = await svc().from('workspace_members').insert({
      workspace_id: employer.data!.workspace.id,
      user_id: editor,
      role: 'editor',
    })
    expect(invite.error).toBeNull()

    const own = await bootstrap(editor, { name: 'My Own', slug: `boot-own-${run}` })
    expect(own.error).toBeNull()
    expect(own.data!.replayed).toBe(false)
    expect(own.data!.workspace.id).not.toBe(employer.data!.workspace.id)
  })

  it('signed-out anon is denied at the permission layer, not inside the function', async () => {
    const { error } = await anonClient().rpc('bootstrap_workspace', {
      p_name: 'Anon',
      p_slug: `boot-anon-${run}`,
    })
    // 42501 = EXECUTE denied. If this ever surfaces AUTH_REQUIRED instead, the
    // grant boundary is gone and only the in-function JWT check is left standing.
    expect(error).toBeTruthy()
    expect(error!.code).toBe('42501')
    expect(error!.message).not.toContain('AUTH_REQUIRED')
  })

  it("cross-user: B's bootstrap cannot claim A's slug or see A's workspace", async () => {
    const subA = freshUser('x_a')
    const subB = freshUser('x_b')
    const a = await bootstrap(subA, { name: 'Tenant A', slug: `boot-x-${run}` })
    expect(a.error).toBeNull()

    // B tries to take A's slug → typed error, A's workspace untouched
    const stolen = await bootstrap(subB, { name: 'Tenant B', slug: `boot-x-${run}` })
    expect(stolen.data).toBeNull()
    expect(stolen.error!.message).toContain('SLUG_TAKEN')

    const b = await bootstrap(subB, { name: 'Tenant B', slug: `boot-x-b-${run}` })
    expect(b.error).toBeNull()
    expect(b.data!.workspace.id).not.toBe(a.data!.workspace.id)

    // and B still cannot read A's workspace through RLS (error would be a
    // vacuous pass — the denial must be an empty, successful result)
    const peek = await userClient(subB)
      .from('workspaces')
      .select('id')
      .eq('id', a.data!.workspace.id)
    expect(peek.error).toBeNull()
    expect(peek.data).toHaveLength(0)
  })

  it('rejects blank names (incl. tab/NBSP) and malformed slugs with typed errors', async () => {
    const sub = freshUser('bad')
    const badName = await bootstrap(sub, { name: '   ', slug: `boot-bad-${run}` })
    expect(badName.error!.message).toContain('INVALID_NAME')

    const tabName = await bootstrap(sub, { name: '\t\n', slug: `boot-bad2-${run}` })
    expect(tabName.error!.message).toContain('INVALID_NAME')

    const nbspName = await bootstrap(sub, { name: '\u00a0', slug: `boot-bad3-${run}` })
    expect(nbspName.error!.message).toContain('INVALID_NAME')

    const badSlug = await bootstrap(sub, { name: 'Bad', slug: 'Not A Slug!' })
    expect(badSlug.error!.message).toContain('INVALID_SLUG')
  })
})
