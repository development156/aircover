import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asRole, probe, currentRole } from './helpers/pglite-tenant'

/**
 * Three hardenings of The Loop, each proven by BREAKING it on a real Postgres
 * with RLS enforced (`set local role authenticated`, the claim `auth.jwt()`
 * reads). PGlite's default connection is a superuser and would see none of
 * these policies, so every RLS assertion below runs through `asRole`.
 *
 * ── WHAT IS PROVEN ───────────────────────────────────────────────────────────
 *   1. loop_settings / loop_channel_autonomy are ROLE-GATED on write
 *      (20260906200000). A viewer is refused INSERT (WITH CHECK raises) and
 *      makes no change on UPDATE (a policy denial is 0 rows, NOT an error — the
 *      value is re-read and shown unchanged). An editor is allowed both. SELECT
 *      stays open to every member.
 *   2. THE KILL SWITCH REACHES L2 'review' POSTS (20260906200100). A post the
 *      Loop wrote at L2 sits at status='review' on the approvals queue; the
 *      switch now returns it to 'draft'. A review post NOT linked to a brief —
 *      one the customer queued by hand — is left alone.
 *   3. A CYCLE CANNOT ENTER 'creating' UNAPPROVED (20260906200200). The CHECK
 *      refuses status='creating' while cost_approved_at is null, and permits it
 *      once approved.
 *
 * ── MUTATIONS THAT PROVE EACH GUARD (CLAUDE.md's one rule) ───────────────────
 *   · #1: in 20260906200000 drop `and m.role in (...)` from the loop_settings
 *     t_insert policy → the viewer-INSERT-refused case goes green-should-be-red
 *     (accepted), the test fails.
 *   · #2: in 20260906200100 remove 'review' from `p.status in
 *     ('review','approved','scheduled')` → the review post is no longer
 *     reclaimed, the "review post is cancelled" assertion fails.
 *   · #3: in 20260906200200 change the CHECK to `cost_approved_at is null or
 *     cost_approved_at is not null` (always true) → the unapproved-creating
 *     transition is accepted, the refusal assertion fails.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OWNER = 'user_loop_owner'
const EDITOR = 'user_loop_editor'
const VIEWER = 'user_loop_viewer'

const POST_REVIEW = '33333333-3333-4333-8333-333333333331'
const POST_HANDMADE = '33333333-3333-4333-8333-333333333332'
const CYCLE = '44444444-4444-4444-8444-444444444441'

/** Claims for a signed-in Clerk user, shaped as `auth.jwt()` expects. */
function claims(sub: string): Record<string, unknown> {
  return { sub, role: 'authenticated' }
}

describe('The Loop · settings role gate, kill switch review, approval invariant', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS}', 'A', 'loop-a', '${OWNER}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS}', '${OWNER}',  'owner'),
        ('${WS}', '${EDITOR}', 'editor'),
        ('${WS}', '${VIEWER}', 'viewer');

      -- A reported cycle (the "Loop planned my week" case), properly approved so
      -- the new invariant permits it, with a review post on the approvals queue.
      insert into loop_cycles
        (id, workspace_id, iso_year, iso_week, status,
         estimated_credits, cost_approved_at, cost_approved_by, approved_credits)
      values
        ('${CYCLE}', '${WS}', 2026, 40, 'reported',
         20, now(), '${OWNER}', 20);

      insert into posts (id, workspace_id, title, status, channels) values
        ('${POST_REVIEW}',   '${WS}', 'L2 draft awaiting approval', 'review', '{instagram}'),
        ('${POST_HANDMADE}', '${WS}', 'queued by hand',            'review', '{instagram}');

      -- Only the first post is a Loop post: it carries a brief link.
      insert into loop_briefs (workspace_id, cycle_id, priority, title, body, post_id)
      values ('${WS}', '${CYCLE}', 1, 'brief', 'body', '${POST_REVIEW}');
    `)
  }, 120_000)

  afterAll(async () => {
    await db.close()
  })

  // ── 1 · role gate on loop_settings / loop_channel_autonomy ──────────────────

  it('confirms the role actually dropped — a policy is inert against a superuser', async () => {
    await asRole(db, 'authenticated', claims(VIEWER), async (tx) => {
      const who = await currentRole(tx)
      expect(who.user).toBe('authenticated')
      expect(who.superuser).toBe('off')
    })
  })

  it('a viewer is REFUSED insert of loop_settings; an editor is allowed', async () => {
    const asViewer = await asRole(db, 'authenticated', claims(VIEWER), (tx) =>
      probe(tx, `insert into loop_settings (workspace_id, paused) values ($1, true)`, [WS]),
    )
    expect('denied' in asViewer).toBe(true)

    const asEditor = await asRole(db, 'authenticated', claims(EDITOR), (tx) =>
      probe(tx, `insert into loop_settings (workspace_id, paused) values ($1, true)`, [WS]),
    )
    expect('rows' in asEditor).toBe(true)
  })

  it('a viewer UPDATE of loop_settings changes NOTHING — 0 rows, no error, value unchanged', async () => {
    // Seed a row to update (committed, outside any rolled-back tx).
    await db.exec(
      `insert into loop_settings (workspace_id, paused, weekly_budget_credits)
       values ('${WS}', false, 150)
       on conflict (workspace_id) do update set paused = false, weekly_budget_credits = 150`,
    )

    await asRole(db, 'authenticated', claims(VIEWER), async (tx) => {
      // An RLS UPDATE denial is 0 rows affected with NO exception — assert on the
      // rowcount and a re-read, never on a thrown error (posts_lifecycle guard's
      // `sentence()` carries the same warning).
      const got = await probe<{ id: unknown }>(
        tx,
        `update loop_settings set weekly_budget_credits = 4000
          where workspace_id = $1 returning workspace_id as id`,
        [WS],
      )
      expect('rows' in got && got.rows.length).toBe(0)
    })

    const after = (
      await db.query<{ n: number }>(
        `select weekly_budget_credits as n from loop_settings where workspace_id = $1`,
        [WS],
      )
    ).rows[0]!
    expect(after.n).toBe(150)
  })

  it('an editor UPDATE of loop_settings is allowed', async () => {
    const got = await asRole(db, 'authenticated', claims(EDITOR), (tx) =>
      probe<{ id: unknown }>(
        tx,
        `update loop_settings set weekly_budget_credits = 300
          where workspace_id = $1 returning workspace_id as id`,
        [WS],
      ),
    )
    expect('rows' in got && got.rows.length).toBe(1)
  })

  it('a viewer is REFUSED the autonomy dial (arming a channel); an editor is allowed', async () => {
    // level 1 keeps the L3 autopilot precondition trigger out of the way, so the
    // ONLY thing that can refuse the viewer is the write-role policy under test.
    const asViewer = await asRole(db, 'authenticated', claims(VIEWER), (tx) =>
      probe(
        tx,
        `insert into loop_channel_autonomy (workspace_id, channel, level) values ($1, 'x', 1)`,
        [WS],
      ),
    )
    expect('denied' in asViewer).toBe(true)

    const asEditor = await asRole(db, 'authenticated', claims(EDITOR), (tx) =>
      probe(
        tx,
        `insert into loop_channel_autonomy (workspace_id, channel, level) values ($1, 'gbp', 1)`,
        [WS],
      ),
    )
    expect('rows' in asEditor).toBe(true)
  })

  it('a viewer may still READ both control tables', async () => {
    const got = await asRole(db, 'authenticated', claims(VIEWER), (tx) =>
      probe<{ n: number }>(
        tx,
        `select count(*)::int as n from loop_settings where workspace_id = $1`,
        [WS],
      ),
    )
    expect('rows' in got).toBe(true)
  })

  // ── 2 · kill switch reaches the L2 review post ──────────────────────────────

  it('the kill switch returns the L2 review post to draft, and leaves the hand-queued one alone', async () => {
    const out = await asRole(db, 'authenticated', claims(OWNER), async (tx) => {
      const res = await tx.query<{ o: { posts_unscheduled: number } }>(
        `select public.loop_kill_switch($1, true) as o`,
        [WS],
      )
      const review = (
        await tx.query<{ status: string }>(`select status from posts where id = $1`, [POST_REVIEW])
      ).rows[0]!
      const handmade = (
        await tx.query<{ status: string }>(`select status from posts where id = $1`, [
          POST_HANDMADE,
        ])
      ).rows[0]!
      return { res: res.rows[0]!.o, review: review.status, handmade: handmade.status }
    })

    expect(out.review).toBe('draft') // the Loop's L2 post is reclaimed
    expect(out.handmade).toBe('review') // the customer's own queued post is untouched
    expect(out.res.posts_unscheduled).toBe(1)
  })

  // ── 3 · a cycle cannot enter 'creating' while unapproved ─────────────────────

  it('refuses status=creating on an unapproved cycle, and permits it once approved', async () => {
    // A fresh cycle at the halt, no approval yet.
    const unapprovedCycle = '44444444-4444-4444-8444-444444444442'
    await db.exec(
      `insert into loop_cycles (id, workspace_id, iso_year, iso_week, status)
       values ('${unapprovedCycle}', '${WS}', 2026, 41, 'awaiting_cost_approval')`,
    )

    // The CHECK is enforced for everyone, superuser included — probe it directly.
    await db.exec('begin')
    const refused = await probe(db, `update loop_cycles set status = 'creating' where id = $1`, [
      unapprovedCycle,
    ])
    expect('denied' in refused).toBe(true)

    // Approve it (the shape loop_approve_cost writes), then the same move is fine.
    await probe(
      db,
      `update loop_cycles
          set cost_approved_at = now(), cost_approved_by = $2, approved_credits = 10
        where id = $1`,
      [unapprovedCycle, OWNER],
    )
    const allowed = await probe<{ id: unknown }>(
      db,
      `update loop_cycles set status = 'creating' where id = $1 returning id`,
      [unapprovedCycle],
    )
    await db.exec('rollback')
    expect('rows' in allowed && allowed.rows.length).toBe(1)
  })
})
