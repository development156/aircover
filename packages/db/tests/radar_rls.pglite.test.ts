import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema, asMember, asRole, probe, currentRole } from './helpers/pglite-tenant'

/**
 * THE HIGHEST-RISK ACCESS-CONTROL DESIGN IN THE PRODUCT, EXECUTED.
 *
 * Radar's competitor registry is SHARED between customers on purpose — one fetch
 * serves every subscriber, which is the only reason the feature is affordable.
 * The price of that sharing is that `competitors`, `competitor_sources`,
 * `competitor_snapshots` and `competitor_changes` carry NO workspace_id, so the
 * one-line house policy cannot protect them and four hand-written rules do.
 *
 * There are TWO separate disclosures to prevent, and proving one leaves the other
 * completely untested:
 *
 *   (a) READING A COMPETITOR YOU DO NOT SUBSCRIBE TO — an ordinary cross-tenant
 *       read, and the one a careless test would check.
 *
 *   (b) SEEING ANOTHER WORKSPACE'S SUBSCRIPTIONS — learning WHO IS WATCHING WHOM.
 *       A bakery finding out that the bakery across the road tracks it is a fact
 *       about our own paying customers disclosed to each other. It is worse than
 *       an ordinary leak and no apology repairs it.
 *
 * ── THE FIXTURE DETAIL THAT DECIDES WHETHER THIS SUITE IS WORTH ANYTHING ─────
 * `shared` is subscribed by BOTH workspaces. If every competitor in the fixture
 * belonged to exactly one tenant, disclosure (b) could never fire — there would
 * be no row about workspace B that workspace A is entitled to come anywhere near,
 * and the suite would pass while testing the easy half of the design. The shared
 * row IS the dedupe, and it is where (a) and (b) pull in opposite directions:
 * A must see the COMPETITOR and must not see B's SUBSCRIPTION to it.
 *
 * A third identity, `userC`, holds a valid token and belongs to no workspace at
 * all. It proves the policies key on MEMBERSHIP rather than merely on "some other
 * tenant", which no A-versus-B check can separate.
 *
 * Ids are PRINTED, not just counted. A count of 1 does not say WHICH row came
 * back, and this suite is about identity.
 */

const WS_A = '11111111-0000-4000-8000-111111111111'
const WS_B = '22222222-0000-4000-8000-222222222222'
const USER_A = 'user_radar_a'
const USER_B = 'user_radar_b'
const USER_C = 'user_radar_none'

type Row = { id: string }
const ids = (r: { rows: Row[] } | { denied: string }): string[] =>
  'rows' in r ? r.rows.map((x) => x.id).sort() : [`DENIED:${r.denied}`]

describe('Radar registry RLS (real Postgres, policies enforced)', () => {
  let db: PGlite
  const seen: Record<string, string> = {}

  beforeAll(async () => {
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'radar-a', '${USER_A}'),
        ('${WS_B}', 'B', 'radar-b', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner');
    `)

    // Built through the real RPC, not by hand: the function is the only sanctioned
    // write path, and a fixture that side-stepped it would prove the policies
    // against rows the product can never actually produce.
    const sub = async (ws: string, name: string, kind: string, locator: string, by: string) => {
      const r = await db.query<{
        radar_subscribe: { competitor_id: string; source_ids: string[] }
      }>(`select app.radar_subscribe($1::uuid, $2, $3::jsonb, $4) as radar_subscribe`, [
        ws,
        name,
        JSON.stringify([{ kind, locator }]),
        by,
      ])
      return r.rows[0]!.radar_subscribe
    }

    const onlyA = await sub(WS_A, 'Rival of A', 'website', 'https://www.only-a.example/', USER_A)
    const onlyB = await sub(WS_B, 'Rival of B', 'website', 'only-b.example', USER_B)
    // THE SHARED ROW. B subscribes second, to the SAME locator written differently —
    // which also proves the normaliser deduped rather than creating a twin.
    const sharedA = await sub(WS_A, 'Shared rival', 'instagram', '@sharedrival', USER_A)
    const sharedB = await sub(
      WS_B,
      'Shared rival',
      'instagram',
      'instagram.com/SharedRival/',
      USER_B,
    )

    expect(sharedB.competitor_id).toBe(sharedA.competitor_id)

    seen.onlyA = onlyA.competitor_id
    seen.onlyB = onlyB.competitor_id
    seen.shared = sharedA.competitor_id
    seen.srcOnlyA = onlyA.source_ids[0]!
    seen.srcOnlyB = onlyB.source_ids[0]!
    seen.srcShared = sharedA.source_ids[0]!

    // Two snapshots and a change on the shared source, and one of each on B's own,
    // so the derived tables have something to leak if they are going to.
    const snap = async (sourceId: string, day: string, hash: string) => {
      const r = await db.query<Row>(
        `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
         values ($1::uuid, '{"followers": 10}'::jsonb, $2, $3::timestamptz) returning id`,
        [sourceId, hash, day],
      )
      return r.rows[0]!.id
    }
    const s1 = await snap(seen.srcShared!, '2026-08-20T04:00:00Z', 'h1')
    const s2 = await snap(seen.srcShared!, '2026-08-21T04:00:00Z', 'h2')
    seen.snapShared = s2
    seen.snapOnlyB = await snap(seen.srcOnlyB!, '2026-08-21T04:00:00Z', 'hb')

    const ch = await db.query<Row>(
      `insert into competitor_changes
         (source_id, from_snapshot_id, to_snapshot_id, change_kind, day_span, summary)
       values ($1::uuid, $2::uuid, $3::uuid, 'audience_moved', 1, 'They gained followers.')
       returning id`,
      [seen.srcShared, s1, s2],
    )
    seen.changeShared = ch.rows[0]!.id
  })

  afterAll(async () => {
    await db?.close()
  })

  it('actually drops the superuser bit — otherwise every result below is meaningless', async () => {
    const role = await asMember(db, USER_A, (tx) => currentRole(tx))
    console.log('  as a member:', role)
    expect(role.user).toBe('authenticated')
    expect(role.superuser).toBe('off')
  })

  // ── DISCLOSURE (a): reading a competitor you do not subscribe to ────────────

  it('A sees its own competitor and the shared one, and NOT B-only', async () => {
    const got = await asMember(db, USER_A, (tx) => probe<Row>(tx, 'select id from competitors'))
    const list = ids(got)
    console.log('  A sees competitors:', list)
    console.log('  onlyA=%s shared=%s onlyB=%s', seen.onlyA, seen.shared, seen.onlyB)
    expect(list).toEqual([seen.onlyA, seen.shared].sort())
    expect(list).not.toContain(seen.onlyB)
  })

  it('A cannot read the SOURCE of a competitor it does not subscribe to', async () => {
    const got = await asMember(db, USER_A, (tx) =>
      probe<Row>(tx, 'select id from competitor_sources'),
    )
    const list = ids(got)
    console.log('  A sees sources:', list)
    expect(list).toEqual([seen.srcOnlyA, seen.srcShared].sort())
    expect(list).not.toContain(seen.srcOnlyB)
  })

  it('A cannot read snapshots or changes belonging to a B-only competitor', async () => {
    const snaps = await asMember(db, USER_A, (tx) =>
      probe<Row>(tx, 'select id from competitor_snapshots'),
    )
    const changes = await asMember(db, USER_A, (tx) =>
      probe<Row>(tx, 'select id from competitor_changes'),
    )
    console.log('  A sees snapshots:', ids(snaps))
    console.log('  A sees changes  :', ids(changes))
    // The two snapshots on the SHARED source are A's to read; B's own is not.
    expect(ids(snaps)).toContain(seen.snapShared)
    expect(ids(snaps)).not.toContain(seen.snapOnlyB)
    expect(ids(changes)).toEqual([seen.changeShared])
  })

  // ── DISCLOSURE (b): who is watching whom ───────────────────────────────────
  //
  // These are the tests the design exists for, and they are NOT implied by any
  // test above. A sees the shared COMPETITOR legitimately; the question here is
  // whether that entitles it to B's SUBSCRIPTION ROW, and it must not.

  it('A sees exactly ONE subscription to the shared competitor — its own', async () => {
    const got = await asMember(db, USER_A, (tx) =>
      probe<{ id: string; workspace_id: string; competitor_id: string }>(
        tx,
        'select id, workspace_id, competitor_id from competitor_subscriptions',
      ),
    )
    const rows = 'rows' in got ? got.rows : []
    console.log('  A sees subscriptions:', rows)
    expect(rows).toHaveLength(2) // its own two: onlyA and shared
    expect(rows.every((r) => r.workspace_id === WS_A)).toBe(true)
    // The shared competitor has TWO subscriptions in the table. A must see one.
    expect(rows.filter((r) => r.competitor_id === seen.shared)).toHaveLength(1)
  })

  it('A cannot count, or otherwise detect, B’s subscription to the shared competitor', async () => {
    // Asked the way an attacker would: not "show me the rows" but "how many are
    // there". An aggregate runs the same policy, and this proves the number A can
    // compute is its own, not the registry's.
    const got = await asMember(db, USER_A, (tx) =>
      probe<{ n: number }>(
        tx,
        `select count(*)::int as n from competitor_subscriptions where competitor_id = $1`,
        [seen.shared],
      ),
    )
    const n = 'rows' in got ? got.rows[0]!.n : -1
    console.log('  A counts subscribers of the shared competitor:', n, '(truth is 2)')
    expect(n).toBe(1)
  })

  it('the fetch log, which carries subscriber_count, is invisible to members', async () => {
    // subscriber_count is "how many other customers watch this rival" in one
    // integer. It is the same disclosure arriving through the billing door.
    await db.exec(
      `insert into radar_fetch_log (source_id, mode, provider, subscriber_count, cost_micros)
       values ('${seen.srcShared}'::uuid, 'render', 'apify', 2, 2600)`,
    )
    const got = await asMember(db, USER_A, (tx) =>
      probe<{ n: number }>(tx, 'select count(*)::int as n from radar_fetch_log'),
    )
    console.log('  A reads radar_fetch_log:', JSON.stringify(got))
    const n = 'rows' in got ? got.rows[0]!.n : -1
    expect(n).toBe(0)
  })

  // ── the identity that separates "membership" from "the other tenant" ───────

  it('a valid token belonging to NO workspace sees nothing at all', async () => {
    for (const table of [
      'competitors',
      'competitor_sources',
      'competitor_subscriptions',
      'competitor_snapshots',
      'competitor_changes',
      'radar_fetch_log',
    ]) {
      const got = await asMember(db, USER_C, (tx) =>
        probe<{ n: number }>(tx, `select count(*)::int as n from ${table}`),
      )
      const n = 'rows' in got ? got.rows[0]!.n : -1
      console.log(`  userC ${table.padEnd(26)} -> ${JSON.stringify(got)}`)
      expect(n).toBe(0)
    }
  })

  it('an anonymous caller sees nothing at all', async () => {
    for (const table of ['competitors', 'competitor_sources', 'competitor_subscriptions']) {
      const got = await asRole(db, 'anon', {}, (tx) =>
        probe<{ n: number }>(tx, `select count(*)::int as n from ${table}`),
      )
      const n = 'rows' in got ? got.rows[0]!.n : -1
      console.log(`  anon  ${table.padEnd(26)} -> ${JSON.stringify(got)}`)
      expect(n).toBe(0)
    }
  })

  // ── the WRITING door, which is a second way to read the registry ───────────

  it('a member cannot write the shared registry — including to probe it', async () => {
    // The uniqueness rule on (kind, locator) means a permitted INSERT would
    // answer "is this rival already tracked?" by the difference between success
    // and a duplicate-key error. So there is no insert policy at all, and the
    // refusal must be a PERMISSION refusal rather than a constraint one.
    const attempts: Array<[string, string, unknown[]]> = [
      ['competitors', `insert into competitors (display_name) values ('probe')`, []],
      [
        'competitor_sources',
        `insert into competitor_sources (competitor_id, kind, locator, cadence)
         values ($1::uuid, 'website', 'probe.example', 'weekly')`,
        [seen.onlyA],
      ],
      [
        'competitor_subscriptions',
        `insert into competitor_subscriptions (workspace_id, competitor_id, created_by)
         values ('${WS_A}'::uuid, $1::uuid, '${USER_A}')`,
        [seen.onlyB],
      ],
      [
        'competitor_snapshots',
        `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
         values ($1::uuid, '{}'::jsonb, 'x', now())`,
        [seen.srcShared],
      ],
    ]
    for (const [table, sql, params] of attempts) {
      const got = await asMember(db, USER_A, (tx) => probe(tx, sql, params))
      console.log(`  A insert ${table.padEnd(26)} -> ${JSON.stringify(got)}`)
      expect(got).toHaveProperty('denied')
      // Named explicitly: a duplicate-key refusal would still be a refusal, and
      // would still have answered the attacker's question.
      expect((got as { denied: string }).denied).toMatch(/row-level security|permission denied/i)
    }
  })

  it('a member CAN unsubscribe itself, and cannot unsubscribe anyone else', async () => {
    const mine = await asMember(db, USER_A, async (tx) => {
      const r = await probe<Row>(
        tx,
        `delete from competitor_subscriptions where competitor_id = $1 returning id`,
        [seen.shared],
      )
      return r
    })
    console.log('  A deletes its own subscription ->', JSON.stringify(mine))
    expect('rows' in mine && mine.rows).toHaveLength(1)

    const targeted = await asMember(db, USER_A, (tx) =>
      probe<Row>(
        tx,
        `delete from competitor_subscriptions where workspace_id = $1::uuid returning id`,
        [WS_B],
      ),
    )
    console.log("  A deletes B's subscriptions (targeted) ->", JSON.stringify(targeted))
    expect('rows' in targeted && targeted.rows).toHaveLength(0)
  })

  /**
   * THE SHAPE A TARGETED ATTEMPT CANNOT REACH.
   *
   * MEASURED, in two rounds, and the first answer was wrong.
   *
   * Widening the DELETE policy to `using (true)` leaves the targeted test above
   * ALIVE — it still removes nothing. The reason is not that the policy is safe:
   * it is that PostgreSQL applies SELECT policies to an UPDATE or DELETE whenever
   * the statement REFERENCES EXISTING COLUMN VALUES, and `where workspace_id = $1`
   * references one. So the correct SELECT policy quietly stood in for the broken
   * DELETE policy, and the suite could not tell the two apart.
   *
   * (The first attempt at this test blamed the RETURNING clause and switched to
   * `affectedRows`. That mutant survived too — RETURNING is only one of the ways a
   * statement comes to reference a column, and the WHERE clause was the other.)
   *
   * An UNQUALIFIED statement references no existing column at all. That is the
   * shape where the DELETE policy stands alone, and it is therefore the only shape
   * that tests it. `affectedRows` counts what the database really touched rather
   * than what it was willing to show back.
   *
   * A wide-open policy shows up here as 4 rows instead of 2 — the whole table
   * instead of this member's half.
   */
  it('an unqualified DELETE removes only this member’s own subscriptions', async () => {
    const total = (
      await db.query<{ n: number }>('select count(*)::int as n from competitor_subscriptions')
    ).rows[0]!.n

    const swept = await asMember(db, USER_A, async (tx) => {
      const r = await tx.query('delete from competitor_subscriptions')
      return r.affectedRows ?? 0
    })
    console.log(`  A runs an unqualified DELETE -> ${swept} of ${total} rows in the table`)
    expect(total).toBe(4) // A: onlyA + shared, B: onlyB + shared
    expect(swept).toBe(2)
  })

  it('an unqualified UPDATE relabels only this member’s own subscriptions', async () => {
    // The sibling of the test above, and it is not implied by it. Renaming
    // someone's private label is a smaller harm than deleting their row, but it is
    // the same door and the same blind spot, so it is proved the same way.
    const touched = await asMember(db, USER_A, async (tx) => {
      const r = await tx.query(`update competitor_subscriptions set label = 'owned'`)
      return r.affectedRows ?? 0
    })
    console.log(`  A runs an unqualified UPDATE -> ${touched} rows`)
    expect(touched).toBe(2)
  })
})
