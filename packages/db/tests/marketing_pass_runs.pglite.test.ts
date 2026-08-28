import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe, currentRole } from './helpers/pglite-tenant'

/**
 * marketing_pass_runs — the record of having LOOKED, EXECUTED.
 *
 * The sibling of `marketing_observations.pglite.test.ts`, and it tests the same
 * promises by ATTEMPTING them, because this table carries one the other does
 * not: a row here is a statement about Sahoda's own diligence. "We examined your
 * workspace on 23 August and were waiting for more posts" is a claim a customer
 * will believe, and a customer who could write one could manufacture a history
 * of attention that never happened.
 *
 * What is proved below:
 *
 *   · a member reads their own runs and not another workspace's;
 *   · a signed-out visitor reads nothing;
 *   · a member cannot insert, update or delete — the three doors, each tried;
 *   · re-running the same day UPDATES rather than duplicating, which is what
 *     lets the weekly cron be retried;
 *   · `declines` refuses a JSON array and a JSON scalar, because a screen that
 *     reads it as kind-to-reason would render nonsense from either;
 *   · `written` refuses a negative count;
 *   · an operator sees every workspace, because /admin is the only window onto
 *     a store that is hidden from customers by design.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'user_member_a'
const MEMBER_B = 'user_member_b'
const OPERATOR = 'user_operator'

const DECLINES = JSON.stringify({
  tone_drift: 'too_few_posts',
  channel_return: 'window_too_short',
})

describe('marketing_pass_runs (real Postgres, in-process)', () => {
  let db: PGlite

  /** Writes the way the weekly pass writes: as the owner, bypassing RLS. */
  async function write(workspaceId: string, day: string, declines = DECLINES, written = 0) {
    return db.query<{ inserted: boolean }>(
      `insert into marketing_pass_runs (workspace_id, computed_on, declines, written)
       values ($1, $2::date, $3::jsonb, $4)
       on conflict (workspace_id, computed_on) do update
         set declines = excluded.declines, written = excluded.written, updated_at = now()
       returning (xmax = 0) as inserted`,
      [workspaceId, day, declines, written],
    )
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    for (const [id, slug, user] of [
      [WS_A, 'a', MEMBER_A],
      [WS_B, 'b', MEMBER_B],
    ] as const) {
      await db.query(
        `insert into workspaces (id, name, slug, created_by) values ($1, $2, $2, $3)`,
        [id, slug, user],
      )
      await db.query(
        `insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`,
        [id, user],
      )
    }
    await db.query(
      `insert into ops_admins (user_id, email, role, status)
       values ($1, 'ops@sahodalabs.com', 'admin', 'active')`,
      [OPERATOR],
    )
    await write(WS_A, '2026-08-23')
    await write(WS_B, '2026-08-23', JSON.stringify({ tone_drift: 'no_posts' }))
  })

  afterAll(async () => {
    await db.close()
  })

  it('drops the superuser, or every policy below is inert', async () => {
    await asMember(db, MEMBER_A, async (tx) => {
      const role = await currentRole(tx)
      expect(role.user).toBe('authenticated')
      expect(role.superuser).toBe('off')
    })
  })

  it('shows a member their own runs', async () => {
    const rows = await asMember(
      db,
      MEMBER_A,
      async (tx) =>
        (
          await tx.query<{ declines: Record<string, string> }>(
            `select declines from marketing_pass_runs`,
          )
        ).rows,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.declines['tone_drift']).toBe('too_few_posts')
  })

  it('shows a member nothing of the other workspace, asked for by id', async () => {
    const rows = await asMember(
      db,
      MEMBER_A,
      async (tx) =>
        (await tx.query(`select declines from marketing_pass_runs where workspace_id = $1`, [WS_B]))
          .rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('shows a signed-out visitor nothing', async () => {
    const rows = await asRole(
      db,
      'anon',
      { role: 'anon' },
      async (tx) => (await tx.query(`select declines from marketing_pass_runs`)).rows,
    )
    expect(rows).toHaveLength(0)
  })

  // ── THE WRITE DOOR, TRIED THREE WAYS ───────────────────────────────────────

  it('refuses a member an INSERT, so nobody can manufacture a day Sahoda looked', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(
        tx,
        `insert into marketing_pass_runs (workspace_id, computed_on, declines)
         values ($1, '2026-08-24', $2::jsonb)`,
        [WS_A, DECLINES],
      ),
    )
    expect(result).toHaveProperty('denied')
  })

  it('refuses a member an insert aimed at ANOTHER workspace', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(
        tx,
        `insert into marketing_pass_runs (workspace_id, computed_on, declines)
         values ($1, '2026-08-24', $2::jsonb)`,
        [WS_B, DECLINES],
      ),
    )
    expect(result).toHaveProperty('denied')
  })

  it('refuses a member an UPDATE of their own run', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(tx, `update marketing_pass_runs set written = 99 where workspace_id = $1`, [WS_A]),
    )
    // An UPDATE with no policy affects zero rows rather than raising: the policy
    // filters the rows it can see before it changes them. Both outcomes are a
    // refusal, and the row being unchanged is what proves it.
    if ('rows' in result) {
      const after = (
        await db.query<{ written: number }>(
          `select written from marketing_pass_runs where workspace_id = $1`,
          [WS_A],
        )
      ).rows
      expect(after[0]?.written).toBe(0)
    }
  })

  it('refuses a member a DELETE', async () => {
    await asMember(db, MEMBER_A, (tx) =>
      probe(tx, `delete from marketing_pass_runs where workspace_id = $1`, [WS_A]),
    )
    const left = (
      await db.query(`select 1 from marketing_pass_runs where workspace_id = $1`, [WS_A])
    ).rows
    expect(left).toHaveLength(1)
  })

  // ── THE RETRY, AND THE SHAPE OF THE COLUMN ─────────────────────────────────

  it('updates the same day rather than duplicating it, so the cron can be retried', async () => {
    const again = await write(WS_A, '2026-08-23', JSON.stringify({ tone_drift: 'no_posts' }), 1)
    expect(again.rows[0]?.inserted).toBe(false)

    const rows = (
      await db.query<{ declines: Record<string, string>; written: number }>(
        `select declines, written from marketing_pass_runs where workspace_id = $1`,
        [WS_A],
      )
    ).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]?.declines['tone_drift']).toBe('no_posts')
    expect(rows[0]?.written).toBe(1)
  })

  it('refuses declines that are not an object, in both wrong shapes', async () => {
    // Owner-side constraint checks, so `probe` is the wrong tool: it opens a
    // savepoint and there is no transaction here. The sibling file asserts its
    // evidence check the same way.
    for (const wrong of ['["too_few_posts"]', '"too_few_posts"']) {
      await expect(
        db.query(
          `insert into marketing_pass_runs (workspace_id, computed_on, declines)
           values ($1, '2026-08-30', $2::jsonb)`,
          [WS_A, wrong],
        ),
      ).rejects.toThrow()
    }
  })

  it('refuses a negative count of observations written', async () => {
    await expect(
      db.query(
        `insert into marketing_pass_runs (workspace_id, computed_on, written)
         values ($1, '2026-08-31', -1)`,
        [WS_A],
      ),
    ).rejects.toThrow()
  })

  // ── THE OPERATOR'S WINDOW ──────────────────────────────────────────────────

  it('shows an operator every workspace, because nothing else can', async () => {
    const rows = await asMember(
      db,
      OPERATOR,
      async (tx) => (await tx.query(`select workspace_id from marketing_pass_runs`)).rows,
    )
    expect(rows).toHaveLength(2)
  })
})
