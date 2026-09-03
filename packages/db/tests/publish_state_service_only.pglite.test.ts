import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, probe } from './helpers/pglite-tenant'

/**
 * A member may not write a publish OUTCOME.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 * `app.apply_tenant_policies` gives every member full UPDATE on `posts` and
 * `post_variants`, so `publish_status`, `permalink`, `platform_post_id`,
 * `publish_claimed_at` and `posts.status` could all be set to a publish outcome
 * through PostgREST with no publish having happened. `savePost` refuses `status`
 * and the schedule RPCs say "none of them can mark a post published", but the
 * TABLE did not refuse, so going around the actions was enough. MEASURED
 * 2026-09-02 before 20260902220002: as a member, `update post_variants set
 * publish_status = 'published', permalink = 'https://instagram.com/p/fake'`
 * affected 1 and `update posts set status = 'published'` affected 1.
 *
 * ── WHAT THIS PROVES ────────────────────────────────────────────────────────
 * Under RLS, as owner, editor and viewer of A: every fake outcome is refused
 * with PUBLISH_STATE_SERVICE_ONLY and the row is byte-identical afterwards. And
 * that the guard is NARROW: the exact shape `savePost` / `saveVariant` send still
 * works, a member can still re-draft a failed post, the three SECURITY DEFINER
 * schedule RPCs (release / reschedule / cancel, which write `publish_claimed_at`
 * and `posts.status` from inside a definer body) still work, and the postgres
 * role running the publisher's own statements (apps/jobs/src/publish/store.ts)
 * still claims, marks and releases a variant.
 *
 * Mutation that proves the guard: in 20260902220002, replace
 * `current_user not in ('anon', 'authenticated')` with
 * `current_user not in ('nobody')` in EITHER function. The refusal tests for
 * that table go red. MEASURED 2026-09-03: 12 red for post_variants, 6 red for
 * posts; see the report for the exact counts.
 */

const WS_A = '11111111-1111-4111-8111-111111111111'
const OWNER_A = 'user_pub_owner_a'
const EDITOR_A = 'user_pub_editor_a'
const VIEWER_A = 'user_pub_viewer_a'
const POST_A = '33333333-3333-4333-8333-333333333333'
const VARIANT_A = '44444444-4444-4444-8444-444444444444'
const POST_FAILED = '55555555-5555-4555-8555-555555555555'
const VARIANT_FAILED = '66666666-6666-4666-8666-666666666666'
const POST_SCHED = '77777777-7777-4777-8777-777777777777'
const VARIANT_SCHED = '88888888-8888-4888-8888-888888888888'

const ROLES = [
  ['owner', OWNER_A],
  ['editor', EDITOR_A],
  ['viewer', VIEWER_A],
] as const

type VariantRow = {
  publish_status: string
  permalink: string | null
  platform_post_id: string | null
  publish_claimed_at: string | null
}
type PostRow = { status: string; scheduled_at: string | null }

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

/** The SENTENCE, not falsiness: a policy denial is affected 0 with no error, a weaker fact. */
function sentence(got: { rows: unknown[] } | { denied: string }): string {
  return 'denied' in got ? got.denied : 'ACCEPTED'
}

describe('posts / post_variants: a publish outcome is service-only', () => {
  let db: PGlite

  async function variant(id = VARIANT_A): Promise<VariantRow> {
    return (
      await db.query<VariantRow>(
        `select publish_status, permalink, platform_post_id, publish_claimed_at
           from post_variants where id = $1`,
        [id],
      )
    ).rows[0]!
  }
  async function post(id = POST_A): Promise<PostRow> {
    return (await db.query<PostRow>(`select status, scheduled_at from posts where id = $1`, [id]))
      .rows[0]!
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'pub-a', '${OWNER_A}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',  'owner'),
        ('${WS_A}', '${EDITOR_A}', 'editor'),
        ('${WS_A}', '${VIEWER_A}', 'viewer');
      insert into posts (id, workspace_id, title, status, channels) values
        ('${POST_A}',      '${WS_A}', 'P', 'approved', '{instagram}'),
        ('${POST_FAILED}', '${WS_A}', 'F', 'failed',   '{instagram}'),
        ('${POST_SCHED}',  '${WS_A}', 'S', 'draft',    '{instagram}');
      insert into post_variants (id, workspace_id, post_id, channel, body, publish_status) values
        ('${VARIANT_A}',      '${WS_A}', '${POST_A}',      'instagram', 'hi',   'pending'),
        ('${VARIANT_FAILED}', '${WS_A}', '${POST_FAILED}', 'instagram', 'no',   'failed'),
        ('${VARIANT_SCHED}',  '${WS_A}', '${POST_SCHED}',  'instagram', 'soon', 'pending');
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('baseline: the seed is what the tests assume', async () => {
    expect(await variant()).toEqual({
      publish_status: 'pending',
      permalink: null,
      platform_post_id: null,
      publish_claimed_at: null,
    })
    expect((await post()).status).toBe('approved')
  })

  // ── post_variants: every fake outcome is refused, for every role ──────────

  const variantWrites: ReadonlyArray<[string, string, unknown[]]> = [
    [
      'the whole fake publish (status + permalink + platform_post_id)',
      `update post_variants
          set publish_status = 'published',
              permalink = 'https://instagram.com/p/fake',
              platform_post_id = 'fake123'
        where id = $1`,
      [VARIANT_A],
    ],
    [
      'publish_status = publishing alone',
      `update post_variants set publish_status = 'publishing' where id = $1`,
      [VARIANT_A],
    ],
    [
      'permalink alone',
      `update post_variants set permalink = 'https://instagram.com/p/fake' where id = $1`,
      [VARIANT_A],
    ],
    [
      'platform_post_id alone',
      `update post_variants set platform_post_id = 'fake123' where id = $1`,
      [VARIANT_A],
    ],
    [
      'publish_claimed_at alone (a forged lease)',
      `update post_variants set publish_claimed_at = now() where id = $1`,
      [VARIANT_A],
    ],
  ]

  for (const [role, user] of ROLES) {
    for (const [label, sql, params] of variantWrites) {
      it(`REFUSES the ${role} writing ${label}`, async () => {
        const before = await variant()
        const got = await asMember(db, user, (tx) => probe(tx, sql, params))
        expect(sentence(got)).toContain('PUBLISH_STATE_SERVICE_ONLY')
        expect(await variant()).toEqual(before)
      })
    }
  }

  it('REFUSES a member INSERTING a variant that is already published', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(
        tx,
        `insert into post_variants (workspace_id, post_id, channel, body, publish_status, permalink)
         values ($1, $2, 'facebook', 'born live', 'published', 'https://facebook.com/fake')`,
        [WS_A, POST_A],
      ),
    )
    expect(sentence(got)).toContain('PUBLISH_STATE_SERVICE_ONLY')
  })

  // ── posts: 'publishing' and 'published' are refused, for every role ───────

  for (const [role, user] of ROLES) {
    for (const status of ['published', 'publishing'] as const) {
      it(`REFUSES the ${role} moving posts.status to ${status}`, async () => {
        const before = await post()
        const got = await asMember(db, user, (tx) =>
          probe(tx, `update posts set status = $2 where id = $1`, [POST_A, status]),
        )
        expect(sentence(got)).toContain('PUBLISH_STATE_SERVICE_ONLY')
        expect(await post()).toEqual(before)
      })
    }
  }

  it('REFUSES a member INSERTING a post that is already published', async () => {
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(
        tx,
        `insert into posts (workspace_id, title, status, channels)
         values ($1, 'born live', 'published', '{instagram}')`,
        [WS_A],
      ),
    )
    expect(sentence(got)).toContain('PUBLISH_STATE_SERVICE_ONLY')
  })

  // ── THE GUARD IS NARROW: what a member legitimately does still works ──────

  it('savePost’s shape still works: title, body, status draft→review→approved, channels, scheduled_at', async () => {
    // PostUpdateSchema is exactly these five keys; `status` is sent by the
    // editor only for the pre-publish moves.
    for (const status of ['review', 'approved']) {
      const got = await asMember(db, EDITOR_A, (tx) =>
        probe<{ status: string }>(
          tx,
          `update posts
              set title = 'edited', body = 'edited body', status = $2,
                  channels = '{instagram,facebook}', scheduled_at = now() + interval '1 day'
            where id = $1
            returning status`,
          [POST_A, status],
        ),
      )
      expect(sentence(got)).toBe('ACCEPTED')
      expect('rows' in got && got.rows[0]?.status).toBe(status)
    }
  })

  it('saveVariant’s shape still works: body, extras, is_linked, char_count', async () => {
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe<{ body: string }>(
        tx,
        `update post_variants
            set body = 'rewritten', extras = '{"hashtags":["a"]}'::jsonb,
                is_linked = false, char_count = 9
          where id = $1
          returning body`,
        [VARIANT_A],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows[0]?.body).toBe('rewritten')
  })

  it('a member can still re-draft a FAILED post and reset its failed variant', async () => {
    // `failed` and `expired` are deliberately not locked: they are not a
    // success state, and re-drafting is how a person recovers from one.
    const p = await asMember(db, OWNER_A, (tx) =>
      probe<{ status: string }>(
        tx,
        `update posts set status = 'draft' where id = $1 returning status`,
        [POST_FAILED],
      ),
    )
    expect(sentence(p)).toBe('ACCEPTED')
    const v = await asMember(db, OWNER_A, (tx) =>
      probe<{ publish_status: string }>(
        tx,
        `update post_variants set publish_status = 'pending', last_error = null
          where id = $1 returning publish_status`,
        [VARIANT_FAILED],
      ),
    )
    expect(sentence(v)).toBe('ACCEPTED')
    expect('rows' in v && v.rows[0]?.publish_status).toBe('pending')
  })

  it('the SECURITY DEFINER schedule RPCs still write posts.status and publish_claimed_at', async () => {
    // release → scheduled (the same RPC the web publish route calls first).
    const released = await asMemberCommitting(db, OWNER_A, (tx) =>
      tx.query<{ r: { scheduled_at: string } }>(
        `select public.release_post_for_publish($1, null) as r`,
        [POST_SCHED],
      ),
    )
    expect(typeof released.rows[0]!.r.scheduled_at).toBe('string')
    expect((await post(POST_SCHED)).status).toBe('scheduled')

    // reschedule → still scheduled, new time.
    await asMemberCommitting(db, EDITOR_A, (tx) =>
      tx.query(`select public.reschedule_post($1, now() + interval '2 days')`, [POST_SCHED]),
    )
    expect((await post(POST_SCHED)).status).toBe('scheduled')

    // Put the variant in the state cancel walks back, the way the dispatcher
    // would have (postgres role), so cancel's UPDATE on publish_claimed_at fires
    // the trigger from inside the definer body.
    await db.query(
      `update post_variants set publish_status = 'scheduled', publish_claimed_at = now() where id = $1`,
      [VARIANT_SCHED],
    )
    await asMemberCommitting(db, OWNER_A, (tx) =>
      tx.query(`select public.cancel_scheduled_post($1)`, [POST_SCHED]),
    )
    expect((await post(POST_SCHED)).status).toBe('draft')
    expect(await variant(VARIANT_SCHED)).toMatchObject({
      publish_status: 'pending',
      publish_claimed_at: null,
    })
  })

  it('the postgres role (the publisher’s pool) still claims, marks and releases', async () => {
    // The exact statements apps/jobs/src/publish/store.ts runs over its pool.
    const claimed = await db.query(
      `update post_variants
          set publish_status = 'publishing',
              publish_claimed_at = now()
        where id = $1
          and post_id = $2
          and workspace_id = $3
          and (publish_status in ('pending', 'scheduled', 'failed', 'publishing')
               or (publish_status = 'published' and permalink like 'fixture://%'))
          and (publish_claimed_at is null
               or publish_claimed_at < now() - make_interval(secs => $4::int))`,
      [VARIANT_A, POST_A, WS_A, 600],
    )
    expect(claimed.affectedRows).toBe(1)
    expect((await variant()).publish_status).toBe('publishing')

    await db.query(
      `update post_variants
          set publish_status = 'scheduled', publish_claimed_at = null
        where id = $1 and workspace_id = $2 and publish_status = 'publishing'`,
      [VARIANT_A, WS_A],
    )
    expect(await variant()).toMatchObject({ publish_status: 'scheduled', publish_claimed_at: null })

    await db.query(
      `update post_variants
          set publish_status = $3,
              platform_post_id = coalesce($4, platform_post_id),
              permalink = coalesce($5, permalink),
              last_error = $6,
              publish_claimed_at = null
        where id = $1 and workspace_id = $2`,
      [VARIANT_A, WS_A, 'published', 'ig_123', 'https://instagram.com/p/real', null],
    )
    expect(await variant()).toEqual({
      publish_status: 'published',
      permalink: 'https://instagram.com/p/real',
      platform_post_id: 'ig_123',
      publish_claimed_at: null,
    })

    await db.query(`update posts set status = 'published' where id = $1`, [POST_A])
    expect((await post()).status).toBe('published')
  })

  it('and once it IS published, a member still cannot touch the outcome', async () => {
    // The row now carries a real permalink; rewriting it to another URL is the
    // same class of lie as inventing one.
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(
        tx,
        `update post_variants set permalink = 'https://instagram.com/p/other' where id = $1`,
        [VARIANT_A],
      ),
    )
    expect(sentence(got)).toContain('PUBLISH_STATE_SERVICE_ONLY')
  })
})
