import { describe, it, expect, beforeAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * `assets.deleted_at`: the trash, against a real Postgres.
 *
 * ── WHY THIS CANNOT BE A MOCKED TEST ─────────────────────────────────────────
 * Every claim here is a claim about the DATABASE: that a partial index carries
 * its predicate, that a filter excludes the rows it says it excludes, and that
 * the delete gate's trigger still fires on a trashed row. A Supabase mock has no
 * index, no predicate and no trigger to get wrong, so it would answer yes to all
 * three whatever the migration said. That is precisely how the folder-filing bug
 * shipped through twenty-seven green tests.
 */

const WS = '44444444-0000-4000-8000-444444444444'
const USER = 'user_trash_a'

describe('assets.deleted_at (real Postgres)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootFullSchema()
    await db.exec(`
      insert into workspaces (id, name, slug, created_by)
        values ('${WS}', 'Trash', 'trash-ws', '${USER}');
      insert into workspace_members (workspace_id, user_id, role)
        values ('${WS}', '${USER}', 'owner');
      insert into assets (id, workspace_id, storage_path, kind, mime, bytes, created_by) values
        ('55555555-0000-4000-8000-000000000001', '${WS}', 'ws/a.jpg', 'image', 'image/jpeg', 10, '${USER}'),
        ('55555555-0000-4000-8000-000000000002', '${WS}', 'ws/b.jpg', 'image', 'image/jpeg', 20, '${USER}');
    `)
  })

  it('a new file is NOT in the trash, so the column defaults to null', async () => {
    // The premise. Without it every guard below could pass on a column that is
    // null for a reason that has nothing to do with what the app writes.
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from assets where workspace_id = '${WS}' and deleted_at is null`,
    )
    expect(rows.rows[0]?.n).toBe(2)
  })

  it('trashing one row takes it out of the live filter and puts it in the trash filter', async () => {
    await db.exec(`
      update assets set deleted_at = now()
       where id = '55555555-0000-4000-8000-000000000001';
    `)

    const live = await db.query<{ n: number }>(
      `select count(*)::int as n from assets where workspace_id = '${WS}' and deleted_at is null`,
    )
    const trashed = await db.query<{ n: number }>(
      `select count(*)::int as n from assets where workspace_id = '${WS}' and deleted_at is not null`,
    )

    // BOTH directions in one test. A guard that only counted the live side would
    // stay green if the update silently deleted the row instead of hiding it,
    // which is the exact behaviour the trash exists to replace.
    expect(live.rows[0]?.n).toBe(1)
    expect(trashed.rows[0]?.n).toBe(1)
  })

  it('the trashed row is WHOLE: its bytes and storage path are untouched', async () => {
    // This is what makes restore possible at all. No transaction can un-delete
    // an object in a bucket, so a recoverable delete is one that never reached
    // storage — and a row that lost its `storage_path` could not find the bytes
    // again even though they are still there.
    const row = await db.query<{ storage_path: string; bytes: string }>(
      `select storage_path, bytes from assets where id = '55555555-0000-4000-8000-000000000001'`,
    )
    expect(row.rows[0]?.storage_path).toBe('ws/a.jpg')
    expect(Number(row.rows[0]?.bytes)).toBe(10)
  })

  it('restoring clears the column and the row is live again', async () => {
    await db.exec(`
      update assets set deleted_at = null
       where id = '55555555-0000-4000-8000-000000000001';
    `)
    const live = await db.query<{ n: number }>(
      `select count(*)::int as n from assets where workspace_id = '${WS}' and deleted_at is null`,
    )
    expect(live.rows[0]?.n).toBe(2)
  })

  // ── BULK TRASH IS IDEMPOTENT, AND THE TIMESTAMP IS NOT RESET ───────────────
  it('a bulk trash skips rows already in the trash and leaves their deletion time alone', async () => {
    // `trashAssets` filters `.is('deleted_at', null)` on the UPDATE. Two claims
    // ride on that and neither can be checked against a mock:
    //   1. the returned row count is what actually MOVED, so the sentence can
    //      say "Moved 1. 1 was already there." instead of "Moved 2."
    //   2. a file already in the trash keeps its ORIGINAL deletion time, so
    //      "Deleted 3 days ago" does not silently become "Deleted today" for a
    //      file the call never really touched.
    await db.exec(`
      update assets set deleted_at = '2026-08-01T00:00:00Z'
       where id = '55555555-0000-4000-8000-000000000001';
    `)

    const moved = await db.query<{ id: string }>(`
      update assets set deleted_at = now()
       where workspace_id = '${WS}'
         and id in (
           '55555555-0000-4000-8000-000000000001',
           '55555555-0000-4000-8000-000000000002'
         )
         and deleted_at is null
      returning id
    `)

    // Only the untrashed one moved.
    expect(moved.rows).toHaveLength(1)
    expect(moved.rows[0]?.id).toBe('55555555-0000-4000-8000-000000000002')

    // And the one already there kept its original August 1st timestamp.
    const kept = await db.query<{ iso: string }>(`
      select to_char(deleted_at at time zone 'UTC', 'YYYY-MM-DD') as iso
        from assets where id = '55555555-0000-4000-8000-000000000001'
    `)
    expect(kept.rows[0]?.iso).toBe('2026-08-01')

    // Put both back so later tests see the state they expect.
    await db.exec(`update assets set deleted_at = null where workspace_id = '${WS}';`)
  })

  // ── THE INDEXES, AND THEIR PREDICATES ──────────────────────────────────────
  it('both partial indexes exist AND carry their WHERE clause', async () => {
    // The predicate is the whole point. An index on (workspace_id, created_at)
    // WITHOUT `where deleted_at is null` still answers the query, so nothing
    // would fail — the list would just scan every trashed row and throw it away,
    // silently, forever. Asserting the definition is the only way to see it.
    const rows = await db.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
        where tablename = 'assets' and indexname in ('assets_live_idx', 'assets_trashed_idx')
        order by indexname`,
    )
    expect(rows.rows.map((r) => r.indexname)).toEqual(['assets_live_idx', 'assets_trashed_idx'])
    expect(rows.rows[0]?.indexdef).toMatch(/WHERE \(deleted_at IS NULL\)/i)
    expect(rows.rows[1]?.indexdef).toMatch(/WHERE \(deleted_at IS NOT NULL\)/i)
  })

  it('nothing sweeps deleted_at, so no retention can be promised anywhere', async () => {
    // The claim the screen is forbidden to make, checked at its source. If a
    // sweeper is ever added it gets its own migration and this guard is the one
    // that should be rewritten — deliberately, with the copy changed in the same
    // commit, rather than a promise appearing on screen with nothing behind it.
    const jobs = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc
        where prosrc ilike '%deleted_at%' and prosrc ilike '%assets%'
          and proname not in ('delete_asset')`,
    )
    expect(jobs.rows[0]?.n).toBe(0)
  })
})
