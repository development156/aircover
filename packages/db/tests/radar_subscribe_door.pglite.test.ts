import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe } from './helpers/pglite-tenant'

/**
 * THE DOOR INTO THE COMPETITOR REGISTRY — `public.radar_subscribe`.
 *
 * `radar_rls.pglite.test.ts` proves what a member may READ. This proves who may
 * WRITE, which until now was nobody: `app.radar_subscribe` is granted to
 * `service_role` alone and `app` is not an exposed schema, so a signed-in customer
 * could not add a competitor and all five tables were empty.
 *
 * ── THE REASON A WRAPPER EXISTS RATHER THAN A GRANT ─────────────────────────
 * `app.radar_subscribe(p_workspace_id, …, p_created_by, …)` checks no membership
 * and trusts both of those arguments completely, because until now its only caller
 * was the service role. Granting it to `authenticated` would have made it a
 * cross-tenant WRITE — any signed-in user subscribing on behalf of any workspace,
 * stamping any user id on the row.
 *
 * The tests below are written so that the cross-tenant write is attempted
 * explicitly, rather than being assumed impossible.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER_A = 'user_owner_a'
const EDITOR_A = 'user_editor_a'
const VIEWER_A = 'user_viewer_a'
const OWNER_B = 'user_owner_b'
const STRANGER = 'user_stranger'

/**
 * A member session whose writes SURVIVE.
 *
 * The shared `asMember` always rolls back, and it is right to: it exists for read
 * assertions, where a leaked role change or a stray row would corrupt the next
 * test in a suite that seeds once. This file is about WRITING through the door, so
 * the rows have to still be there afterwards — the first version of this file used
 * `asMember` and every subscription vanished on the way out, which showed up as
 * "the function succeeded and wrote nothing".
 *
 * `set local role` is reverted by COMMIT exactly as it is by ROLLBACK, so the
 * superuser comes back either way and later assertions can read the truth.
 */
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

/** Call the door as a member. Returns the result, or the error's message. */
async function subscribeAs(
  db: PGlite,
  userId: string,
  workspaceId: string,
  name: string,
  kind: string,
  locator: string,
): Promise<{ ok: true; competitorId: string } | { ok: false; error: string }> {
  try {
    const out = await asMemberCommitting(db, userId, async (tx) => {
      const r = await tx.query<{ result: { competitor_id: string } }>(
        `select public.radar_subscribe($1::uuid, $2, $3::jsonb, null) as result`,
        [workspaceId, name, JSON.stringify([{ kind, locator }])],
      )
      return r.rows[0]!.result
    })
    return { ok: true, competitorId: out.competitor_id }
  } catch (error) {
    return { ok: false, error: String((error as Error).message) }
  }
}

describe('public.radar_subscribe — who may add a competitor', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'door-a', '${OWNER_A}'),
        ('${WS_B}', 'B', 'door-b', '${OWNER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',  'owner'),
        ('${WS_A}', '${EDITOR_A}', 'editor'),
        ('${WS_A}', '${VIEWER_A}', 'viewer'),
        ('${WS_B}', '${OWNER_B}',  'owner');
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  // ── THE PATH IS OPEN ──────────────────────────────────────────────────────

  it('lets an OWNER subscribe a competitor, under RLS, as themselves', async () => {
    const r = await subscribeAs(db, OWNER_A, WS_A, 'Rival One', 'website', 'rival-one.example')
    expect(r.ok).toBe(true)

    // The row exists, is A's, and is stamped with the JWT's subject — which was
    // never an argument to the function.
    const row = (
      await db.query<{ workspace_id: string; created_by: string }>(
        `select workspace_id, created_by from competitor_subscriptions
          where workspace_id = $1`,
        [WS_A],
      )
    ).rows[0]!
    expect(row.workspace_id).toBe(WS_A)
    expect(row.created_by).toBe(OWNER_A)
  })

  it('lets an EDITOR subscribe too', async () => {
    const r = await subscribeAs(db, EDITOR_A, WS_A, 'Rival Two', 'website', 'rival-two.example')
    expect(r.ok).toBe(true)
  })

  it('attaches to the SAME competitor when two workspaces name the same rival', async () => {
    // The dedupe the whole registry exists for, now reached through the door
    // rather than through the service role.
    const a = await subscribeAs(db, OWNER_A, WS_A, 'Shared', 'instagram', '@sharedrival')
    const b = await subscribeAs(
      db,
      OWNER_B,
      WS_B,
      'Shared',
      'instagram',
      'instagram.com/SharedRival/',
    )
    if (!a.ok || !b.ok) throw new Error(`both should have succeeded: ${JSON.stringify({ a, b })}`)
    // Written two different ways on purpose: the normaliser is what makes one
    // real-world rival cost one row however a hundred customers spell it.
    expect(a.competitorId).toBe(b.competitorId)
  })

  // ── AND IT IS STILL A DOOR, NOT A HOLE ────────────────────────────────────

  it('REFUSES a member of another workspace subscribing on this one’s behalf', async () => {
    // The exact attack granting the inner function would have allowed.
    const r = await subscribeAs(db, OWNER_B, WS_A, 'Injected', 'website', 'injected.example')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('NOT_A_MEMBER')

    const n = (
      await db.query<{ n: number }>(
        `select count(*)::int as n from competitor_subscriptions
          where workspace_id = $1 and created_by = $2`,
        [WS_A, OWNER_B],
      )
    ).rows[0]!.n
    expect(n).toBe(0)
  })

  it('REFUSES a user who belongs to no workspace at all', async () => {
    const r = await subscribeAs(db, STRANGER, WS_A, 'Nope', 'website', 'nope.example')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('NOT_A_MEMBER')
  })

  it('REFUSES a viewer — subscribing spends money every night', async () => {
    const r = await subscribeAs(db, VIEWER_A, WS_A, 'Nope', 'website', 'viewer.example')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('FORBIDDEN_ROLE')
  })

  it('REFUSES an anonymous caller with no JWT at all', async () => {
    let message = ''
    try {
      await asRole(db, 'anon', {}, async (tx) => {
        await tx.query(
          `select public.radar_subscribe($1::uuid, 'X', '[{"kind":"website","locator":"a.example"}]'::jsonb, null)`,
          [WS_A],
        )
      })
    } catch (error) {
      message = String((error as Error).message)
    }
    // Either the grant refuses execution, or the first guard does. Both are
    // correct; asserting the SENTENCE keeps them distinguishable.
    expect(message).toMatch(/AUTH_REQUIRED|permission denied/)
  })

  it('still refuses a member writing the registry tables DIRECTLY', async () => {
    // The wrapper must not have loosened anything. There is deliberately no
    // INSERT policy on competitor_subscriptions: the difference between "created"
    // and "duplicate key" would itself answer "is this rival already watched?".
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `insert into competitors (display_name) values ('Probe')`),
    )
    expect('denied' in got).toBe(true)
  })

  // ── AND THE DISCLOSURE RULES STILL HOLD AFTER WRITING THROUGH IT ──────────

  it('A still counts ONE subscriber of the shared competitor, when the truth is two', async () => {
    const shared = (
      await db.query<{ competitor_id: string; n: number }>(
        `select competitor_id, count(*)::int as n from competitor_subscriptions
          group by competitor_id having count(*) > 1`,
      )
    ).rows[0]!
    expect(shared.n).toBe(2) // the truth, read as superuser

    const got = await asMember(db, OWNER_A, (tx) =>
      probe<{ n: number }>(
        tx,
        `select count(*)::int as n from competitor_subscriptions where competitor_id = $1`,
        [shared.competitor_id],
      ),
    )
    const n = 'rows' in got ? got.rows[0]!.n : -1
    expect(n).toBe(1)
  })

  it('B cannot see the competitor A subscribes to alone', async () => {
    const mine = (
      await db.query<{ id: string }>(
        `select c.id from competitors c
           join competitor_subscriptions s on s.competitor_id = c.id
          where s.workspace_id = $1 and c.display_name = 'Rival One'`,
        [WS_A],
      )
    ).rows[0]!

    const got = await asMember(db, OWNER_B, (tx) =>
      probe<{ id: string }>(tx, `select id from competitors where id = $1`, [mine.id]),
    )
    const rows = 'rows' in got ? got.rows : []
    expect(rows).toHaveLength(0)
  })
})
