import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'
import { sweepStaleFixtures } from './helpers/sweep'

type UpsertResult = { connection_id: string }

// public.upsert_connection is the OAuth callback's write path: `connections` has no
// INSERT policy and `connection_secrets` has RLS with zero policies, so this
// SECURITY DEFINER function is the only client-reachable way in. Exercised over
// PostgREST with minted member JWTs — the exact path apps/web will use.
describe.skipIf(!hasRlsEnv)('public.upsert_connection', () => {
  // lazy: creating the client at collection time would throw before skipIf applies
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())
  const run = Date.now()
  const owner = `user_conn_owner_${run}`
  const stranger = `user_conn_stranger_${run}`
  const viewer = `user_conn_viewer_${run}`
  const editor = `user_conn_editor_${run}`
  let wsA = ''
  let wsB = ''

  // The function treats these as opaque, so a structurally-valid stand-in envelope is
  // the honest fixture: a real seal would test @sahoda/publishing's crypto, not this
  // function's contract. Shape mirrors EncryptedToken {iv,tag,data,key_version}.
  const envelope = (marker: string) => ({
    iv: `iv-${marker}`,
    tag: `tag-${marker}`,
    data: `data-${marker}`,
    key_version: 1,
  })

  const ACCOUNT_ID = `acct-${run}`

  async function upsert(
    sub: string,
    over: Record<string, unknown> = {},
  ): Promise<{ data: UpsertResult | null; error: { message: string; code?: string } | null }> {
    const { data, error } = await userClient(sub).rpc('upsert_connection', {
      p_workspace_id: wsA,
      p_platform: 'x',
      p_external_account: { id: ACCOUNT_ID, handle: 'acme' },
      p_scopes: ['tweet.read', 'tweet.write'],
      p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_access_token_enc: envelope('access-1'),
      p_refresh_token_enc: envelope('refresh-1'),
      p_token_type: 'bearer',
      ...over,
    })
    return { data, error }
  }

  beforeAll(async () => {
    // afterAll-only cleanup: an interrupted run strands both workspaces and the
    // connections + sealed secrets hanging off them. See helpers/sweep.ts.
    await sweepStaleFixtures(svc(), 'user_conn_')

    const a = await svc()
      .from('workspaces')
      .insert({ name: 'Conn A', slug: `conn-a-${run}`, created_by: owner })
      .select('id')
      .single()
    const b = await svc()
      .from('workspaces')
      .insert({ name: 'Conn B', slug: `conn-b-${run}`, created_by: stranger })
      .select('id')
      .single()
    wsA = a.data!.id
    wsB = b.data!.id
    await svc()
      .from('workspace_members')
      .insert([
        { workspace_id: wsA, user_id: owner, role: 'owner' },
        { workspace_id: wsA, user_id: viewer, role: 'viewer' },
        { workspace_id: wsA, user_id: editor, role: 'editor' },
        { workspace_id: wsB, user_id: stranger, role: 'owner' },
      ])
  })

  afterAll(async () => {
    if (wsA) await svc().from('workspaces').delete().eq('id', wsA)
    if (wsB) await svc().from('workspaces').delete().eq('id', wsB)
  })

  it('happy path: writes the connection and the sealed secret atomically', async () => {
    const { data, error } = await upsert(owner)
    expect(error).toBeNull()
    expect(data!.connection_id).toMatch(/^[0-9a-f-]{36}$/)

    const conn = await svc()
      .from('connections')
      .select('workspace_id, platform, status, external_account, scopes, created_by')
      .eq('id', data!.connection_id)
      .single()
    expect(conn.error).toBeNull()
    expect(conn.data).toMatchObject({
      workspace_id: wsA,
      platform: 'x',
      status: 'active',
      scopes: ['tweet.read', 'tweet.write'],
      created_by: owner,
    })
    expect((conn.data!.external_account as { id: string }).id).toBe(ACCOUNT_ID)

    // the secret landed verbatim, in the column its name claims
    const sec = await svc()
      .from('connection_secrets')
      .select('access_token_enc, refresh_token_enc, token_type')
      .eq('connection_id', data!.connection_id)
      .single()
    expect(sec.error).toBeNull()
    expect(sec.data).toEqual({
      access_token_enc: envelope('access-1'),
      refresh_token_enc: envelope('refresh-1'),
      token_type: 'bearer',
    })
  })

  it('returns metadata only — the result carries no token material', async () => {
    const { data } = await upsert(owner)
    // an exact-keys assertion, not a spot check: any future field added to the
    // return value has to be reviewed here before it can leak
    expect(Object.keys(data as object)).toEqual(['connection_id'])
    expect(JSON.stringify(data)).not.toContain('data-access-1')
  })

  it('re-connect refreshes in place — same id, no second row, status back to active', async () => {
    const first = await upsert(owner)
    expect(first.error).toBeNull()

    // a stale connection is exactly the state a re-auth exists to repair
    await svc()
      .from('connections')
      .update({ status: 'revoked' })
      .eq('id', first.data!.connection_id)

    const second = await upsert(editor, {
      p_scopes: ['tweet.read'],
      p_access_token_enc: envelope('access-2'),
      p_refresh_token_enc: envelope('refresh-2'),
    })
    expect(second.error).toBeNull()
    expect(second.data!.connection_id).toBe(first.data!.connection_id)

    const rows = await svc()
      .from('connections')
      .select('id, status, scopes, created_by')
      .eq('workspace_id', wsA)
      .eq('platform', 'x')
    expect(rows.data).toHaveLength(1) // refreshed, not duplicated
    expect(rows.data![0]).toMatchObject({
      status: 'active',
      scopes: ['tweet.read'],
      created_by: owner, // first connector preserved, not the re-auther
    })

    const sec = await svc()
      .from('connection_secrets')
      .select('access_token_enc')
      .eq('connection_id', first.data!.connection_id)
      .single()
    expect(sec.data!.access_token_enc).toEqual(envelope('access-2'))
  })

  it('a null refresh token overwrites rather than merging a previous grant’s', async () => {
    const first = await upsert(owner)
    const again = await upsert(owner, {
      p_access_token_enc: envelope('access-3'),
      p_refresh_token_enc: null,
    })
    expect(again.error).toBeNull()
    const sec = await svc()
      .from('connection_secrets')
      .select('refresh_token_enc')
      .eq('connection_id', first.data!.connection_id)
      .single()
    // coalescing here would pair a fresh access token with a stale refresh token
    expect(sec.data!.refresh_token_enc).toBeNull()
  })

  it('cross-tenant: a member of another workspace cannot write into this one', async () => {
    const before = await svc().from('connections').select('id').eq('workspace_id', wsA)

    const { data, error } = await upsert(stranger)
    expect(data).toBeNull()
    expect(error!.message).toContain('NOT_A_MEMBER')

    // exact before/after, not a bound: a "<= 1" assertion would stay green even if
    // the call had overwritten the existing row instead of adding one
    const after = await svc()
      .from('connections')
      .select('id, external_account')
      .eq('workspace_id', wsA)
    expect(after.data?.map((r) => r.id)).toEqual(before.data?.map((r) => r.id))

    const own = await svc().from('connections').select('id').eq('workspace_id', wsB)
    expect(own.data ?? []).toHaveLength(0) // nor did it land in the caller's own tenant
  })

  it('a non-existent workspace is indistinguishable from one you are not in', async () => {
    // an existence oracle would let any signed-in user enumerate workspace ids
    const { error } = await upsert(owner, {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error!.message).toContain('NOT_A_MEMBER')
  })

  it('a viewer is refused by the role allowlist', async () => {
    const { error } = await upsert(viewer)
    expect(error!.message).toContain('FORBIDDEN_ROLE')
  })

  it('signed-out anon is denied at the permission layer, not inside the function', async () => {
    const { error } = await anonClient().rpc('upsert_connection', {
      p_workspace_id: wsA,
      p_platform: 'x',
      p_external_account: { id: `anon-${run}` },
      p_scopes: ['tweet.read'],
      p_expires_at: null,
      p_access_token_enc: envelope('anon'),
    })
    // 42501 = EXECUTE denied. If this ever surfaces AUTH_REQUIRED instead, the grant
    // boundary is gone and only the in-function JWT check is left standing.
    expect(error).toBeTruthy()
    expect(error!.code).toBe('42501')
    expect(error!.message).not.toContain('AUTH_REQUIRED')
  })

  it('the sealed secret is unreadable by the member who created it', async () => {
    const { data } = await upsert(owner)
    const me = userClient(owner)

    // the member CAN see the connection itself — that row carries no token material
    const conn = await me.from('connections').select('id, status').eq('id', data!.connection_id)
    expect(conn.error).toBeNull()
    expect(conn.data).toHaveLength(1)

    // …but the vault is closed to them: RLS is on with zero policies
    const direct = await me.from('connection_secrets').select('*').limit(1)
    expect((direct.data ?? []).length === 0 || Boolean(direct.error)).toBe(true)

    const targeted = await me
      .from('connection_secrets')
      .select('access_token_enc')
      .eq('connection_id', data!.connection_id)
    expect((targeted.data ?? []).length === 0 || Boolean(targeted.error)).toBe(true)

    // and it cannot be reached by embedding it through a row they CAN read
    const embedded = await me
      .from('connections')
      .select('id, connection_secrets(access_token_enc)')
      .eq('id', data!.connection_id)
    expect(JSON.stringify(embedded.data ?? [])).not.toContain('data-access')
  })

  it('rejects a bad platform, a missing account id, and a non-object secret', async () => {
    const badPlatform = await upsert(owner, { p_platform: 'instagram' })
    expect(badPlatform.error!.message).toContain('INVALID_PLATFORM')

    const noId = await upsert(owner, { p_external_account: { handle: 'no-id' } })
    expect(noId.error!.message).toContain('INVALID_ACCOUNT')

    const blankId = await upsert(owner, { p_external_account: { id: '   ' } })
    expect(blankId.error!.message).toContain('INVALID_ACCOUNT')

    // an explicit JSON null reaches the function as jsonb 'null', which a bare
    // NOT NULL column check would have stored as a useless non-secret
    const nullSecret = await upsert(owner, { p_access_token_enc: null })
    expect(nullSecret.error!.message).toContain('INVALID_SECRET')

    const scalarSecret = await upsert(owner, { p_access_token_enc: 'not-an-envelope' })
    expect(scalarSecret.error!.message).toContain('INVALID_SECRET')
  })
})
