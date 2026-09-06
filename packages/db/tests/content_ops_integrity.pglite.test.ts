import type { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { bootFullSchema, asMember, asRole, probe } from './helpers/pglite-tenant'

/**
 * 20260906213000_content_ops_integrity.sql, one section per part of the
 * migration, under RLS, against a real Postgres.
 *
 * ── WHAT THIS PROVES ────────────────────────────────────────────────────────
 *  §1  post_approvals is written by approve / send / return and by nobody else:
 *      a member's direct insert is refused and leaves no row.
 *  §2  post_comments: a member writes as themselves and not as anybody else,
 *      workspace B reads none of A's, only the author deletes, and the only
 *      column an UPDATE may change is deleted_at.
 *  §3  send_post_for_review: draft → review with a `submitted` row; scheduled
 *      → POST_NOT_SUBMITTABLE; viewer → FORBIDDEN_ROLE; a non-member and a
 *      missing id read the same sentence; no JWT → NOT_SIGNED_IN.
 *  §4  return_post_to_draft: review / approved / scheduled → draft keeping the
 *      time and clearing the approver, with a `returned` row carrying the
 *      reason; a blank or over-long reason → REASON_REQUIRED; a variant going
 *      out → POST_ALREADY_GOING_OUT and the row untouched; draft →
 *      POST_NOT_RETURNABLE; viewer → FORBIDDEN_ROLE.
 *  §5  approve_posts records an `approved` row with md5(body).
 *  §6  a published post cannot be deleted (POST_HAS_PUBLISH_EVIDENCE) except
 *      under the erasure's GUC; a draft with a log row is held by the RESTRICT
 *      foreign key; two succeeded log rows never share an idempotency key.
 *  §7  the two new indexes exist.
 *  §8  the scheduled-needs-time repair converts a bad row and the CHECK
 *      refuses a new one.
 *  §9  the channels repair collapses a duplicate and the CHECK refuses a
 *      duplicate and an unknown channel.
 *  §10 reschedule_post carries its NOT EXISTS inside the UPDATE (read out of
 *      the migration text, the way schedule_guard_parity does) and refuses a
 *      post whose variant is publishing.
 *  §11 anon holds EXECUTE on none of the six definer functions.
 *  §12 the media bucket row carries the limit (the harness stubs storage, so
 *      this is the statement applying, not the service enforcing).
 *  §13 trashing the logo clears the workspace's pointer.
 *
 * ── MUTATIONS (each MEASURED red, see the migration's THE PROOF blocks) ─────
 *  §1  apply_tenant_policies in place of the read policy → direct insert accepted
 *  §2  drop `author =` from t_insert → the forged author is accepted
 *  §3  admit 'scheduled' in send's WHERE → the scheduled refusal is accepted
 *  §4  drop the NOT EXISTS from return's UPDATE → the publishing post returns
 *  §6  `old.status in ('nothing')` → the published post deletes
 *  §10 the old `if exists` before the UPDATE → the text assertion goes red
 *  §13 `new.deleted_at is null` → the pointer survives the trash
 */

const MIGRATIONS = resolve(import.meta.dirname, '../supabase/migrations')

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const OWNER_A = 'user_coi_owner_a'
const EDITOR_A = 'user_coi_editor_a'
const APPROVER_A = 'user_coi_approver_a'
const VIEWER_A = 'user_coi_viewer_a'
const OWNER_B = 'user_coi_owner_b'

const P_DRAFT = '33333333-3333-4333-8333-333333333301'
const P_DRAFT_DATED = '33333333-3333-4333-8333-333333333302'
const P_REVIEW = '33333333-3333-4333-8333-333333333303'
const P_APPROVED = '33333333-3333-4333-8333-333333333304'
const P_SCHEDULED = '33333333-3333-4333-8333-333333333305'
const P_PUBLISHED = '33333333-3333-4333-8333-333333333306'
const P_GOING_OUT = '33333333-3333-4333-8333-333333333307'
const P_DRAFT_LOGGED = '33333333-3333-4333-8333-333333333308'
const P_B = '33333333-3333-4333-8333-333333333309'
const MISSING = '99999999-9999-4999-8999-999999999999'
const ASSET_LOGO = '44444444-4444-4444-8444-444444444401'

type PostRow = {
  status: string
  scheduled_at: Date | string | null
  approved_by: string | null
  approved_at: Date | string | null
}
type ApprovalRow = {
  decision: string
  actor: string
  reason: string | null
  body_hash: string | null
}

const READ = `select status, scheduled_at, approved_by, approved_at from posts where id = $1`
const APPROVALS = `select decision, actor, reason, body_hash from post_approvals where post_id = $1 order by created_at`

/** The SENTENCE, not falsiness: a policy denial is affected 0 with no error, a weaker fact. */
function sentence(got: { rows: unknown[] } | { denied: string }): string {
  return 'denied' in got ? got.denied : 'ACCEPTED'
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

/** The body of the LAST definition of `public.<fn>`, as schedule_guard_parity reads it. */
function lastDefinition(fn: string): { file: string; body: string } | null {
  const pattern = new RegExp(
    `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`,
    'gi',
  )
  let found: { file: string; body: string } | null = null
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(resolve(MIGRATIONS, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(sql)) !== null) {
      const open = sql.indexOf('$$', match.index)
      if (open === -1) continue
      const close = sql.indexOf('$$', open + 2)
      if (close === -1) continue
      found = { file, body: sql.slice(open + 2, close) }
    }
  }
  return found
}

describe('content ops integrity (20260906213000)', () => {
  let db: PGlite

  async function post(id: string): Promise<PostRow> {
    return (await db.query<PostRow>(READ, [id])).rows[0]!
  }

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'coi-a', '${OWNER_A}'),
        ('${WS_B}', 'B', 'coi-b', '${OWNER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${OWNER_A}',    'owner'),
        ('${WS_A}', '${EDITOR_A}',   'editor'),
        ('${WS_A}', '${APPROVER_A}', 'approver'),
        ('${WS_A}', '${VIEWER_A}',   'viewer'),
        ('${WS_B}', '${OWNER_B}',    'owner');
      insert into posts (id, workspace_id, title, body, status, channels, scheduled_at, approved_by, approved_at) values
        ('${P_DRAFT}',        '${WS_A}', 'draft',      'hello',  'draft',     '{instagram}', null,                       null,           null),
        ('${P_DRAFT_DATED}',  '${WS_A}', 'dated',      'hello',  'draft',     '{instagram}', now() + interval '1 day',   null,           null),
        ('${P_REVIEW}',       '${WS_A}', 'in review',  'hello',  'review',    '{instagram}', now() + interval '1 day',   null,           null),
        ('${P_APPROVED}',     '${WS_A}', 'cleared',    'hello',  'approved',  '{instagram}', null,                       '${APPROVER_A}', now()),
        ('${P_SCHEDULED}',    '${WS_A}', 'armed',      'hello',  'scheduled', '{instagram}', now() + interval '2 days',  '${OWNER_A}',   now()),
        ('${P_PUBLISHED}',    '${WS_A}', 'live',       'hello',  'published', '{instagram}', now() - interval '1 day',   '${OWNER_A}',   now()),
        ('${P_GOING_OUT}',    '${WS_A}', 'going out',  'hello',  'scheduled', '{instagram}', now() + interval '1 hour',  '${OWNER_A}',   now()),
        ('${P_DRAFT_LOGGED}', '${WS_A}', 'logged',     'hello',  'draft',     '{instagram}', null,                       null,           null),
        ('${P_B}',            '${WS_B}', 'b draft',    'hello',  'draft',     '{instagram}', null,                       null,           null);
      insert into post_variants (workspace_id, post_id, channel, body, publish_status) values
        ('${WS_A}', '${P_PUBLISHED}', 'instagram', 'hello', 'published'),
        ('${WS_A}', '${P_GOING_OUT}', 'instagram', 'hello', 'publishing'),
        ('${WS_A}', '${P_SCHEDULED}', 'instagram', 'hello', 'scheduled');
      insert into post_publish_logs (workspace_id, post_id, channel, status, mode) values
        ('${WS_A}', '${P_PUBLISHED}',    'instagram', 'succeeded', 'live'),
        ('${WS_A}', '${P_DRAFT_LOGGED}', 'instagram', 'failed',    'live');
      insert into assets (id, workspace_id, storage_path, kind, mime, title)
        values ('${ASSET_LOGO}', '${WS_A}', '${WS_A}/logo.png', 'image', 'image/png', 'Logo');
      update workspaces set logo_asset_id = '${ASSET_LOGO}', logo_asset_id_dark = '${ASSET_LOGO}'
       where id = '${WS_A}';
    `)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('baseline: the seed is what the tests assume', async () => {
    expect((await post(P_DRAFT)).status).toBe('draft')
    expect((await post(P_PUBLISHED)).status).toBe('published')
    expect((await post(P_GOING_OUT)).status).toBe('scheduled')
    const n = await db.query<{ n: number }>(`select count(*)::int as n from post_approvals`)
    expect(n.rows[0]!.n).toBe(0)
  })

  // ── §1 post_approvals ─────────────────────────────────────────────────────

  it('§1 REFUSES a member inserting into post_approvals directly, and leaves no row', async () => {
    for (const user of [OWNER_A, APPROVER_A]) {
      const got = await asMember(db, user, (tx) =>
        probe(
          tx,
          `insert into post_approvals (workspace_id, post_id, actor, decision) values ($1, $2, $3, 'approved')`,
          [WS_A, P_DRAFT, user],
        ),
      )
      expect(sentence(got)).toMatch(/row-level security|permission denied/i)
    }
    const n = await db.query<{ n: number }>(`select count(*)::int as n from post_approvals`)
    expect(n.rows[0]!.n).toBe(0)
  })

  it('§1 a member reads their workspace’s rows and cannot edit or delete them', async () => {
    const got = await asMember(db, APPROVER_A, async (tx) => {
      await tx.query(`select public.approve_posts($1)`, [[P_DRAFT]])
      const mine = await probe<ApprovalRow>(tx, APPROVALS, [P_DRAFT])
      const edit = await probe(
        tx,
        `update post_approvals set decision = 'returned' where post_id = $1 returning id`,
        [P_DRAFT],
      )
      const drop = await probe(tx, `delete from post_approvals where post_id = $1 returning id`, [
        P_DRAFT,
      ])
      const still = await probe<ApprovalRow>(tx, APPROVALS, [P_DRAFT])
      return { mine, edit, drop, still }
    })
    expect('rows' in got.mine && got.mine.rows).toHaveLength(1)
    // A denial is either a refusal or zero rows; either way the row is still there.
    expect('rows' in got.edit ? got.edit.rows : []).toHaveLength(0)
    expect('rows' in got.drop ? got.drop.rows : []).toHaveLength(0)
    expect('rows' in got.still && got.still.rows[0]).toMatchObject({ decision: 'approved' })
  })

  // ── §2 post_comments ──────────────────────────────────────────────────────

  it('§2 ACCEPTS a member commenting as themselves', async () => {
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe<{ author: string }>(
        tx,
        `insert into post_comments (workspace_id, post_id, author, body) values ($1, $2, $3, 'looks good') returning author`,
        [WS_A, P_DRAFT, EDITOR_A],
      ),
    )
    expect(sentence(got)).toBe('ACCEPTED')
    expect('rows' in got && got.rows[0]?.author).toBe(EDITOR_A)
  })

  it('§2 REFUSES a member commenting as somebody else', async () => {
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe(
        tx,
        `insert into post_comments (workspace_id, post_id, author, body) values ($1, $2, $3, 'forged')`,
        [WS_A, P_DRAFT, OWNER_A],
      ),
    )
    expect(sentence(got)).toMatch(/row-level security/i)
  })

  it('§2 workspace B reads none of A’s comments; A’s viewer reads them', async () => {
    await db.query(
      `insert into post_comments (workspace_id, post_id, author, body) values ($1, $2, $3, 'seeded')`,
      [WS_A, P_REVIEW, OWNER_A],
    )
    try {
      const b = await asMember(db, OWNER_B, (tx) =>
        probe<{ n: number }>(
          tx,
          `select count(*)::int as n from post_comments where post_id = $1`,
          [P_REVIEW],
        ),
      )
      const v = await asMember(db, VIEWER_A, (tx) =>
        probe<{ n: number }>(
          tx,
          `select count(*)::int as n from post_comments where post_id = $1`,
          [P_REVIEW],
        ),
      )
      expect('rows' in b && b.rows[0]?.n).toBe(0)
      expect('rows' in v && v.rows[0]?.n).toBe(1)
    } finally {
      await db.query(`delete from post_comments where post_id = $1`, [P_REVIEW])
    }
  })

  it('§2 only the author deletes, and an UPDATE may set deleted_at and nothing else', async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into post_comments (workspace_id, post_id, author, body) values ($1, $2, $3, 'mine') returning id`,
        [WS_A, P_REVIEW, EDITOR_A],
      )
    ).rows[0]!.id
    try {
      const other = await asMember(db, OWNER_A, (tx) =>
        probe<{ id: string }>(tx, `delete from post_comments where id = $1 returning id`, [id]),
      )
      expect(sentence(other)).toBe('ACCEPTED')
      expect('rows' in other && other.rows).toHaveLength(0)

      const edit = await asMember(db, EDITOR_A, (tx) =>
        probe(tx, `update post_comments set body = 'rewritten' where id = $1`, [id]),
      )
      expect(sentence(edit)).toContain('COMMENT_IMMUTABLE')

      const hide = await asMember(db, EDITOR_A, (tx) =>
        probe<{ deleted_at: Date }>(
          tx,
          `update post_comments set deleted_at = now() where id = $1 returning deleted_at`,
          [id],
        ),
      )
      expect(sentence(hide)).toBe('ACCEPTED')
      expect('rows' in hide && iso(hide.rows[0]?.deleted_at)).not.toBeNull()

      const own = await asMember(db, EDITOR_A, (tx) =>
        probe<{ id: string }>(tx, `delete from post_comments where id = $1 returning id`, [id]),
      )
      expect('rows' in own && own.rows).toHaveLength(1)
    } finally {
      await db.query(`delete from post_comments where id = $1`, [id])
    }
  })

  // ── §3 send_post_for_review ───────────────────────────────────────────────

  it('§3 editor on a draft → review, with a submitted row', async () => {
    const got = await asMember(db, EDITOR_A, async (tx) => {
      const rpc = await probe<{ status: string }>(
        tx,
        `select status from public.send_post_for_review($1)`,
        [P_DRAFT],
      )
      const after = (await tx.query<PostRow>(READ, [P_DRAFT])).rows[0]!
      const rows = (await tx.query<ApprovalRow>(APPROVALS, [P_DRAFT])).rows
      return { rpc, after, rows }
    })
    expect(sentence(got.rpc)).toBe('ACCEPTED')
    expect('rows' in got.rpc && got.rpc.rows[0]?.status).toBe('review')
    expect(got.after.status).toBe('review')
    expect(got.rows).toEqual([
      { decision: 'submitted', actor: EDITOR_A, reason: null, body_hash: null },
    ])
  })

  it('§3 REFUSES a scheduled post (POST_NOT_SUBMITTABLE) and leaves it untouched', async () => {
    const before = await post(P_SCHEDULED)
    const got = await asMember(db, EDITOR_A, (tx) =>
      probe(tx, `select public.send_post_for_review($1)`, [P_SCHEDULED]),
    )
    expect(sentence(got)).toContain('POST_NOT_SUBMITTABLE')
    expect(await post(P_SCHEDULED)).toEqual(before)
  })

  it('§3 REFUSES the viewer (FORBIDDEN_ROLE)', async () => {
    const got = await asMember(db, VIEWER_A, (tx) =>
      probe(tx, `select public.send_post_for_review($1)`, [P_DRAFT]),
    )
    expect(sentence(got)).toContain('FORBIDDEN_ROLE')
    expect((await post(P_DRAFT)).status).toBe('draft')
  })

  it('§3 a non-member and a missing id read the SAME sentence (no existence oracle)', async () => {
    const got = await asMember(db, OWNER_B, async (tx) => ({
      real: await probe(tx, `select public.send_post_for_review($1)`, [P_DRAFT]),
      missing: await probe(tx, `select public.send_post_for_review($1)`, [MISSING]),
    }))
    expect(sentence(got.real)).toContain('POST_NOT_SUBMITTABLE')
    expect(sentence(got.real)).toBe(sentence(got.missing))
  })

  it('§3 no JWT → NOT_SIGNED_IN; anon → permission denied', async () => {
    const noJwt = await asRole(db, 'authenticated', { role: 'authenticated' }, (tx) =>
      probe(tx, `select public.send_post_for_review($1)`, [P_DRAFT]),
    )
    expect(sentence(noJwt)).toContain('NOT_SIGNED_IN')
    const anon = await asRole(db, 'anon', {}, (tx) =>
      probe(tx, `select public.send_post_for_review($1)`, [P_DRAFT]),
    )
    expect(sentence(anon)).toMatch(/permission denied/i)
  })

  // ── §4 return_post_to_draft ───────────────────────────────────────────────

  for (const [label, id] of [
    ['review', P_REVIEW],
    ['approved', P_APPROVED],
    ['scheduled', P_SCHEDULED],
  ] as const) {
    it(`§4 approver returns a ${label} post → draft, time kept, approver cleared, reason recorded`, async () => {
      const before = await post(id)
      const got = await asMember(db, APPROVER_A, async (tx) => {
        const rpc = await probe<PostRow>(
          tx,
          `select status, scheduled_at, approved_by, approved_at from public.return_post_to_draft($1, $2)`,
          [id, '  Tighten the second line.  '],
        )
        const after = (await tx.query<PostRow>(READ, [id])).rows[0]!
        const rows = (await tx.query<ApprovalRow>(APPROVALS, [id])).rows
        const variants = (
          await tx.query<{ publish_status: string }>(
            `select publish_status from post_variants where post_id = $1`,
            [id],
          )
        ).rows
        return { rpc, after, rows, variants }
      })
      expect(sentence(got.rpc)).toBe('ACCEPTED')
      expect(got.after).toMatchObject({ status: 'draft', approved_by: null, approved_at: null })
      expect(iso(got.after.scheduled_at)).toBe(iso(before.scheduled_at))
      expect(got.rows).toEqual([
        {
          decision: 'returned',
          actor: APPROVER_A,
          reason: 'Tighten the second line.',
          body_hash: null,
        },
      ])
      // A variant that was `scheduled` walks back to pending, as cancel does.
      for (const v of got.variants) expect(v.publish_status).not.toBe('scheduled')
    })
  }

  it('§4 REFUSES a blank, whitespace or over-long reason (REASON_REQUIRED) before anything else', async () => {
    for (const reason of ['', '   ', 'x'.repeat(501)]) {
      const got = await asMember(db, APPROVER_A, (tx) =>
        probe(tx, `select public.return_post_to_draft($1, $2)`, [P_REVIEW, reason]),
      )
      expect(sentence(got)).toContain('REASON_REQUIRED')
    }
    expect((await post(P_REVIEW)).status).toBe('review')
  })

  it('§4 REFUSES a draft (POST_NOT_RETURNABLE) and a viewer (FORBIDDEN_ROLE)', async () => {
    const draft = await asMember(db, APPROVER_A, (tx) =>
      probe(tx, `select public.return_post_to_draft($1, 'why')`, [P_DRAFT]),
    )
    expect(sentence(draft)).toContain('POST_NOT_RETURNABLE')
    const viewer = await asMember(db, VIEWER_A, (tx) =>
      probe(tx, `select public.return_post_to_draft($1, 'why')`, [P_REVIEW]),
    )
    expect(sentence(viewer)).toContain('FORBIDDEN_ROLE')
  })

  it('§4 REFUSES a post whose variant is publishing (POST_ALREADY_GOING_OUT), row untouched', async () => {
    const before = await post(P_GOING_OUT)
    const got = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `select public.return_post_to_draft($1, 'stop')`, [P_GOING_OUT]),
    )
    expect(sentence(got)).toContain('POST_ALREADY_GOING_OUT')
    expect(await post(P_GOING_OUT)).toEqual(before)
    const n = await db.query<{ n: number }>(
      `select count(*)::int as n from post_approvals where post_id = $1`,
      [P_GOING_OUT],
    )
    expect(n.rows[0]!.n).toBe(0)
  })

  // ── §5 approve_posts records the approval ─────────────────────────────────

  it('§5 approve_posts leaves one approved row per moved post, with md5(body)', async () => {
    const got = await asMember(db, APPROVER_A, async (tx) => {
      const moved = (
        await tx.query<{ id: string }>(`select id from public.approve_posts($1)`, [
          [P_DRAFT, P_DRAFT_DATED, P_APPROVED],
        ])
      ).rows
      const rows = (
        await tx.query<ApprovalRow & { post_id: string }>(
          `select post_id, decision, actor, reason, body_hash from post_approvals order by post_id`,
        )
      ).rows
      return { moved, rows }
    })
    expect(got.moved.map((r) => r.id).sort()).toEqual([P_DRAFT, P_DRAFT_DATED].sort())
    expect(got.rows).toEqual([
      {
        post_id: P_DRAFT,
        decision: 'approved',
        actor: APPROVER_A,
        reason: null,
        body_hash: '5d41402abc4b2a76b9719d911017c592',
      },
      {
        post_id: P_DRAFT_DATED,
        decision: 'approved',
        actor: APPROVER_A,
        reason: null,
        body_hash: '5d41402abc4b2a76b9719d911017c592',
      },
    ])
  })

  // ── §6 the publisher's evidence outlives the post ─────────────────────────

  it('§6 REFUSES deleting a published post, as a member and as the owner role', async () => {
    const member = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `delete from posts where id = $1`, [P_PUBLISHED]),
    )
    expect(sentence(member)).toContain('POST_HAS_PUBLISH_EVIDENCE')
    await db.exec('begin')
    try {
      await expect(db.query(`delete from posts where id = $1`, [P_PUBLISHED])).rejects.toThrow(
        /POST_HAS_PUBLISH_EVIDENCE/,
      )
    } finally {
      await db.exec('rollback')
    }
    expect((await post(P_PUBLISHED)).status).toBe('published')
  })

  it('§6 ALLOWS it under the erasure GUC, logs first, exactly as erase_workspace does', async () => {
    await db.exec('begin')
    try {
      await db.query(`select set_config('app.erasing_workspace', $1, true)`, [WS_A])
      await db.query(`delete from post_publish_logs where post_id = $1`, [P_PUBLISHED])
      const gone = await db.query<{ id: string }>(`delete from posts where id = $1 returning id`, [
        P_PUBLISHED,
      ])
      expect(gone.rows).toHaveLength(1)
    } finally {
      await db.exec('rollback')
    }
    expect((await post(P_PUBLISHED)).status).toBe('published')
  })

  it('§6 the GUC for ANOTHER workspace does not open the door', async () => {
    await db.exec('begin')
    try {
      await db.query(`select set_config('app.erasing_workspace', $1, true)`, [WS_B])
      await expect(db.query(`delete from posts where id = $1`, [P_PUBLISHED])).rejects.toThrow(
        /POST_HAS_PUBLISH_EVIDENCE/,
      )
    } finally {
      await db.exec('rollback')
    }
  })

  it('§6 the foreign key RESTRICTS: a draft with a log row cannot be deleted', async () => {
    await db.exec('begin')
    try {
      await expect(db.query(`delete from posts where id = $1`, [P_DRAFT_LOGGED])).rejects.toThrow(
        /foreign key constraint/i,
      )
    } finally {
      await db.exec('rollback')
    }
    const fk = await db.query<{ confdeltype: string }>(
      `select confdeltype from pg_constraint where conname = 'post_publish_logs_post_id_workspace_id_fkey'`,
    )
    expect(fk.rows[0]?.confdeltype).toBe('r')
  })

  it('§6 two SUCCEEDED log rows never share an idempotency key; a failed attempt may repeat it', async () => {
    await db.exec('begin')
    try {
      const one = `insert into post_publish_logs (workspace_id, post_id, channel, status, mode, idempotency_key)
                   values ($1, $2, 'instagram', $3, 'live', 'p:instagram:t')`
      await db.query(one, [WS_A, P_PUBLISHED, 'failed'])
      await db.query(one, [WS_A, P_PUBLISHED, 'succeeded'])
      await expect(db.query(one, [WS_A, P_PUBLISHED, 'succeeded'])).rejects.toThrow(
        /post_publish_logs_idempotency_succeeded_idx/,
      )
    } finally {
      await db.exec('rollback')
    }
  })

  // ── §7 indexes ────────────────────────────────────────────────────────────

  it('§7 the due scan and the per-variant log scan have their indexes', async () => {
    const rows = (
      await db.query<{ indexname: string; indexdef: string }>(
        `select indexname, indexdef from pg_indexes where indexname in ('posts_due_idx', 'post_publish_logs_variant_created_idx') order by 1`,
      )
    ).rows
    expect(rows.map((r) => r.indexname)).toEqual([
      'post_publish_logs_variant_created_idx',
      'posts_due_idx',
    ])
    expect(rows[1]!.indexdef).toMatch(/WHERE .*scheduled_at IS NOT NULL/)
    expect(rows[0]!.indexdef).toMatch(/variant_id, created_at DESC/)
  })

  // ── §8 scheduled needs a time ─────────────────────────────────────────────

  it('§8 the repair converts a scheduled row with no time, and the CHECK refuses a new one', async () => {
    await db.exec('begin')
    try {
      await db.exec(`alter table posts drop constraint posts_scheduled_needs_time`)
      const bad = '55555555-5555-4555-8555-555555555501'
      await db.query(
        `insert into posts (id, workspace_id, title, status) values ($1, $2, 'bad', 'scheduled')`,
        [bad, WS_A],
      )
      // The exact statement 20260906213000 §8 runs.
      const first = await db.query(
        `update public.posts set status = 'draft' where status = 'scheduled' and scheduled_at is null`,
      )
      expect(first.affectedRows).toBe(1)
      expect((await post(bad)).status).toBe('draft')
      expect((await post(P_SCHEDULED)).status).toBe('scheduled')
      const second = await db.query(
        `update public.posts set status = 'draft' where status = 'scheduled' and scheduled_at is null`,
      )
      expect(second.affectedRows).toBe(0)
      await db.exec(
        `alter table posts add constraint posts_scheduled_needs_time check (status <> 'scheduled' or scheduled_at is not null)`,
      )
    } finally {
      await db.exec('rollback')
    }
    await db.exec('begin')
    try {
      await expect(
        db.query(
          `insert into posts (workspace_id, title, status) values ($1, 'armed, no time', 'scheduled')`,
          [WS_A],
        ),
      ).rejects.toThrow(/posts_scheduled_needs_time/)
    } finally {
      await db.exec('rollback')
    }
  })

  // ── §9 channels is a set ──────────────────────────────────────────────────

  it('§9 the repair collapses a duplicate, and the CHECK refuses a duplicate and an unknown channel', async () => {
    await db.exec('begin')
    try {
      await db.exec(`alter table posts drop constraint posts_channels_is_set`)
      const dup = '55555555-5555-4555-8555-555555555502'
      await db.query(
        `insert into posts (id, workspace_id, title, channels) values ($1, $2, 'dup', '{instagram,linkedin,instagram}')`,
        [dup, WS_A],
      )
      // The exact statement 20260906213000 §9 runs.
      const repair = `update public.posts
   set channels = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(channels) as c)
 where cardinality(channels) <> (select count(distinct c) from unnest(channels) as c)`
      const first = await db.query(repair)
      expect(first.affectedRows).toBe(1)
      const after = await db.query<{ channels: string[] }>(
        `select channels from posts where id = $1`,
        [dup],
      )
      expect(after.rows[0]!.channels).toEqual(['instagram', 'linkedin'])
      expect((await db.query(repair)).affectedRows).toBe(0)
      await db.exec(
        `alter table posts add constraint posts_channels_is_set check (app.is_channel_set(channels))`,
      )
    } finally {
      await db.exec('rollback')
    }
    for (const channels of ['{instagram,instagram}', '{tiktok}']) {
      await db.exec('begin')
      try {
        await expect(
          db.query(`insert into posts (workspace_id, title, channels) values ($1, 'bad set', $2)`, [
            WS_A,
            channels,
          ]),
        ).rejects.toThrow(/posts_channels_is_set/)
      } finally {
        await db.exec('rollback')
      }
    }
  })

  // ── §10 reschedule_post ───────────────────────────────────────────────────

  it('§10 reschedule_post carries the in-flight predicate INSIDE the UPDATE, and no `if exists` before it', () => {
    const found = lastDefinition('reschedule_post')
    expect(found).not.toBeNull()
    expect(found!.file).toBe('20260906213000_content_ops_integrity.sql')
    const body = found!.body
    const update = body.search(/\bupdate\s+posts\b/i)
    const notExists = body.search(/\bnot\s+exists\s*\(\s*select\s+1\s+from\s+post_variants\b/i)
    const diagnostics = body.search(/\bget\s+diagnostics\b/i)
    expect(update).toBeGreaterThan(-1)
    expect(notExists).toBeGreaterThan(update)
    expect(diagnostics).toBeGreaterThan(notExists)
    expect(body).not.toMatch(/\bif\s+exists\s*\(/i)
    expect(body).toContain('POST_ALREADY_GOING_OUT')
    // The refusals schedule_guard_parity pins are still the same list, once.
    expect([...body.matchAll(/\bv_status\s+in\s*\(/gi)]).toHaveLength(1)
  })

  it('§10 reschedule_post REFUSES a post whose variant is publishing, and moves a clean one', async () => {
    const before = await post(P_GOING_OUT)
    const refused = await asMember(db, OWNER_A, (tx) =>
      probe(tx, `select public.reschedule_post($1, now() + interval '3 days')`, [P_GOING_OUT]),
    )
    expect(sentence(refused)).toContain('POST_ALREADY_GOING_OUT')
    expect(await post(P_GOING_OUT)).toEqual(before)

    const moved = await asMember(db, EDITOR_A, async (tx) => {
      await tx.query(`select public.reschedule_post($1, now() + interval '3 days')`, [
        P_DRAFT_DATED,
      ])
      return (await tx.query<PostRow>(READ, [P_DRAFT_DATED])).rows[0]!
    })
    expect(moved).toMatchObject({ status: 'scheduled', approved_by: EDITOR_A })
  })

  // ── §11 grants ────────────────────────────────────────────────────────────

  it('§11 anon can execute none of the six; authenticated can execute the three review RPCs', async () => {
    const fns = [
      'public.approve_posts(uuid[])',
      'public.send_post_for_review(uuid)',
      'public.return_post_to_draft(uuid, text)',
      'public.delete_asset(uuid, boolean)',
      'public.erase_workspace(uuid, text)',
      'public.workspace_erasure_preview(uuid)',
    ]
    for (const fn of fns) {
      const r = await db.query<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as auth`,
        [fn],
      )
      expect(r.rows[0]!.anon, `${fn} is executable by anon`).toBe(false)
      expect(r.rows[0]!.auth, `${fn} is not executable by authenticated`).toBe(true)
    }
  })

  // ── §12 storage (the harness stubs storage; INFERRED for the service) ─────

  it('§12 the media bucket row carries the limit and the type list; brand-assets is untouched', async () => {
    const rows = (
      await db.query<{
        id: string
        file_size_limit: string | number | null
        allowed_mime_types: string[] | null
      }>(`select id, file_size_limit, allowed_mime_types from storage.buckets order by id`)
    ).rows
    const media = rows.find((r) => r.id === 'media')!
    const brand = rows.find((r) => r.id === 'brand-assets')!
    expect(Number(media.file_size_limit)).toBe(4_000_000)
    expect(media.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    expect(brand.file_size_limit).toBeNull()
    expect(brand.allowed_mime_types).toBeNull()
  })

  // ── §13 the logo pointer ──────────────────────────────────────────────────

  it('§13 trashing the logo as a member clears both pointers; restoring does not re-point', async () => {
    const got = await asMember(db, EDITOR_A, async (tx) => {
      const trash = await probe(
        tx,
        `update assets set deleted_at = now() where id = $1 returning id`,
        [ASSET_LOGO],
      )
      const after = (
        await tx.query<{ logo_asset_id: string | null; logo_asset_id_dark: string | null }>(
          `select logo_asset_id, logo_asset_id_dark from workspaces where id = $1`,
          [WS_A],
        )
      ).rows[0]!
      await tx.query(`update assets set deleted_at = null where id = $1`, [ASSET_LOGO])
      const restored = (
        await tx.query<{ logo_asset_id: string | null }>(
          `select logo_asset_id from workspaces where id = $1`,
          [WS_A],
        )
      ).rows[0]!
      return { trash, after, restored }
    })
    expect(sentence(got.trash)).toBe('ACCEPTED')
    expect(got.after).toEqual({ logo_asset_id: null, logo_asset_id_dark: null })
    expect(got.restored.logo_asset_id).toBeNull()
    // Rolled back: the seed still points at the logo.
    const seed = await db.query<{ logo_asset_id: string }>(
      `select logo_asset_id from workspaces where id = $1`,
      [WS_A],
    )
    expect(seed.rows[0]!.logo_asset_id).toBe(ASSET_LOGO)
  })
})
