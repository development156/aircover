import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * `public.workspace_storage_bytes`, EXECUTED against real Postgres.
 *
 * The function is the read behind the Storage panel and behind the refusal that
 * stops an upload crossing 1 GB. Both of those are claims made to a customer about
 * their own files, so the sum is asserted here on rows this file inserts, rather
 * than reasoned about from the SQL.
 *
 * ── THE FOUR CASES THAT MAKE IT NOT-A-SUM ────────────────────────────────────
 * Two tables hold rows that point at bytes another table already counted, and a
 * naive `union all` double-counts both. A trashed asset still occupies the bucket.
 * A knowledge row with no file stored nothing. Each has a test below, because each
 * is a number a person would otherwise dispute — and be right to.
 *
 * ── WHAT CANNOT RUN HERE ─────────────────────────────────────────────────────
 * The membership refusal is asserted as the FUNCTION's own check (a non-member
 * raises 42501), not as PostgREST's grant boundary. `revoke all … grant execute to
 * authenticated` is a property of the grants and is asserted separately below.
 */

let db: PGlite

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const MEMBER = 'user_member'
const STRANGER = 'user_stranger'

/** Insert as the superuser, so RLS never silently swallows a fixture. */
async function seed(sql: string, params: unknown[] = []): Promise<void> {
  await db.query(sql, params)
}

async function usageAs(sub: string, workspaceId: string): Promise<bigint | Error> {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'authenticated' }),
    ])
    await db.exec('set local role authenticated')
    const result = await db.query<{ bytes: string }>(
      'select public.workspace_storage_bytes($1) as bytes',
      [workspaceId],
    )
    await db.exec('reset role')
    return BigInt(result.rows[0]!.bytes)
  } catch (error) {
    return error as Error
  } finally {
    await db.exec('rollback')
  }
}

/**
 * The same call, typed as a NUMBER, for the tests that do arithmetic on it.
 * `usageAs` returns `bigint | Error` because the membership test needs the error;
 * every other test wants to add to the figure, and `bigint | Error` cannot be
 * added to. Throwing here rather than casting means an unexpected refusal fails
 * the test that hit it instead of being silently coerced.
 */
async function bytesFor(sub: string, workspaceId: string): Promise<bigint> {
  const result = await usageAs(sub, workspaceId)
  if (result instanceof Error) throw result
  return result
}

beforeAll(async () => {
  db = await bootFullSchema()

  for (const { id, name } of [
    { id: WS, name: 'Chai House' },
    { id: OTHER_WS, name: 'Someone Else' },
  ]) {
    await seed(
      `insert into workspaces (id, name, slug, created_by) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [id, name, `slug-${id.slice(0, 8)}`, MEMBER],
    )
  }
  await seed(
    `insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')
     on conflict do nothing`,
    [WS, MEMBER],
  )
}, 60_000)

describe('workspace_storage_bytes', () => {
  it('an empty workspace is zero, not null', async () => {
    // `coalesce` on every branch AND on the total. A null reaching the app would
    // render as an empty meter, which reads as "we have no idea" rather than "you
    // have used nothing" — two different sentences the panel keeps apart.
    expect(await bytesFor(MEMBER, WS)).toBe(0n)
  })

  it('adds up the library, the crops made from it, direct uploads and knowledge PDFs', async () => {
    const ASSET = '33333333-3333-4333-8333-333333333333'
    const POST = '44444444-4444-4444-8444-444444444444'

    await seed(
      `insert into assets (id, workspace_id, storage_path, kind, mime, bytes, title, created_by)
       values ($1, $2, 'ws/a.png', 'image', 'image/png', 100000, 'A', $3)`,
      [ASSET, WS, MEMBER],
    )
    await seed(
      `insert into asset_derivatives
         (workspace_id, asset_id, storage_path, recipe,
          crop_x, crop_y, crop_w, crop_h, mime, bytes, width, height)
       values ($1, $2, $3, 'crop:1x1',
               0, 0, 100, 100, 'image/jpeg', 20000, 100, 100)`,
      // The path must start with the workspace id: `asset_derivatives_path_scoped`
      // is the database repeating what `media-path.ts` refuses, so a writer that
      // bypasses that module is still caught.
      [WS, ASSET, `${WS}/derivatives/${ASSET}/c.jpg`],
    )
    await seed(
      `insert into posts (id, workspace_id, title, status, channels, created_by)
       values ($1, $2, 'P', 'draft', array['x'], $3)`,
      [POST, WS, MEMBER],
    )
    // A DIRECT upload: no asset_id, so its bytes exist nowhere else.
    await seed(
      `insert into post_media (workspace_id, post_id, storage_path, mime, bytes)
       values ($1, $2, 'ws/direct.png', 'image/png', 5000)`,
      [WS, POST],
    )
    await seed(
      `insert into knowledge_documents
         (workspace_id, title, source_kind, source_ref, storage_path, mime, bytes, status)
       values ($1, 'Rate card', 'pdf', 'rates.pdf', 'ws/knowledge/k.pdf', 'application/pdf', 300000, 'indexed')`,
      [WS],
    )

    expect(await bytesFor(MEMBER, WS)).toBe(425_000n)
  })

  it('does NOT double-count a library asset attached to a post', async () => {
    // `attachAssetToPost` writes a post_media row pointing at the SAME object —
    // "THE BYTES ARE NOT COPIED". Counting it would tell a customer that using a
    // photo twice costs twice the space, and the meter would climb as they worked
    // without a single new file arriving.
    const before = await bytesFor(MEMBER, WS)
    const ASSET = (
      await db.query<{ id: string }>('select id from assets where workspace_id = $1 limit 1', [WS])
    ).rows[0]!.id
    const POST = (
      await db.query<{ id: string }>('select id from posts where workspace_id = $1 limit 1', [WS])
    ).rows[0]!.id

    await seed(
      `insert into post_media (workspace_id, post_id, asset_id, storage_path, mime, bytes)
       values ($1, $2, $3, 'ws/a.png', 'image/png', 100000)`,
      [WS, POST, ASSET],
    )

    expect(await bytesFor(MEMBER, WS)).toBe(before)
  })

  it('does NOT count a knowledge document that stored no file', async () => {
    // The url and text doors keep their text in a column and put nothing in a
    // bucket. `bytes` there describes characters, not storage.
    const before = await bytesFor(MEMBER, WS)

    await seed(
      `insert into knowledge_documents
         (workspace_id, title, source_kind, source_ref, storage_path, bytes, status)
       values ($1, 'Typed in', 'text', 'typed', null, 9999, 'indexed')`,
      [WS],
    )

    expect(await bytesFor(MEMBER, WS)).toBe(before)
  })

  it('COUNTS a trashed asset, because trashing removes no bytes', async () => {
    // The single most disputable number on the panel. `deleted_at` is a tombstone;
    // the object stays. A quota that ignored it would report a workspace empty and
    // then refuse its next upload.
    const before = await bytesFor(MEMBER, WS)

    await seed(
      `insert into assets (workspace_id, storage_path, kind, mime, bytes, title, created_by, deleted_at)
       values ($1, 'ws/trashed.png', 'image', 'image/png', 70000, 'Trashed', $2, now())`,
      [WS, MEMBER],
    )

    expect(await bytesFor(MEMBER, WS)).toBe(before + 70_000n)
  })

  it('counts only the workspace it was asked about', async () => {
    await seed(
      `insert into assets (workspace_id, storage_path, kind, mime, bytes, title, created_by)
       values ($1, 'other/a.png', 'image', 'image/png', 500000, 'Theirs', $2)`,
      [OTHER_WS, STRANGER],
    )
    await seed(
      `insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')
       on conflict do nothing`,
      [OTHER_WS, STRANGER],
    )

    const mine = await bytesFor(MEMBER, WS)
    const theirs = await bytesFor(STRANGER, OTHER_WS)

    expect(theirs).toBe(500_000n)
    expect(mine).not.toBe(theirs)
  })

  it('refuses a caller who is not a member', async () => {
    // The function reads PAST row-level security, so this predicate IS the tenant
    // boundary. Returning 0 for a stranger would leak nothing but would also make
    // the refusal indistinguishable from an empty workspace.
    const result = await usageAs(STRANGER, WS)

    expect(result).toBeInstanceOf(Error)
    expect(String(result)).toMatch(/not a member of this workspace/)
  })

  it('is executable by authenticated and revoked from public', async () => {
    const grants = await db.query<{ grantee: string }>(
      `select grantee from information_schema.role_routine_grants
        where routine_name = 'workspace_storage_bytes' and privilege_type = 'EXECUTE'`,
    )
    const grantees = grants.rows.map((row) => row.grantee)

    expect(grantees).toContain('authenticated')
    expect(grantees).not.toContain('PUBLIC')
  })
})
