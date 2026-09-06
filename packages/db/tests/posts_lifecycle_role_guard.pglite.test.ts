import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe } from './helpers/pglite-tenant'

/**
 * Lifecycle writes on `posts` are role-gated IN THE DATABASE (R1), and approval
 * is a recorded fact that schedules a dated post (R2).
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * `posts` carries the plain tenant policy, so `t_update` is membership-only.
 * 20260902220002 closed `publishing` and `published`; every other lifecycle
 * move was still a PostgREST write away. MEASURED 2026-09-06 on production with
 * a member's own JWT: `status = 'scheduled', scheduled_at = now()` → 200 and
 * `status = 'partial'` → 200. Only `published` was refused. And `approvePost`
 * wrote `{ status: 'approved' }` with no record of who or when.
 *
 * ── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * Under RLS, as viewer / editor / approver / owner of A:
 *   · no role can move status to scheduled or partial directly, nor walk a
 *     published or partial post back; the row is byte-identical afterwards
 *   · draft → review → draft stays open to any member (savePost's moves)
 *   · COMPAT (temporary, wt-web): draft set → approved directly is allowed for
 *     owner / editor / approver, refused for a viewer, records nothing, and
 *     does not widen to scheduled or to a walk-back
 *   · a post cannot be BORN scheduled; a draft born with scheduled_at and
 *     channels (plan-my-week's shape) is accepted
 *   · scheduled_at moves under an editor on a draft, not under an approver, and
 *     not under an editor once the post is published
 *   · approved_by / approved_at cannot be written directly by anyone
 *   · approve_posts: approver on a dated draft → scheduled with approved_by /
 *     approved_at; undated → approved; viewer → FORBIDDEN_ROLE; two workspaces
 *     → POSTS_SPAN_WORKSPACES; already-approved rows → zero rows, no error;
 *     a non-member → zero rows, indistinguishable from a missing id (no
 *     existence oracle); no JWT → NOT_SIGNED_IN
 *   · release_post_for_publish and reschedule_post record the caller as approver
 *     and keep one that already exists
 *   · the postgres role (the publisher's pool) writes any status
 *   · the backfill converts approved + dated into scheduled
 *
 * Mutation that proves the guard: in 20260906190000, replace
 * `current_user not in ('anon', 'authenticated')` with
 * `current_user not in ('nobody')` in app.posts_lifecycle_role_guard. Every
 * direct-write refusal below is accepted again and goes red. MEASURED
 * 2026-09-06: 21 failed | 23 passed (44); the 23 that stay green are the
 * allowances (the compat approves among them), the RPCs, the postgres role and
 * the backfill, which the mutation does not touch.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER_A = 'user_lc_owner_a'
const EDITOR_A = 'user_lc_editor_a'
const APPROVER_A = 'user_lc_approver_a'
const VIEWER_A = 'user_lc_viewer_a'
const OWNER_B = 'user_lc_owner_b'

const POST_DATED = '33333333-3333-4333-8333-333333333331'
const POST_UNDATED = '33333333-3333-4333-8333-333333333332'
const POST_PUBLISHED = '33333333-3333-4333-8333-333333333333'
const POST_APPROVED = '33333333-3333-4333-8333-333333333334'
const POST_PARTIAL = '33333333-3333-4333-8333-333333333335'
const POST_B = '33333333-3333-4333-8333-333333333336'

const ROLES = [
  ['viewer', VIEWER_A],
  ['editor', EDITOR_A],
  ['approver', APPROVER_A],
  ['owner', OWNER_A],
] as const

type PostRow = {
  status: string
  scheduled_at: string | Date | null
  approved_by: string | null
  approved_at: string | Date | null
}

/** The SENTENCE, not falsiness: a policy denial is affected 0 with no error, a weaker fact. */
function sentence(got: { rows: unknown[] } | { denied: string }): string {
  return 'denied' in got ? got.denied : 'ACCEPTED'
}

const READ = `select status, scheduled_at, approved_by, approved_at from posts where id = $1`

/** PGlite returns timestamptz as a Date; the same instant, one shape, for comparison. */
function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

describe('posts: lifecycle writes are role-gated in the database', () => {
  let db: PGlite

  async function post(id: string): Promise<PostRow> {
    return (await db.query<PostRow>(READ, [id])).rows[0]!
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'lc-a', '${OWNER_A}'),
        ('${WS_B}', 'B', 'lc-b', '${OWNER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',    'owner'),
        ('${WS_A}', '${EDITOR_A}',   'editor'),
        ('${WS_A}', '${APPROVER_A}', 'approver'),
        ('${WS_A}', '${VIEWER_A}',   'viewer'),
        ('${WS_B}', '${OWNER_B}',    'owner');
      insert into posts (id, workspace_id, title, status, channels, scheduled_at) values
        ('${POST_DATED}',     '${WS_A}', 'dated draft',   'draft',     '{instagram}', now() + interval '1 day'),
        ('${POST_UNDATED}',   '${WS_A}', 'undated draft', 'draft',     '{instagram}', null),
        ('${POST_PUBLISHED}', '${WS_A}', 'live',          'published', '{instagram}', now() - interval '1 day'),
        ('${POST_APPROVED}',  '${WS_A}', 'cleared',       'approved',  '{instagram}', null),
        ('${POST_PARTIAL}',   '${WS_A}', 'half out',      'partial',   '{instagram}', now() - interval '1 day'),
        ('${POST_B}',         '${WS_B}', 'b draft',       'draft',     '{instagram}', null);
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('baseline: the seed is what the tests assume', async () => {
    expect(await post(POST_DATED)).toMatchObject({ status: 'draft', approved_by: null })
    expect((await post(POST_DATED)).scheduled_at).not.toBeNull()
    expect(await post(POST_UNDATED)).toMatchObject({ status: 'draft', scheduled_at: null })
    expect((await post(POST_PUBLISHED)).status).toBe('published')
    expect((await post(POST_APPROVED)).status).toBe('approved')
    expect((await post(POST_PARTIAL)).status).toBe('partial')
  })

  // ── (a) no role moves status out of the draft set directly ────────────────

  for (const [role, user] of ROLES) {
    for (const status of ['scheduled', 'partial'] as const) {
      it(`REFUSES the ${role} setting status = ${status} directly`, async () => {
        const before = await post(POST_UNDATED)
        const got = await asMember(db, user, (tx) =>
          probe(tx, `update posts set status = $2 where id = $1`, [POST_UNDATED, status]),
        )
        expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
        expect(await post(POST_UNDATED)).toEqual(before)
      })
    }
  }

  // ── the wt-web compatibility path: draft set → approved, direct, role-gated ─
  // Production still writes `status = 'approved'` through the authenticated
  // client with the role check in the server action. Temporary; see the
  // migration header for what to delete once wt-core is promoted.

  it('COMPAT: ALLOWS the approver setting status = approved directly on a draft', async () => {
    const got = await asMember(db, APPROVER_A, async (tx) => {
      const rpc = await probe<{ status: string }>(
        tx,
        `update posts set status = 'approved' where id = $1 returning status`,
        [POST_UNDATED],
      )
      const after = (await tx.query<PostRow>(READ, [POST_UNDATED])).rows[0]!
      return { rpc, after }
    })
    expect(sentence(got.rpc)).toBe('ACCEPTED')
    expect('rows' in got.rpc && got.rpc.rows[0]?.status).toBe('approved')
    // The old meaning, not R2: nothing recorded, and a date does not schedule.
    expect(got.after).toMatchObject({ status: 'approved', approved_by: null, approved_at: null })
  })

  it('COMPAT: ALLOWS the owner and the editor setting status = approved directly', async () => {
    for (const user of [OWNER_A, EDITOR_A]) {
      const got = await asMember(db, user, (tx) =>
        probe<{ status: string }>(
          tx,
          `update posts set status = 'approved' where id = $1 returning status`,
          [POST_UNDATED],
        ),
      )
      expect(sentence(got)).toBe('ACCEPTED')
      expect('rows' in got && got.rows[0]?.status).toBe('approved')
    }
  })

  it('COMPAT: REFUSES the viewer setting status = approved directly', async () => {
    const before = await post(POST_UNDATED)
    const got = await asMember(db, VIEWER_A, (tx) =>
      probe(tx, `update posts set status = 'approved' where id = $1`, [POST_UNDATED]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
    expect(await post(POST_UNDATED)).toEqual(before)
  })

  it('COMPAT: a non-member cannot reach the row, and the guard would refuse them anyway', async () => {
    // RLS hides WS_A's rows from OWNER_B, so the update matches nothing
    // (affected 0, no error). The guard's role gate is proven separately by
    // the viewer above; this pins that the two walls agree.
    const before = await post(POST_UNDATED)
    const got = await asMember(db, OWNER_B, (tx) =>
      probe<{ status: string }>(
        tx,
        `update posts set status = 'approved' where id = $1 returning status`,
        [POST_UNDATED],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows).toHaveLength(0)
    expect(await post(POST_UNDATED)).toEqual(before)
  })

  it('COMPAT: the allowance does not widen: the approver still cannot set scheduled directly, nor approve a published post', async () => {
    const sched = await asMember(db, APPROVER_A, (tx) =>
      probe(tx, `update posts set status = 'scheduled' where id = $1`, [POST_UNDATED]),
    )
    expect(sentence(sched)).toContain('POST_LIFECYCLE_ROLE')
    const walk = await asMember(db, APPROVER_A, (tx) =>
      probe(tx, `update posts set status = 'approved' where id = $1`, [POST_PUBLISHED]),
    )
    expect(sentence(walk)).toContain('POST_LIFECYCLE_ROLE')
    expect((await post(POST_PUBLISHED)).status).toBe('published')
  })

  it('REFUSES the owner walking a published post back to draft', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `update posts set status = 'draft' where id = $1`, [POST_PUBLISHED]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
    expect((await post(POST_PUBLISHED)).status).toBe('published')
  })

  it('REFUSES the owner walking a partial post back to draft', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `update posts set status = 'draft' where id = $1`, [POST_PARTIAL]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
    expect((await post(POST_PARTIAL)).status).toBe('partial')
  })

  it('ALLOWS a member moving draft → review → draft', async () => {
    const got = await asMember(db, VIEWER_A, async (tx) => {
      const toReview = await probe<{ status: string }>(
        tx,
        `update posts set status = 'review' where id = $1 returning status`,
        [POST_UNDATED],
      )
      const back = await probe<{ status: string }>(
        tx,
        `update posts set status = 'draft' where id = $1 returning status`,
        [POST_UNDATED],
      )
      return { toReview, back }
    })
    expect(sentence(got.toReview)).toBe('ACCEPTED')
    expect('rows' in got.toReview && got.toReview.rows[0]?.status).toBe('review')
    expect(sentence(got.back)).toBe('ACCEPTED')
    expect('rows' in got.back && got.back.rows[0]?.status).toBe('draft')
  })

  // ── INSERT: not born scheduled; a dated draft is fine ─────────────────────

  it('REFUSES the owner INSERTING a post that is already scheduled', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(
        tx,
        `insert into posts (workspace_id, title, status, channels, scheduled_at)
         values ($1, 'born armed', 'scheduled', '{instagram}', now() + interval '1 day')`,
        [WS_A],
      ),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
  })

  it('REFUSES the owner INSERTING a post with approved_by already set', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(
        tx,
        `insert into posts (workspace_id, title, status, approved_by, approved_at)
         values ($1, 'pre-cleared', 'draft', $2, now())`,
        [WS_A, OWNER_A],
      ),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
  })

  it('ALLOWS plan-my-week’s shape: a DRAFT born with scheduled_at and channels', async () => {
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe<{ status: string; scheduled_at: string }>(
        tx,
        `insert into posts (workspace_id, title, body, status, channels, scheduled_at, origin, created_by)
         values ($1, 'Monday', 'hello', 'draft', '{instagram,linkedin}', now() + interval '2 days', 'plan_week', $2)
         returning status, scheduled_at`,
        [WS_A, EDITOR_A],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows[0]?.status).toBe('draft')
    expect(iso('rows' in got ? got.rows[0]?.scheduled_at : null)).not.toBeNull()
  })

  // ── (b) scheduled_at moves under an owner/editor on an unsettled post ────

  it('REFUSES the approver changing scheduled_at on a draft', async () => {
    const before = await post(POST_DATED)
    const got = await asMember(db, APPROVER_A, (tx) =>
      probe(tx, `update posts set scheduled_at = now() + interval '3 days' where id = $1`, [
        POST_DATED,
      ]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
    expect(await post(POST_DATED)).toEqual(before)
  })

  it('REFUSES the viewer changing scheduled_at on a draft', async () => {
    const got = await asMember(db, VIEWER_A, (tx) =>
      probe(tx, `update posts set scheduled_at = null where id = $1`, [POST_DATED]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
  })

  it('ALLOWS the editor changing scheduled_at on a draft', async () => {
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe<{ status: string }>(
        tx,
        `update posts set scheduled_at = now() + interval '3 days' where id = $1 returning status`,
        [POST_DATED],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows[0]?.status).toBe('draft')
  })

  it('REFUSES the editor changing scheduled_at on a published post', async () => {
    const before = await post(POST_PUBLISHED)
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe(tx, `update posts set scheduled_at = now() + interval '3 days' where id = $1`, [
        POST_PUBLISHED,
      ]),
    )
    expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
    expect(await post(POST_PUBLISHED)).toEqual(before)
  })

  // ── (c) the record of approval is never written directly ──────────────────

  for (const [role, user] of ROLES) {
    it(`REFUSES the ${role} writing approved_by / approved_at directly`, async () => {
      const before = await post(POST_UNDATED)
      const got = await asMember(db, user, (tx) =>
        probe(tx, `update posts set approved_by = $2, approved_at = now() where id = $1`, [
          POST_UNDATED,
          user,
        ]),
      )
      expect(sentence(got)).toContain('POST_LIFECYCLE_ROLE')
      expect(await post(POST_UNDATED)).toEqual(before)
    })
  }

  // ── approve_posts ─────────────────────────────────────────────────────────

  it('approve_posts as approver: a DATED draft becomes scheduled, with who and when', async () => {
    const got = await asMember(db, APPROVER_A, async (tx) => {
      const rpc = await probe<PostRow & { id: string }>(
        tx,
        `select id, status, scheduled_at, approved_by, approved_at from public.approve_posts($1)`,
        [[POST_DATED]],
      )
      const after = (await tx.query<PostRow>(READ, [POST_DATED])).rows[0]!
      return { rpc, after }
    })
    expect(sentence(got.rpc)).toBe('ACCEPTED')
    const rows = 'rows' in got.rpc ? got.rpc.rows : []
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: POST_DATED, status: 'scheduled', approved_by: APPROVER_A })
    expect(iso(rows[0]!.approved_at)).not.toBeNull()
    expect(got.after).toMatchObject({ status: 'scheduled', approved_by: APPROVER_A })
    expect(got.after.scheduled_at).not.toBeNull()
  })

  it('approve_posts as approver: an UNDATED draft becomes approved', async () => {
    const got = await asMember(db, APPROVER_A, (tx) =>
      probe<PostRow>(
        tx,
        `select status, scheduled_at, approved_by, approved_at from public.approve_posts($1)`,
        [[POST_UNDATED]],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    const rows = 'rows' in got ? got.rows : []
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'approved',
      scheduled_at: null,
      approved_by: APPROVER_A,
    })
    expect(iso(rows[0]!.approved_at)).not.toBeNull()
  })

  it('approve_posts as owner and as editor also clears', async () => {
    for (const user of [OWNER_A, EDITOR_A]) {
      const got = await asMember(db, user, (tx) =>
        probe<PostRow>(tx, `select status, approved_by from public.approve_posts($1)`, [
          [POST_UNDATED],
        ]),
      )
      expect(sentence(got)).toBe('ACCEPTED')
      expect('rows' in got && got.rows[0]).toMatchObject({ status: 'approved', approved_by: user })
    }
  })

  it('approve_posts as viewer → FORBIDDEN_ROLE, and the row is untouched', async () => {
    const before = await post(POST_UNDATED)
    const got = await asMember(db, VIEWER_A, (tx) =>
      probe(tx, `select * from public.approve_posts($1)`, [[POST_UNDATED]]),
    )
    expect(sentence(got)).toContain('FORBIDDEN_ROLE')
    expect(await post(POST_UNDATED)).toEqual(before)
  })

  it('approve_posts as a NON-MEMBER of that workspace → zero rows, the same as a missing id', async () => {
    // No existence oracle: a stranger must not be able to tell a real post from
    // a missing one by which sentence comes back. Both answers are compared
    // here, so a future FORBIDDEN_ROLE for either would show as a difference.
    const before = await post(POST_UNDATED)
    const got = await asMember(db, OWNER_B, async (tx) => {
      const real = await probe<{ id: string }>(tx, `select id from public.approve_posts($1)`, [
        [POST_UNDATED],
      ])
      const missing = await probe<{ id: string }>(tx, `select id from public.approve_posts($1)`, [
        ['99999999-9999-4999-8999-999999999999'],
      ])
      return { real, missing }
    })
    expect(sentence(got.real)).toBe('ACCEPTED')
    expect('rows' in got.real && got.real.rows).toHaveLength(0)
    expect(sentence(got.missing)).toBe('ACCEPTED')
    expect('rows' in got.missing && got.missing.rows).toHaveLength(0)
    expect(await post(POST_UNDATED)).toEqual(before)
  })

  it('approve_posts with ids across two workspaces → POSTS_SPAN_WORKSPACES', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `select * from public.approve_posts($1)`, [[POST_UNDATED, POST_B]]),
    )
    expect(sentence(got)).toContain('POSTS_SPAN_WORKSPACES')
    expect((await post(POST_UNDATED)).status).toBe('draft')
    expect((await post(POST_B)).status).toBe('draft')
  })

  it('approve_posts on rows already past the draft set returns ZERO rows, no error', async () => {
    const got = await asMember(db, APPROVER_A, (tx) =>
      probe(tx, `select id from public.approve_posts($1)`, [
        [POST_APPROVED, POST_PUBLISHED, POST_PARTIAL],
      ]),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows).toHaveLength(0)
    expect((await post(POST_APPROVED)).status).toBe('approved')
  })

  it('approve_posts with a mixed batch returns only the rows it moved', async () => {
    const got = await asMember(db, APPROVER_A, (tx) =>
      probe<{ id: string }>(tx, `select id from public.approve_posts($1)`, [
        [POST_APPROVED, POST_UNDATED],
      ]),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows.map((r) => r.id)).toEqual([POST_UNDATED])
  })

  it('approve_posts with no JWT subject → NOT_SIGNED_IN', async () => {
    const got = await asRole(db, 'authenticated', { role: 'authenticated' }, (tx) =>
      probe(tx, `select * from public.approve_posts($1)`, [[POST_UNDATED]]),
    )
    expect(sentence(got)).toContain('NOT_SIGNED_IN')
  })

  it('approve_posts is not executable by anon', async () => {
    const got = await asRole(db, 'anon', {}, (tx) =>
      probe(tx, `select * from public.approve_posts($1)`, [[POST_UNDATED]]),
    )
    expect(sentence(got)).toMatch(/permission denied/i)
  })

  // ── the schedule RPCs record self-approval ────────────────────────────────

  it('release_post_for_publish records the caller as approver on a draft', async () => {
    const got = await asMember(db, EDITOR_A, async (tx) => {
      const rpc = await probe(tx, `select public.release_post_for_publish($1, null)`, [
        POST_UNDATED,
      ])
      const after = (await tx.query<PostRow>(READ, [POST_UNDATED])).rows[0]!
      return { rpc, after }
    })
    expect(sentence(got.rpc)).toBe('ACCEPTED')
    expect(got.after).toMatchObject({ status: 'scheduled', approved_by: EDITOR_A })
    expect(iso(got.after.approved_at)).not.toBeNull()
  })

  it('release_post_for_publish KEEPS an approver that already cleared the post', async () => {
    const got = await asMember(db, OWNER_A, async (tx) => {
      // The approver clears it first (approved, no date), then the owner releases.
      await tx.query(`select public.approve_posts($1)`, [[POST_UNDATED]])
      const cleared = (await tx.query<PostRow>(READ, [POST_UNDATED])).rows[0]!
      await tx.query(`select public.release_post_for_publish($1, null)`, [POST_UNDATED])
      const after = (await tx.query<PostRow>(READ, [POST_UNDATED])).rows[0]!
      return { cleared, after }
    })
    expect(got.cleared).toMatchObject({ status: 'approved', approved_by: OWNER_A })
    expect(got.after.status).toBe('scheduled')
    expect(got.after.approved_by).toBe(OWNER_A)
    expect(iso(got.after.approved_at)).toBe(iso(got.cleared.approved_at))
  })

  it('an approver’s clearance survives an editor’s later release', async () => {
    // Two sessions, two people: the approver clears, the editor releases.
    // Committed on purpose so the second session can see the first; undone below.
    await db.exec('begin')
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: APPROVER_A, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    await db.query(`select public.approve_posts($1)`, [[POST_UNDATED]])
    await db.exec('commit')
    const cleared = await post(POST_UNDATED)
    expect(cleared).toMatchObject({ status: 'approved', approved_by: APPROVER_A })

    const after = await asMember(db, EDITOR_A, async (tx) => {
      await tx.query(`select public.release_post_for_publish($1, null)`, [POST_UNDATED])
      return (await tx.query<PostRow>(READ, [POST_UNDATED])).rows[0]!
    })
    expect(after).toMatchObject({ status: 'scheduled', approved_by: APPROVER_A })
    expect(iso(after.approved_at)).toBe(iso(cleared.approved_at))

    // Put the seed back for the tests that follow (superuser, so no guard).
    await db.query(
      `update posts set status = 'draft', approved_by = null, approved_at = null where id = $1`,
      [POST_UNDATED],
    )
    expect(await post(POST_UNDATED)).toMatchObject({ status: 'draft', approved_by: null })
  })

  it('reschedule_post records the caller as approver too', async () => {
    const got = await asMember(db, OWNER_A, async (tx) => {
      await tx.query(`select public.reschedule_post($1, now() + interval '4 days')`, [POST_DATED])
      return (await tx.query<PostRow>(READ, [POST_DATED])).rows[0]!
    })
    expect(got).toMatchObject({ status: 'scheduled', approved_by: OWNER_A })
    expect(iso(got.approved_at)).not.toBeNull()
  })

  // ── the guard does not see the publisher ─────────────────────────────────

  it('the postgres role (the publisher’s pool) writes any status and any approval', async () => {
    await db.exec('begin')
    try {
      for (const status of ['scheduled', 'publishing', 'published', 'partial', 'failed', 'draft']) {
        await db.query(`update posts set status = $2 where id = $1`, [POST_UNDATED, status])
        expect((await post(POST_UNDATED)).status).toBe(status)
      }
      await db.query(`update posts set approved_by = 'svc', approved_at = now() where id = $1`, [
        POST_UNDATED,
      ])
      expect((await post(POST_UNDATED)).approved_by).toBe('svc')
    } finally {
      await db.exec('rollback')
    }
  })

  // ── the backfill ──────────────────────────────────────────────────────────

  it('the backfill turns approved + dated into scheduled, and leaves approved + undated alone', async () => {
    await db.exec('begin')
    try {
      const dated = '44444444-4444-4444-8444-444444444441'
      const undated = '44444444-4444-4444-8444-444444444442'
      await db.query(
        `insert into posts (id, workspace_id, title, status, scheduled_at) values
           ($1, $3, 'old approved dated',   'approved', now() + interval '1 day'),
           ($2, $3, 'old approved undated', 'approved', null)`,
        [dated, undated, WS_A],
      )
      // The exact statement 20260906190000 §6 runs.
      const first = await db.query(
        `update public.posts set status = 'scheduled' where status = 'approved' and scheduled_at is not null`,
      )
      expect(first.affectedRows).toBe(1)
      expect((await post(dated)).status).toBe('scheduled')
      expect((await post(undated)).status).toBe('approved')
      // Idempotent: a second run matches nothing.
      const second = await db.query(
        `update public.posts set status = 'scheduled' where status = 'approved' and scheduled_at is not null`,
      )
      expect(second.affectedRows).toBe(0)
    } finally {
      await db.exec('rollback')
    }
  })
})
