import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe, currentRole } from './helpers/pglite-tenant'

/**
 * marketing_observations — the Marketing Brain's store, EXECUTED.
 *
 * ── WHAT IS WORTH TESTING HERE ───────────────────────────────────────────────
 * Not the column list. What is tested is every promise the app is built on top
 * of, each by ATTEMPTING the thing that must fail rather than assuming it does:
 *
 *   · a member reads their own observations and NOT another workspace's;
 *   · a signed-out visitor reads nothing at all;
 *   · a signed-in member cannot WRITE one, in any of the three ways — insert,
 *     update, delete. This is the important one. Every row here is a sentence
 *     beginning "you have", and a customer able to insert one could put words in
 *     front of their own team, or with a wrong workspace id in front of somebody
 *     else's;
 *   · recomputing the same day UPDATES rather than duplicating, which is what
 *     lets the weekly cron be retried;
 *   · the evidence check refuses a row with no arithmetic behind it, because a
 *     claim with no receipt is the one thing this table exists not to hold.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const MEMBER_A = 'user_member_a'
const MEMBER_B = 'user_member_b'
const OPERATOR = 'user_operator'

const EVIDENCE = JSON.stringify({
  data: [
    { label: 'Exclamation marks per post, earlier', value: 1.4, unit: 'per_post' },
    { label: 'Exclamation marks per post, since', value: 0, unit: 'per_post' },
  ],
  postIds: ['00000000-0000-4000-8000-000000000001'],
  windowDays: 64,
})

describe('marketing_observations (real Postgres, in-process)', () => {
  let db: PGlite

  /** Writes the way the weekly pass writes: as the owner, bypassing RLS. */
  async function write(
    workspaceId: string,
    subject: string,
    day: string,
    claim = 'You have stopped using exclamation marks.',
  ) {
    return db.query<{ inserted: boolean }>(
      `insert into marketing_observations
         (workspace_id, kind, subject, claim, evidence, computed_on)
       values ($1, 'tone_drift', $2, $3, $4::jsonb, $5::date)
       on conflict (workspace_id, kind, subject, computed_on) do update
         set claim = excluded.claim, evidence = excluded.evidence, updated_at = now()
       returning (xmax = 0) as inserted`,
      [workspaceId, subject, claim, EVIDENCE, day],
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
    await write(WS_A, 'exclamation_marks', '2026-08-23')
    await write(
      WS_B,
      'exclamation_marks',
      '2026-08-23',
      'You use more exclamation marks than you did: 0.4 per post across your 6 earlier posts, 1.8 in the 6 since.',
    )
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

  it('shows a member their own observations', async () => {
    const rows = await asMember(
      db,
      MEMBER_A,
      async (tx) =>
        (await tx.query<{ claim: string }>(`select claim from marketing_observations`)).rows,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.claim).toContain('stopped using exclamation marks')
  })

  it('shows a member nothing of the other workspace, asked for by id', async () => {
    const rows = await asMember(
      db,
      MEMBER_A,
      async (tx) =>
        (await tx.query(`select claim from marketing_observations where workspace_id = $1`, [WS_B]))
          .rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('shows a signed-out visitor nothing', async () => {
    const rows = await asRole(
      db,
      'anon',
      { role: 'anon' },
      async (tx) => (await tx.query(`select claim from marketing_observations`)).rows,
    )
    expect(rows).toHaveLength(0)
  })

  // ── THE WRITE DOOR, TRIED THREE WAYS ───────────────────────────────────────

  it('refuses a member an INSERT, so nobody can author their own "Sahoda noticed"', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(
        tx,
        `insert into marketing_observations (workspace_id, kind, subject, claim, evidence, computed_on)
         values ($1, 'tone_drift', 'invented', 'You are the best baker in Pune.', $2::jsonb, '2026-08-24')`,
        [WS_A, EVIDENCE],
      ),
    )
    expect(result).toHaveProperty('denied')
  })

  it('refuses a member an insert aimed at ANOTHER workspace', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(
        tx,
        `insert into marketing_observations (workspace_id, kind, subject, claim, evidence, computed_on)
         values ($1, 'tone_drift', 'planted', 'Your posts have got worse.', $2::jsonb, '2026-08-24')`,
        [WS_B, EVIDENCE],
      ),
    )
    expect(result).toHaveProperty('denied')
  })

  it('refuses a member an UPDATE of their own observation', async () => {
    const result = await asMember(db, MEMBER_A, (tx) =>
      probe(tx, `update marketing_observations set claim = 'Rewritten.' where workspace_id = $1`, [
        WS_A,
      ]),
    )
    // An UPDATE with no policy affects zero rows rather than raising, because
    // the policy filters the rows it can see before it changes them. Both
    // outcomes are a refusal; asserting the row is unchanged is what actually
    // proves it, and it is checked outside the member session below.
    if ('rows' in result) {
      const after = (
        await db.query<{ claim: string }>(
          `select claim from marketing_observations where workspace_id = $1`,
          [WS_A],
        )
      ).rows
      expect(after[0]?.claim).toContain('stopped using exclamation marks')
    }
  })

  it('refuses a member a DELETE', async () => {
    await asMember(db, MEMBER_A, (tx) =>
      probe(tx, `delete from marketing_observations where workspace_id = $1`, [WS_A]),
    )
    const left = (
      await db.query(`select 1 from marketing_observations where workspace_id = $1`, [WS_A])
    ).rows
    expect(left).toHaveLength(1)
  })

  // ── THE OPERATOR'S WINDOW ──────────────────────────────────────────────────

  it('shows an operator every workspace, because nothing else can', async () => {
    const rows = await asMember(
      db,
      OPERATOR,
      async (tx) =>
        (await tx.query<{ claim: string }>(`select claim from marketing_observations`)).rows,
    )
    // Both workspaces' rows, from a user who is a member of neither.
    expect(rows).toHaveLength(2)
  })

  it('does not make an operator of somebody who is not one', async () => {
    const rows = await asMember(
      db,
      MEMBER_B,
      async (tx) =>
        (await tx.query<{ claim: string }>(`select claim from marketing_observations`)).rows,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.claim).toContain('more exclamation marks')
  })

  it('still refuses an operator a write', async () => {
    const result = await asMember(db, OPERATOR, (tx) =>
      probe(
        tx,
        `insert into marketing_observations (workspace_id, kind, subject, claim, evidence, computed_on)
         values ($1, 'tone_drift', 'by_ops', 'An operator said so.', $2::jsonb, '2026-08-24')`,
        [WS_A, EVIDENCE],
      ),
    )
    expect(result).toHaveProperty('denied')
  })

  // ── THE STORE'S OWN PROMISES ───────────────────────────────────────────────

  it('turns a re-run into an update, not a second copy', async () => {
    const first = await write(WS_A, 'exclamation_marks', '2026-08-30')
    expect(first.rows[0]?.inserted).toBe(true)

    const again = await write(WS_A, 'exclamation_marks', '2026-08-30', 'A refreshed sentence.')
    expect(again.rows[0]?.inserted).toBe(false)

    const rows = (
      await db.query<{ claim: string }>(
        `select claim from marketing_observations where workspace_id = $1 and computed_on = '2026-08-30'`,
        [WS_A],
      )
    ).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]?.claim).toBe('A refreshed sentence.')
  })

  it('keeps two subjects of the same kind on the same day apart', async () => {
    await write(WS_A, 'sentence_length', '2026-08-30', 'You write shorter sentences than you did.')
    const rows = (
      await db.query(
        `select 1 from marketing_observations where workspace_id = $1 and computed_on = '2026-08-30'`,
        [WS_A],
      )
    ).rows
    expect(rows).toHaveLength(2)
  })

  it('refuses a claim with no arithmetic behind it', async () => {
    await expect(
      db.query(
        `insert into marketing_observations (workspace_id, kind, subject, claim, evidence, computed_on)
         values ($1, 'tone_drift', 'unevidenced', 'Trust me.', '{}'::jsonb, '2026-09-06')`,
        [WS_A],
      ),
    ).rejects.toThrow()
  })

  it('refuses a kind the application does not know how to compute', async () => {
    await expect(
      db.query(
        `insert into marketing_observations (workspace_id, kind, subject, claim, evidence, computed_on)
         values ($1, 'vibes', 'x', 'Something.', $2::jsonb, '2026-09-06')`,
        [WS_A, EVIDENCE],
      ),
    ).rejects.toThrow()
  })
})
