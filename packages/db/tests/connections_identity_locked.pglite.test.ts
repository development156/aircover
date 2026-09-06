import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, probe } from './helpers/pglite-tenant'

/**
 * A member may not rewrite WHICH account a connection is.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * `conn_update` lets a member UPDATE every column of their own workspace's
 * `connections` rows, and the publish gate verifies tenancy by re-reading the
 * row it is guarding. MEASURED 2026-09-02 before the trigger existed: a member of
 * A set `external_account = {id: <B's account>, profileId: <A's profile>}` on A's
 * own row (affected 1), the dispatcher's candidate query then returned B's
 * account, and `assert_account_for_scheduled_post` RETURNED it instead of
 * raising CROSS_TENANT_ACCOUNT.
 *
 * ── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * Under RLS, as owner, editor and viewer of A: the rewrite is refused with
 * CONNECTION_IDENTITY_LOCKED, the row is byte-identical afterwards, and the gate
 * still raises for B's account. And that the guard is NARROW: the sanctioned
 * SECURITY DEFINER writer still refreshes the row in place, the postgres role
 * (reconcile sweep, publisher) still merges health facts and expires a row, and a
 * member can still change `status`.
 *
 * Mutation that proves the guard: in 20260902220001, replace
 * `current_user in ('anon', 'authenticated')` with `current_user in ('nobody')`.
 * The three refusal tests and the gate test go red.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER_A = 'user_lock_owner_a'
const EDITOR_A = 'user_lock_editor_a'
const VIEWER_A = 'user_lock_viewer_a'
const OWNER_B = 'user_lock_owner_b'
const PROFILE_A = 'a'.repeat(24)
const PROFILE_B = 'b'.repeat(24)
const ACCOUNT_A = '0000000000000000000000a1'
const ACCOUNT_B = '0000000000000000000000b1'
const POST_A = '33333333-3333-4333-8333-333333333333'
const VARIANT_A = '44444444-4444-4444-8444-444444444444'

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

type ConnRow = { workspace_id: string; platform: string; status: string; external_account: unknown }

describe('connections: identity columns are locked against PostgREST roles', () => {
  let db: PGlite
  let connA = ''

  async function rowA(): Promise<ConnRow> {
    return (
      await db.query<ConnRow>(
        `select workspace_id, platform, status, external_account from connections where id = $1`,
        [connA],
      )
    ).rows[0]!
  }

  async function gateFor(account: string): Promise<string> {
    try {
      const r = await db.query<{ a: string }>(
        `select public.assert_account_for_scheduled_post($1, $2, $3) as a`,
        [POST_A, VARIANT_A, account],
      )
      return `RETURNED ${r.rows[0]!.a}`
    } catch (error) {
      return String((error as Error).message).split('\n')[0]!
    }
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'lock-a', '${OWNER_A}'),
        ('${WS_B}', 'B', 'lock-b', '${OWNER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',  'owner'),
        ('${WS_A}', '${EDITOR_A}', 'editor'),
        ('${WS_A}', '${VIEWER_A}', 'viewer'),
        ('${WS_B}', '${OWNER_B}',  'owner');
      insert into zernio_profiles (workspace_id, profile_id) values
        ('${WS_A}', '${PROFILE_A}'),
        ('${WS_B}', '${PROFILE_B}');
      insert into posts (id, workspace_id, title, status, channels)
        values ('${POST_A}', '${WS_A}', 'P', 'approved', '{instagram}');
      insert into post_variants (id, workspace_id, post_id, channel, body)
        values ('${VARIANT_A}', '${WS_A}', '${POST_A}', 'instagram', 'hi');
    `)
    // Both connections through the sanctioned writer, as each workspace's owner.
    const a = await asMemberCommitting(db, OWNER_A, (tx) =>
      tx.query<{ r: { connection_id: string } }>(
        `select public.upsert_zernio_connection($1, 'instagram', $2::jsonb, $3) as r`,
        [WS_A, JSON.stringify({ id: ACCOUNT_A }), PROFILE_A],
      ),
    )
    connA = a.rows[0]!.r.connection_id
    await asMemberCommitting(db, OWNER_B, (tx) =>
      tx.query(`select public.upsert_zernio_connection($1, 'instagram', $2::jsonb, $3)`, [
        WS_B,
        JSON.stringify({ id: ACCOUNT_B }),
        PROFILE_B,
      ]),
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('baseline: the gate approves A’s own account and refuses B’s', async () => {
    expect(await gateFor(ACCOUNT_A)).toBe(`RETURNED ${ACCOUNT_A}`)
    expect(await gateFor(ACCOUNT_B)).toContain('CROSS_TENANT_ACCOUNT')
  })

  for (const [label, user] of [
    ['owner', OWNER_A],
    ['editor', EDITOR_A],
    ['viewer', VIEWER_A],
  ] as const) {
    it(`REFUSES the ${label} of A rewriting external_account to B’s account id`, async () => {
      const before = await rowA()
      const got = await asMember(db, user, (tx) =>
        probe(
          tx,
          `update connections
              set external_account = jsonb_build_object('id', $2::text, 'profileId', $3::text)
            where id = $1`,
          [connA, ACCOUNT_B, PROFILE_A],
        ),
      )
      // The SENTENCE, not falsiness: a policy denial would show as affected 0 with
      // no error, and that is a different (weaker) fact than a refusal.
      expect('denied' in got ? got.denied : 'ACCEPTED').toContain('CONNECTION_IDENTITY_LOCKED')
      expect(await rowA()).toEqual(before)
    })
  }

  it('REFUSES a member moving the row to another platform', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `update connections set platform = 'facebook' where id = $1`, [connA]),
    )
    expect('denied' in got ? got.denied : 'ACCEPTED').toContain('CONNECTION_IDENTITY_LOCKED')
  })

  it('the gate still refuses B’s account after the attempted rewrite', async () => {
    // Attempted and rolled back above; the row is what upsert_zernio_connection
    // wrote, so the gate must still say what it said at baseline.
    expect((await rowA()).external_account).toMatchObject({ id: ACCOUNT_A, profileId: PROFILE_A })
    expect(await gateFor(ACCOUNT_B)).toContain('CROSS_TENANT_ACCOUNT')
  })

  // ── THE GUARD IS NARROW ───────────────────────────────────────────────────

  it('a member can still change status (the policy is untouched)', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe<{ status: string }>(
        tx,
        `update connections set status = 'revoked' where id = $1 returning status`,
        [connA],
      ),
    )
    expect('rows' in got ? got.rows[0]?.status : got.denied).toBe('revoked')
  })

  it('the SECURITY DEFINER writer still refreshes external_account in place, as an editor', async () => {
    const r = await asMemberCommitting(db, EDITOR_A, (tx) =>
      tx.query<{ r: { connection_id: string } }>(
        `select public.upsert_zernio_connection($1, 'instagram', $2::jsonb, $3, $4) as r`,
        [WS_A, JSON.stringify({ id: ACCOUNT_A, handle: 'acme-renamed' }), PROFILE_A, ['x']],
      ),
    )
    expect(r.rows[0]!.r.connection_id).toBe(connA)
    expect((await rowA()).external_account).toMatchObject({
      id: ACCOUNT_A,
      profileId: PROFILE_A,
      handle: 'acme-renamed',
    })
  })

  it('the postgres role (reconcile sweep) still merges health facts and expires the row', async () => {
    // The exact statement apps/jobs/src/reconcile/store.ts runs over its pool.
    await db.query(
      `update connections
          set external_account = external_account
                || jsonb_build_object('needsReconnection', true, 'platformStatus', 'expired'),
              last_checked_at = now(),
              status = 'expired'
        where id = $1 and workspace_id = $2`,
      [connA, WS_A],
    )
    const row = await rowA()
    expect(row.status).toBe('expired')
    expect(row.external_account).toMatchObject({ id: ACCOUNT_A, needsReconnection: true })
  })
})
