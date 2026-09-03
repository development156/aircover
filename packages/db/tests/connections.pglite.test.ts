import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe } from './helpers/pglite-tenant'

/**
 * `public.upsert_connection` and `public.upsert_zernio_connection`, EXECUTED.
 *
 * ── WHY THIS FILE EXISTS BESIDE connections.test.ts ─────────────────────────
 * The live file carries the same ten claims under `describe.skipIf(!hasRlsEnv)`,
 * and there is no configuration in which they run: with the flag off the suite
 * skips, with it on `assertTargetIsNotProduction` refuses the only project the
 * account has. docs/33 records it as "0 of 10 HOLLOW (live-only)". Until this
 * file, nothing executing anywhere called `upsert_connection(` — and the RPC is
 * SECURITY DEFINER, granted to `authenticated`, and its membership + role check
 * is the ONLY thing between a signed-in stranger and another tenant's row.
 *
 * The live file stays as the production-shape check (PostgREST, minted JWTs,
 * error codes as the client sees them) for the day it can run. This file makes
 * the same claims against the real migration files, on every gate run, with no
 * credentials. Where the live file's VALUE had gone stale the claim is kept and
 * the value retargeted; each one says so where it happens.
 *
 * ── AND THE FUNCTION THE PRODUCT ACTUALLY CALLS ──────────────────────────────
 * No app code calls `upsert_connection`; the OAuth return routes call
 * `upsert_zernio_connection`, whose only tests mock `rpc`. The second describe
 * below is the first executing test of its own boundary: AUTH_REQUIRED, the
 * NOT_A_MEMBER / FORBIDDEN_ROLE gate, the channel allowlist, the 24-hex shapes,
 * and PROFILE_MISMATCH — the one that stops a member attaching an account that
 * lives under another workspace's Zernio profile.
 *
 * Mutation that proves both: in 20260826120001, change either function's
 * `if v_role not in ('owner', 'editor')` to `('nobody')` and the viewer test goes
 * red; delete the `if not found then raise ... NOT_A_MEMBER` branch and the
 * cross-tenant test goes red with B's row written into A.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER = 'user_conn_owner'
const EDITOR = 'user_conn_editor'
const VIEWER = 'user_conn_viewer'
const STRANGER = 'user_conn_stranger' // owner of B
const ACCOUNT_ID = 'acct-1'

// The function treats these as opaque, so a structurally-valid stand-in envelope is
// the honest fixture: a real seal would test @sahoda/publishing's crypto, not this
// function's contract. Shape mirrors EncryptedToken {iv,tag,data,key_version}.
const envelope = (marker: string) => ({
  iv: `iv-${marker}`,
  tag: `tag-${marker}`,
  data: `data-${marker}`,
  key_version: 1,
})

type PgError = { message: string; code?: string }
type Outcome<T> = { data: T | null; error: PgError | null }

/** A member session whose writes survive; `asMember` rolls back by design. */
async function asMemberCommitting<T>(
  db: PGlite,
  userId: string,
  fn: (tx: PGlite) => Promise<T>,
): Promise<T> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    const out = await fn(db)
    await db.exec('commit')
    return out
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

function asOutcome(error: unknown): Outcome<never> {
  const e = error as { message?: string; code?: string }
  return {
    data: null,
    error: { message: String(e.message ?? error).split('\n')[0]!, code: e.code },
  }
}

describe('public.upsert_connection', () => {
  let db: PGlite

  type Args = {
    p_workspace_id: string
    p_platform: string
    p_external_account: unknown
    p_scopes: string[] | null
    p_expires_at: string | null
    p_access_token_enc: unknown
    p_refresh_token_enc: unknown
    p_token_type: string | null
  }

  async function upsert(
    sub: string,
    over: Partial<Args> = {},
  ): Promise<Outcome<{ connection_id: string }>> {
    const a: Args = {
      p_workspace_id: WS_A,
      p_platform: 'x',
      p_external_account: { id: ACCOUNT_ID, handle: 'acme' },
      p_scopes: ['tweet.read', 'tweet.write'],
      p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_access_token_enc: envelope('access-1'),
      p_refresh_token_enc: envelope('refresh-1'),
      p_token_type: 'bearer',
      ...over,
    }
    const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v))
    try {
      const r = await asMemberCommitting(db, sub, (tx) =>
        tx.query<{ r: { connection_id: string } }>(
          `select public.upsert_connection(
             $1::uuid, $2, $3::jsonb, $4::text[], $5::timestamptz, $6::jsonb, $7::jsonb, $8
           ) as r`,
          [
            a.p_workspace_id,
            a.p_platform,
            json(a.p_external_account),
            a.p_scopes,
            a.p_expires_at,
            json(a.p_access_token_enc),
            json(a.p_refresh_token_enc),
            a.p_token_type,
          ],
        ),
      )
      return { data: r.rows[0]!.r, error: null }
    } catch (error) {
      return asOutcome(error)
    }
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'Conn A', 'conn-a', '${OWNER}'),
        ('${WS_B}', 'Conn B', 'conn-b', '${STRANGER}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER}',    'owner'),
        ('${WS_A}', '${VIEWER}',   'viewer'),
        ('${WS_A}', '${EDITOR}',   'editor'),
        ('${WS_B}', '${STRANGER}', 'owner');
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('happy path: writes the connection and the sealed secret atomically', async () => {
    const { data, error } = await upsert(OWNER)
    expect(error).toBeNull()
    expect(data!.connection_id).toMatch(/^[0-9a-f-]{36}$/)

    const conn = (
      await db.query<Record<string, unknown>>(
        `select workspace_id, platform, status, external_account, scopes, created_by
           from connections where id = $1`,
        [data!.connection_id],
      )
    ).rows[0]!
    expect(conn).toMatchObject({
      workspace_id: WS_A,
      platform: 'x',
      status: 'active',
      scopes: ['tweet.read', 'tweet.write'],
      created_by: OWNER,
    })
    expect((conn.external_account as { id: string }).id).toBe(ACCOUNT_ID)

    // the secret landed verbatim, in the column its name claims
    const sec = (
      await db.query<Record<string, unknown>>(
        `select access_token_enc, refresh_token_enc, token_type
           from connection_secrets where connection_id = $1`,
        [data!.connection_id],
      )
    ).rows[0]!
    expect(sec).toEqual({
      access_token_enc: envelope('access-1'),
      refresh_token_enc: envelope('refresh-1'),
      token_type: 'bearer',
    })
  })

  it('returns metadata only — the result carries no token material', async () => {
    const { data } = await upsert(OWNER)
    // an exact-keys assertion, not a spot check: any future field added to the
    // return value has to be reviewed here before it can leak
    expect(Object.keys(data as object)).toEqual(['connection_id'])
    expect(JSON.stringify(data)).not.toContain('data-access-1')
  })

  it('re-connect refreshes in place — same id, no second row, status back to active', async () => {
    const first = await upsert(OWNER)
    expect(first.error).toBeNull()

    // a stale connection is exactly the state a re-auth exists to repair
    await db.query(`update connections set status = 'revoked' where id = $1`, [
      first.data!.connection_id,
    ])

    const second = await upsert(EDITOR, {
      p_scopes: ['tweet.read'],
      p_access_token_enc: envelope('access-2'),
      p_refresh_token_enc: envelope('refresh-2'),
    })
    expect(second.error).toBeNull()
    expect(second.data!.connection_id).toBe(first.data!.connection_id)

    const rows = (
      await db.query<Record<string, unknown>>(
        `select id, status, scopes, created_by from connections
          where workspace_id = $1 and platform = 'x'`,
        [WS_A],
      )
    ).rows
    expect(rows).toHaveLength(1) // refreshed, not duplicated
    expect(rows[0]).toMatchObject({
      status: 'active',
      scopes: ['tweet.read'],
      created_by: OWNER, // first connector preserved, not the re-auther
    })

    const sec = (
      await db.query<{ access_token_enc: unknown }>(
        `select access_token_enc from connection_secrets where connection_id = $1`,
        [first.data!.connection_id],
      )
    ).rows[0]!
    expect(sec.access_token_enc).toEqual(envelope('access-2'))
  })

  it('a null refresh token overwrites rather than merging a previous grant’s', async () => {
    const first = await upsert(OWNER)
    const again = await upsert(OWNER, {
      p_access_token_enc: envelope('access-3'),
      p_refresh_token_enc: null,
    })
    expect(again.error).toBeNull()
    const sec = (
      await db.query<{ refresh_token_enc: unknown }>(
        `select refresh_token_enc from connection_secrets where connection_id = $1`,
        [first.data!.connection_id],
      )
    ).rows[0]!
    // coalescing here would pair a fresh access token with a stale refresh token
    expect(sec.refresh_token_enc).toBeNull()
  })

  it('cross-tenant: a member of another workspace cannot write into this one', async () => {
    const ids = async (ws: string) =>
      (await db.query<{ id: string }>(`select id from connections where workspace_id = $1`, [ws]))
        .rows

    const before = await ids(WS_A)
    const { data, error } = await upsert(STRANGER)
    expect(data).toBeNull()
    expect(error!.message).toContain('NOT_A_MEMBER')

    // exact before/after, not a bound: a "<= 1" assertion would stay green even if
    // the call had overwritten the existing row instead of adding one
    expect((await ids(WS_A)).map((r) => r.id)).toEqual(before.map((r) => r.id))
    expect(await ids(WS_B)).toHaveLength(0) // nor did it land in the caller's own tenant
  })

  it('a non-existent workspace is indistinguishable from one you are not in', async () => {
    // an existence oracle would let any signed-in user enumerate workspace ids
    const { error } = await upsert(OWNER, {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error!.message).toContain('NOT_A_MEMBER')
  })

  it('a viewer is refused by the role allowlist', async () => {
    const { error } = await upsert(VIEWER)
    expect(error!.message).toContain('FORBIDDEN_ROLE')
  })

  it('signed-out anon is denied at the permission layer, not inside the function', async () => {
    let error: PgError | null = null
    try {
      await asRole(db, 'anon', {}, (tx) =>
        tx.query(
          `select public.upsert_connection($1::uuid, 'x', $2::jsonb, $3::text[], null, $4::jsonb)`,
          [
            WS_A,
            JSON.stringify({ id: 'anon-1' }),
            ['tweet.read'],
            JSON.stringify(envelope('anon')),
          ],
        ),
      )
    } catch (e) {
      error = asOutcome(e).error
    }
    // 42501 = EXECUTE denied. If this ever surfaces AUTH_REQUIRED instead, the grant
    // boundary is gone and only the in-function JWT check is left standing.
    expect(error).toBeTruthy()
    expect(error!.code).toBe('42501')
    expect(error!.message).not.toContain('AUTH_REQUIRED')
  })

  it('the sealed secret is unreadable by the member who created it', async () => {
    const { data } = await upsert(OWNER)
    const id = data!.connection_id

    // the member CAN see the connection itself — that row carries no token material
    const conn = await asMember(db, OWNER, (tx) =>
      probe<{ id: string }>(tx, `select id, status from connections where id = $1`, [id]),
    )
    expect('rows' in conn ? conn.rows : conn.denied).toHaveLength(1)

    // …but the vault is closed to them: RLS is on with zero policies
    const direct = await asMember(db, OWNER, (tx) =>
      probe(tx, `select * from connection_secrets limit 1`),
    )
    expect('denied' in direct || direct.rows.length === 0).toBe(true)

    const targeted = await asMember(db, OWNER, (tx) =>
      probe(tx, `select access_token_enc from connection_secrets where connection_id = $1`, [id]),
    )
    expect('denied' in targeted || targeted.rows.length === 0).toBe(true)

    // and it cannot be reached by joining it through a row they CAN read (the
    // SQL PostgREST would run for `connections(id, connection_secrets(...))`)
    const embedded = await asMember(db, OWNER, (tx) =>
      probe(
        tx,
        `select c.id, s.access_token_enc
           from connections c left join connection_secrets s on s.connection_id = c.id
          where c.id = $1`,
        [id],
      ),
    )
    expect(JSON.stringify('rows' in embedded ? embedded.rows : [])).not.toContain('data-access')
  })

  it('rejects a bad platform, a missing account id, and a non-object secret', async () => {
    // The live file sends 'facebook' here and has been wrong since 2026-08-26,
    // when 20260826120001 admitted facebook and telegram to app.is_channel. The
    // CLAIM is "a platform outside the vocabulary is refused", so the value is
    // one that is outside it today and will stay so.
    //
    // Read the rejection out of the RPC rather than dereferencing null: an
    // absent error made this fail as `Cannot read properties of null` — an
    // accidental TypeError wearing a guard's clothes, which says nothing about
    // WHAT the database did.
    const badPlatform = await upsert(OWNER, { p_platform: 'myspace' })
    expect(badPlatform.error?.message ?? 'NO ERROR — the RPC ACCEPTED it').toContain(
      'INVALID_PLATFORM',
    )

    const noId = await upsert(OWNER, { p_external_account: { handle: 'no-id' } })
    expect(noId.error!.message).toContain('INVALID_ACCOUNT')

    const blankId = await upsert(OWNER, { p_external_account: { id: '   ' } })
    expect(blankId.error!.message).toContain('INVALID_ACCOUNT')

    // an explicit JSON null reaches the function as jsonb 'null', which a bare
    // NOT NULL column check would have stored as a useless non-secret
    const nullSecret = await upsert(OWNER, { p_access_token_enc: null })
    expect(nullSecret.error!.message).toContain('INVALID_SECRET')

    const scalarSecret = await upsert(OWNER, { p_access_token_enc: 'not-an-envelope' })
    expect(scalarSecret.error!.message).toContain('INVALID_SECRET')
  })
})

describe('public.upsert_zernio_connection — the RPC the OAuth return route calls', () => {
  let db: PGlite
  const PROFILE_A = 'a'.repeat(24)
  const PROFILE_B = 'b'.repeat(24)
  const ACCOUNT_A = '0000000000000000000000a1'

  async function connect(
    sub: string,
    over: { ws?: string; platform?: string; account?: unknown; profile?: string | null } = {},
  ): Promise<Outcome<{ connection_id: string }>> {
    const account = over.account === undefined ? { id: ACCOUNT_A, handle: 'acme' } : over.account
    try {
      const r = await asMemberCommitting(db, sub, (tx) =>
        tx.query<{ r: { connection_id: string } }>(
          `select public.upsert_zernio_connection($1::uuid, $2, $3::jsonb, $4) as r`,
          [
            over.ws ?? WS_A,
            over.platform ?? 'instagram',
            account === null ? null : JSON.stringify(account),
            over.profile === undefined ? PROFILE_A : over.profile,
          ],
        ),
      )
      return { data: r.rows[0]!.r, error: null }
    } catch (error) {
      return asOutcome(error)
    }
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'Z A', 'z-a', '${OWNER}'),
        ('${WS_B}', 'Z B', 'z-b', '${STRANGER}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER}',    'owner'),
        ('${WS_A}', '${VIEWER}',   'viewer'),
        ('${WS_A}', '${EDITOR}',   'editor'),
        ('${WS_B}', '${STRANGER}', 'owner');
      insert into zernio_profiles (workspace_id, profile_id) values
        ('${WS_A}', '${PROFILE_A}'),
        ('${WS_B}', '${PROFILE_B}');
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('an owner connects: the row is stamped with the JWT subject and the MAPPED profile', async () => {
    const { data, error } = await connect(OWNER)
    expect(error).toBeNull()
    const row = (
      await db.query<Record<string, unknown>>(
        `select workspace_id, platform, status, created_by, external_account
           from connections where id = $1`,
        [data!.connection_id],
      )
    ).rows[0]!
    expect(row).toMatchObject({
      workspace_id: WS_A,
      platform: 'instagram',
      status: 'active',
      created_by: OWNER,
    })
    expect(row.external_account).toMatchObject({
      id: ACCOUNT_A,
      profileId: PROFILE_A,
      handle: 'acme',
    })
    // and writes NOTHING to the vault — this path holds no token
    const secrets = (
      await db.query<{ n: number }>(`select count(*)::int as n from connection_secrets`)
    ).rows[0]!.n
    expect(secrets).toBe(0)
  })

  it('an editor re-connecting refreshes the same row', async () => {
    const first = await connect(OWNER)
    const again = await connect(EDITOR, { account: { id: ACCOUNT_A, handle: 'acme-2' } })
    expect(again.error).toBeNull()
    expect(again.data!.connection_id).toBe(first.data!.connection_id)
  })

  it('a token with no subject is AUTH_REQUIRED, not NOT_A_MEMBER', async () => {
    const { error } = await connect('')
    expect(error!.message).toContain('AUTH_REQUIRED')
  })

  it('cross-tenant: B’s owner cannot attach an account to A, and A’s rows are untouched', async () => {
    const before = (
      await db.query<{ id: string }>(
        `select id from connections where workspace_id = $1 order by id`,
        [WS_A],
      )
    ).rows
    const { error } = await connect(STRANGER, { account: { id: '0000000000000000000000b1' } })
    expect(error!.message).toContain('NOT_A_MEMBER')
    const after = (
      await db.query<{ id: string }>(
        `select id from connections where workspace_id = $1 order by id`,
        [WS_A],
      )
    ).rows
    expect(after).toEqual(before)
  })

  it('a viewer is refused by the role allowlist', async () => {
    const { error } = await connect(VIEWER)
    expect(error!.message).toContain('FORBIDDEN_ROLE')
  })

  it('PROFILE_MISMATCH: a member cannot attach an account under another workspace’s profile', async () => {
    // The tenant boundary: p_profile_id is only ever COMPARED to the mapping.
    const { error } = await connect(OWNER, { profile: PROFILE_B })
    expect(error!.message).toContain('PROFILE_MISMATCH')
  })

  it('refuses a channel outside app.is_channel, and malformed 24-hex shapes', async () => {
    expect((await connect(OWNER, { platform: 'myspace' })).error!.message).toContain(
      'INVALID_PLATFORM',
    )
    expect((await connect(OWNER, { account: { id: 'not-hex' } })).error!.message).toContain(
      'INVALID_ACCOUNT',
    )
    expect((await connect(OWNER, { account: 'scalar' })).error!.message).toContain(
      'INVALID_ACCOUNT',
    )
    expect((await connect(OWNER, { profile: 'short' })).error!.message).toContain('INVALID_PROFILE')
    expect((await connect(OWNER, { profile: null })).error!.message).toContain('INVALID_PROFILE')
  })

  it('signed-out anon is denied at the permission layer', async () => {
    let error: PgError | null = null
    try {
      await asRole(db, 'anon', {}, (tx) =>
        tx.query(`select public.upsert_zernio_connection($1::uuid, 'instagram', $2::jsonb, $3)`, [
          WS_A,
          JSON.stringify({ id: ACCOUNT_A }),
          PROFILE_A,
        ]),
      )
    } catch (e) {
      error = asOutcome(e).error
    }
    expect(error!.code).toBe('42501')
    expect(error!.message).not.toContain('AUTH_REQUIRED')
  })
})
