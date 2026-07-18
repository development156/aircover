import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'

// Cross-tenant isolation must hold from an anon-key client (SQL-editor checks are
// banned as evidence). Skipped unless the anon/service keys + JWT secret are set.
describe.skipIf(!hasRlsEnv)('RLS tenant isolation', () => {
  const svc = serviceClient()
  const run = Date.now()
  const userA = `user_rls_a_${run}`
  const userB = `user_rls_b_${run}`
  let wsA = ''
  let wsB = ''
  let postA = ''

  beforeAll(async () => {
    const a = await svc
      .from('workspaces')
      .insert({ name: 'A', slug: `rls-a-${run}`, created_by: userA })
      .select('id')
      .single()
    const b = await svc
      .from('workspaces')
      .insert({ name: 'B', slug: `rls-b-${run}`, created_by: userB })
      .select('id')
      .single()
    wsA = a.data!.id
    wsB = b.data!.id
    await svc.from('workspace_members').insert([
      { workspace_id: wsA, user_id: userA, role: 'owner' },
      { workspace_id: wsB, user_id: userB, role: 'owner' },
    ])
    const p = await svc
      .from('posts')
      .insert({ workspace_id: wsA, created_by: userA, body: 'secret A' })
      .select('id')
      .single()
    postA = p.data!.id
  })

  afterAll(async () => {
    if (wsA) await svc.from('workspaces').delete().eq('id', wsA)
    if (wsB) await svc.from('workspaces').delete().eq('id', wsB)
  })

  it('positive control: member A reads own-tenant posts', async () => {
    const { data } = await userClient(userA).from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(1)
  })

  it('member B cannot read tenant A rows', async () => {
    const { data } = await userClient(userB).from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(0)
  })

  it('member B cannot insert into tenant A', async () => {
    const { error } = await userClient(userB)
      .from('posts')
      .insert({ workspace_id: wsA, created_by: userB, body: 'x' })
    expect(error).toBeTruthy()
  })

  it('signed-out anon is denied on posts', async () => {
    const { data } = await anonClient().from('posts').select('id').eq('id', postA)
    expect(data ?? []).toHaveLength(0)
  })

  it('service-only token vault is unreadable by an authenticated member', async () => {
    const { data, error } = await userClient(userA).from('connection_secrets').select('*').limit(1)
    expect((data ?? []).length === 0 || Boolean(error)).toBe(true)
  })

  it('authenticated members cannot call the ledger function', async () => {
    const { error } = await userClient(userA).rpc('apply_ledger_entry', {
      p_workspace_id: wsA,
      p_entry_type: 'GRANT',
      p_amount: 1_000_000,
      p_idempotency_key: `hack-${run}`,
    })
    expect(error).toBeTruthy()
  })

  it('mixed-tenant parent attack: A cannot attach a variant to B’s post', async () => {
    const pb = await svc
      .from('posts')
      .insert({ workspace_id: wsB, created_by: userB, body: 'B' })
      .select('id')
      .single()
    const { error } = await userClient(userA).from('post_variants').insert({
      workspace_id: wsA,
      post_id: pb.data!.id,
      channel: 'x',
      body: 'inject',
    })
    expect(error).toBeTruthy() // composite FK (post_id, workspace_id) has no (B-post, A) row
  })
})
