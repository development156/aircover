import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * `workspaces.logo_asset_id_dark` — the column and its tenancy trigger,
 * EXECUTED against real Postgres.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * `20260902000000_workspaces_logo_asset_id_dark.sql` repeats the tenancy-trigger
 * shape `20260831090000_workspaces_logo_asset_id.sql` already proved, on a
 * second column. Repeating the shape is not proof the second copy is correct:
 * a trigger built by copy-paste that still checks `new.logo_asset_id` (the
 * light column) rather than `new.logo_asset_id_dark` would silently let a
 * cross-tenant pointer through in the dark column while looking identical on a
 * read. This file runs the same three checks
 * `workspaces_logo_asset_id.pglite.test.ts` runs for the light column, against
 * the dark one, plus the one case that is unique to this migration: setting the
 * dark pointer must never disturb the light one, and vice versa.
 *
 * ── A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD ───────────────────────────────
 * Every test below was run once against `new.logo_asset_id_dark` swapped for
 * `new.logo_asset_id` inside `app.workspaces_logo_dark_same_tenant` (the
 * copy-paste mistake this file exists to catch) and confirmed red before the
 * migration was restored to its applied form. See the PR/handoff for the
 * mutation and the message it printed.
 *
 * ── WHAT THIS CANNOT PROVE ────────────────────────────────────────────────────
 * Same as its sibling file: PGlite connects as superuser, so RLS is created
 * here and not enforced.
 */

const MIGRATIONS = [
  ...CONTENT_FOUNDATION,
  '20260819000400_assets.sql',
  '20260827090000_assets_trash.sql',
  '20260831090000_workspaces_logo_asset_id.sql',
  '20260902000000_workspaces_logo_asset_id_dark.sql',
] as const

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'

describe('workspaces.logo_asset_id_dark (real Postgres, in-process)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema(MIGRATIONS)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.exec(`
      delete from assets;
      delete from workspaces;
    `)
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa'), ($2, 'Other', 'other', 'user_other')`,
      [WS, OTHER_WS],
    )
  })

  async function newAsset(opts: {
    workspace?: string
    deletedAt?: string | null
    createdAt: string
  }): Promise<string> {
    const workspace = opts.workspace ?? WS
    const r = await db.query<{ id: string }>(
      `insert into assets (workspace_id, storage_path, kind, mime, title, deleted_at, created_at)
       values ($1, $2, 'image', 'image/jpeg', 'Logo (dark)', $3, $4) returning id`,
      [
        workspace,
        `${workspace}/assets/${crypto.randomUUID()}.jpg`,
        opts.deletedAt ?? null,
        opts.createdAt,
      ],
    )
    return (r.rows[0] as { id: string }).id
  }

  async function pointers(
    workspace: string,
  ): Promise<{ light: string | null; dark: string | null }> {
    const r = await db.query<{ logo_asset_id: string | null; logo_asset_id_dark: string | null }>(
      `select logo_asset_id, logo_asset_id_dark from workspaces where id = $1`,
      [workspace],
    )
    const row = r.rows[0] as { logo_asset_id: string | null; logo_asset_id_dark: string | null }
    return { light: row.logo_asset_id, dark: row.logo_asset_id_dark }
  }

  // ── no backfill: every workspace starts NULL ────────────────────────────

  it('starts NULL for every workspace: there is no prior signal to reconstruct it from', async () => {
    expect((await pointers(WS)).dark).toBeNull()
    expect((await pointers(OTHER_WS)).dark).toBeNull()
  })

  // ── the tenancy trigger ─────────────────────────────────────────────────

  describe('app.workspaces_logo_dark_same_tenant', () => {
    it("refuses a pointer at another workspace's asset, by message and by SQLSTATE", async () => {
      const theirs = await newAsset({ workspace: OTHER_WS, createdAt: '2026-01-01T00:00:00Z' })

      let raised: { message: string; code: string | undefined } | null = null
      try {
        await db.query(`update workspaces set logo_asset_id_dark = $1 where id = $2`, [theirs, WS])
      } catch (error) {
        const e = error as { message?: string; code?: string; cause?: { code?: string } }
        raised = { message: e.message ?? String(error), code: e.code ?? e.cause?.code }
      }

      expect(raised).not.toBeNull()
      expect(raised?.message).toContain('does not belong to workspace')
      expect(raised?.code).toBe('23514')
    })

    it('lets NULL through: clearing the pointer is always allowed', async () => {
      const mine = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      await db.query(`update workspaces set logo_asset_id_dark = $1 where id = $2`, [mine, WS])
      expect((await pointers(WS)).dark).toBe(mine)

      await db.query(`update workspaces set logo_asset_id_dark = null where id = $1`, [WS])
      expect((await pointers(WS)).dark).toBeNull()
    })

    it('allows pointing at a TRASHED asset in the same workspace: the trigger does not check deleted_at', async () => {
      const trashed = await newAsset({
        createdAt: '2026-01-01T00:00:00Z',
        deletedAt: '2026-01-02T00:00:00Z',
      })
      await db.query(`update workspaces set logo_asset_id_dark = $1 where id = $2`, [trashed, WS])
      expect((await pointers(WS)).dark).toBe(trashed)
    })

    /**
     * ── THE CASE UNIQUE TO A SECOND COLUMN ──────────────────────────────────
     * The light and dark pointers are independent columns with independent
     * triggers. Setting one must never read or write the other; a shared
     * trigger function accidentally reused across both columns would fail
     * this the moment the two point at different assets.
     */
    it('never disturbs the light pointer when the dark one is set, and vice versa', async () => {
      const light = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      const dark = await newAsset({ createdAt: '2026-01-02T00:00:00Z' })

      await db.query(`update workspaces set logo_asset_id = $1 where id = $2`, [light, WS])
      await db.query(`update workspaces set logo_asset_id_dark = $1 where id = $2`, [dark, WS])

      expect(await pointers(WS)).toEqual({ light, dark })
    })
  })

  // ── the hard-delete path ─────────────────────────────────────────────────

  describe('on delete set null', () => {
    it('a hard delete of the chosen dark asset sets the pointer to NULL and leaves the workspace row present', async () => {
      const chosen = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      await db.query(`update workspaces set logo_asset_id_dark = $1 where id = $2`, [chosen, WS])
      expect((await pointers(WS)).dark).toBe(chosen)

      await db.query(`delete from assets where id = $1`, [chosen])

      const survived = await db.query<{ n: string }>(
        `select count(*)::text as n from workspaces where id = $1`,
        [WS],
      )
      expect(Number((survived.rows[0] as { n: string }).n)).toBe(1)
      expect((await pointers(WS)).dark).toBeNull()
    })
  })
})
