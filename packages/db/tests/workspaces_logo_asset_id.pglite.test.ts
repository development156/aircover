import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * `workspaces.logo_asset_id` — the column, its tenancy trigger and its backfill,
 * EXECUTED against real Postgres.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * `20260831090000_workspaces_logo_asset_id.sql` replaces "the logo is whichever
 * asset is titled Logo" with a real pointer. Three things can go quietly wrong:
 * the backfill can pick the wrong row (wrong workspace, wrong asset, or a
 * trashed one), the tenancy trigger can let a pointer name another workspace's
 * file, and the foreign key's `on delete set null` can be wired backwards so
 * that deleting a file takes the WORKSPACE with it. This file runs each of
 * those, not just checks that the trigger or the index exists.
 *
 * ── A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD ───────────────────────────────
 * The tenancy-guard and hard-delete tests below were each run once against a
 * deliberately broken copy of the migration (see the commit message / handoff
 * for the exact mutations and the messages they printed) and confirmed red
 * before the migration was restored to its applied form.
 *
 * ── WHAT THIS CANNOT PROVE ────────────────────────────────────────────────────
 * PGlite connects as superuser, so RLS is created here and not enforced. Tenant
 * isolation at the RLS layer is proved separately, from an anon-key client
 * carrying a minted member token, elsewhere in this repo. And the backfill
 * statement is copy-run inside this test (see below) rather than run by
 * `bootSchema`, because `bootSchema` applies the migration file before this
 * file's rows exist: it is the same SQL as the migration, not a re-derivation
 * of it, so it proves the statement's LOGIC and not that it is byte-identical
 * to what shipped.
 */

const MIGRATIONS = [
  ...CONTENT_FOUNDATION,
  '20260819000400_assets.sql',
  '20260827090000_assets_trash.sql',
  '20260831090000_workspaces_logo_asset_id.sql',
] as const

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'

/** The migration's own backfill statement, re-run so seeded rows are covered. */
const BACKFILL_SQL = `
  update workspaces w
     set logo_asset_id = (
       select a.id
         from assets a
        where a.workspace_id = w.id
          and a.kind = 'image'
          and a.title = 'Logo'
          and a.deleted_at is null
        order by a.created_at desc
        limit 1
     )
   where w.logo_asset_id is null;
`

describe('workspaces.logo_asset_id (real Postgres, in-process)', () => {
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
    title?: string | null
    kind?: string
    deletedAt?: string | null
    createdAt: string
  }): Promise<string> {
    const workspace = opts.workspace ?? WS
    const title = opts.title === undefined ? 'Logo' : opts.title
    const kind = opts.kind ?? 'image'
    const r = await db.query<{ id: string }>(
      `insert into assets (workspace_id, storage_path, kind, mime, title, deleted_at, created_at)
       values ($1, $2, $3, 'image/jpeg', $4, $5, $6) returning id`,
      [
        workspace,
        `${workspace}/assets/${crypto.randomUUID()}.jpg`,
        kind,
        title,
        opts.deletedAt ?? null,
        opts.createdAt,
      ],
    )
    return (r.rows[0] as { id: string }).id
  }

  async function logoOf(workspace: string): Promise<string | null> {
    const r = await db.query<{ logo_asset_id: string | null }>(
      `select logo_asset_id from workspaces where id = $1`,
      [workspace],
    )
    return (r.rows[0] as { logo_asset_id: string | null }).logo_asset_id
  }

  // ── the backfill ─────────────────────────────────────────────────────────

  describe("the backfill reproduces today's read exactly", () => {
    it('picks the newest LIVE asset titled exactly Logo, ignoring an older one, a trashed one and a differently-titled one', async () => {
      const older = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      const trashedNewer = await newAsset({
        createdAt: '2026-06-01T00:00:00Z',
        deletedAt: '2026-06-02T00:00:00Z',
      })
      const wrongTitleNewer = await newAsset({
        title: 'Cover photo',
        createdAt: '2026-07-01T00:00:00Z',
      })
      const newestLiveLogo = await newAsset({ createdAt: '2026-08-01T00:00:00Z' })
      // Silence unused-var lint without weakening the seed: these three prove
      // absence by NOT being the winner, so their ids are asserted against.
      expect([older, trashedNewer, wrongTitleNewer]).not.toContain(newestLiveLogo)

      await db.exec(BACKFILL_SQL)

      expect(await logoOf(WS)).toBe(newestLiveLogo)
    })

    it("never crosses a tenant: another workspace's newest Logo is not chosen", async () => {
      await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      const theirsNewest = await newAsset({
        workspace: OTHER_WS,
        createdAt: '2026-12-01T00:00:00Z',
      })

      await db.exec(BACKFILL_SQL)

      const mine = await logoOf(WS)
      expect(mine).not.toBeNull()
      expect(mine).not.toBe(theirsNewest)
    })

    it('a workspace with no matching asset stays NULL, the honest "not chosen" answer', async () => {
      await newAsset({ title: 'Not a logo', createdAt: '2026-01-01T00:00:00Z' })
      await newAsset({ kind: 'document', createdAt: '2026-02-01T00:00:00Z' })
      await newAsset({ deletedAt: '2026-02-02T00:00:00Z', createdAt: '2026-02-01T00:00:00Z' })

      await db.exec(BACKFILL_SQL)

      expect(await logoOf(WS)).toBeNull()
    })
  })

  // ── the tenancy trigger ─────────────────────────────────────────────────

  describe('app.workspaces_logo_same_tenant', () => {
    it("refuses a pointer at another workspace's asset, by message and by SQLSTATE", async () => {
      const theirs = await newAsset({ workspace: OTHER_WS, createdAt: '2026-01-01T00:00:00Z' })

      let raised: { message: string; code: string | undefined } | null = null
      try {
        await db.query(`update workspaces set logo_asset_id = $1 where id = $2`, [theirs, WS])
      } catch (error) {
        const e = error as { message?: string; code?: string; cause?: { code?: string } }
        raised = {
          message: e.message ?? String(error),
          code: e.code ?? e.cause?.code,
        }
      }

      expect(raised).not.toBeNull()
      expect(raised?.message).toContain('does not belong to workspace')
      expect(raised?.code).toBe('23514')
    })

    it('lets NULL through: clearing the pointer is always allowed', async () => {
      const mine = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      await db.query(`update workspaces set logo_asset_id = $1 where id = $2`, [mine, WS])
      expect(await logoOf(WS)).toBe(mine)

      await db.query(`update workspaces set logo_asset_id = null where id = $1`, [WS])
      expect(await logoOf(WS)).toBeNull()
    })

    it('allows pointing at a TRASHED asset in the same workspace: the trigger does not check deleted_at', async () => {
      const trashed = await newAsset({
        createdAt: '2026-01-01T00:00:00Z',
        deletedAt: '2026-01-02T00:00:00Z',
      })
      await db.query(`update workspaces set logo_asset_id = $1 where id = $2`, [trashed, WS])
      expect(await logoOf(WS)).toBe(trashed)
    })
  })

  // ── the hard-delete path ─────────────────────────────────────────────────

  describe('on delete set null', () => {
    it('a hard delete of the chosen asset sets the pointer to NULL and leaves the workspace row present', async () => {
      const chosen = await newAsset({ createdAt: '2026-01-01T00:00:00Z' })
      await db.query(`update workspaces set logo_asset_id = $1 where id = $2`, [chosen, WS])
      expect(await logoOf(WS)).toBe(chosen)

      await db.query(`delete from assets where id = $1`, [chosen])

      // Checked FIRST and by row count, not through `logoOf`: a wrong cascade
      // deletes the workspace row itself, and a query keyed on `id = $1` for a
      // row that no longer exists must not be mistaken for a passing NULL read.
      const survived = await db.query<{ n: string }>(
        `select count(*)::text as n from workspaces where id = $1`,
        [WS],
      )
      expect(Number((survived.rows[0] as { n: string }).n)).toBe(1)
      expect(await logoOf(WS)).toBeNull()
    })
  })
})
