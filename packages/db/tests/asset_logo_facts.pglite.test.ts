import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * `asset_logo_facts` — the one-row-per-file record of what Sahoda learned about a
 * logo image, its tenancy key and its shape constraints, EXECUTED against real
 * Postgres.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * `20260831120000_asset_logo_facts.sql` stores the alpha/transparency flags, the
 * trim box, the ink polarity and the shape class of a logo file. Several things
 * can go quietly wrong: a row could name an asset in ANOTHER workspace (the
 * composite foreign key must refuse it), the `on delete cascade` could be wired
 * so the facts outlive the file or so deleting the file takes the WORKSPACE with
 * it, the trim box could be stored half-present (a lie the render code would
 * trust), and the two enums could accept a value the render code cannot handle.
 * This file runs each of those against real Postgres, not just checks a
 * constraint exists.
 *
 * ── A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD ───────────────────────────────
 * The cross-tenant refusal (claim 2) and the cascade-delete claim (claim 3) were
 * each run once against a deliberately broken copy of the migration and confirmed
 * RED before the migration was restored byte-identically. The exact assertion
 * text each printed when red is recorded in the handoff.
 *
 * ── WHAT THIS CANNOT PROVE ────────────────────────────────────────────────────
 * PGlite connects as superuser, so RLS is CREATED here and NOT enforced: this
 * file does not prove tenant ISOLATION at the RLS layer, only the CONSTRAINTS.
 * The RLS boundary is proved separately, from an anon-key client carrying a
 * minted member token, elsewhere in this repo. The cross-tenant refusal below is
 * the composite foreign KEY refusing a pair that does not exist, which is a
 * structural fact and holds for superuser and member alike.
 */

const MIGRATIONS = [
  ...CONTENT_FOUNDATION,
  '20260819000400_assets.sql',
  '20260831120000_asset_logo_facts.sql',
] as const

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'

/** A shape the migration accepts, so each test overrides only what it probes. */
type FactsOverrides = {
  asset_id: string
  workspace_id?: string
  has_alpha?: boolean
  transparent_background?: boolean
  trim_x?: number | null
  trim_y?: number | null
  trim_width?: number | null
  trim_height?: number | null
  ink_polarity?: string
  shape_class?: string
}

describe('asset_logo_facts (real Postgres, in-process)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema(MIGRATIONS)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.exec(`
      delete from asset_logo_facts;
      delete from assets;
      delete from workspaces;
    `)
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa'), ($2, 'Other', 'other', 'user_other')`,
      [WS, OTHER_WS],
    )
  })

  async function newAsset(workspace = WS): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into assets (workspace_id, storage_path, kind, mime, width, height)
       values ($1, $2, 'image', 'image/png', 512, 512) returning id`,
      [workspace, `${workspace}/assets/${crypto.randomUUID()}.png`],
    )
    return (r.rows[0] as { id: string }).id
  }

  /** Insert a facts row. Returns the raised error, or null when it succeeded. */
  async function insertFacts(
    o: FactsOverrides,
  ): Promise<{ message: string; code: string | undefined } | null> {
    try {
      await db.query(
        `insert into asset_logo_facts
           (asset_id, workspace_id, has_alpha, transparent_background,
            trim_x, trim_y, trim_width, trim_height, ink_polarity, shape_class)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          o.asset_id,
          o.workspace_id ?? WS,
          o.has_alpha ?? true,
          o.transparent_background ?? true,
          o.trim_x === undefined ? 8 : o.trim_x,
          o.trim_y === undefined ? 8 : o.trim_y,
          o.trim_width === undefined ? 400 : o.trim_width,
          o.trim_height === undefined ? 300 : o.trim_height,
          o.ink_polarity ?? 'dark',
          o.shape_class ?? 'wide',
        ],
      )
      return null
    } catch (error) {
      const e = error as { message?: string; code?: string; cause?: { code?: string } }
      return { message: e.message ?? String(error), code: e.code ?? e.cause?.code }
    }
  }

  async function factsCount(assetId: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from asset_logo_facts where asset_id = $1`,
      [assetId],
    )
    return Number((r.rows[0] as { n: string }).n)
  }

  // ── claim 1 · a row can be written for an asset in the same workspace ────────

  describe('a facts row for an in-tenant asset', () => {
    it('is accepted and reads back', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({ asset_id: asset })
      expect(raised).toBeNull()
      expect(await factsCount(asset)).toBe(1)
    })
  })

  // ── claim 2 · a row naming ANOTHER workspace's asset is refused ──────────────

  describe('the composite foreign key keeps a facts row inside its tenant', () => {
    it("refuses a row naming another workspace's asset, by SQLSTATE and message", async () => {
      // The asset lives in OTHER_WS; the row claims it under WS. The single-column
      // reference on the primary key passes (the asset id exists), so the ONLY
      // thing that can refuse this is the composite `(asset_id, workspace_id)` key,
      // for which the pair (their asset, my workspace) does not exist.
      const theirAsset = await newAsset(OTHER_WS)

      const raised = await insertFacts({ asset_id: theirAsset, workspace_id: WS })

      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23503')
      expect(raised?.message).toContain('asset_logo_facts_asset_same_tenant_fk')
    })
  })

  // ── claim 3 · deleting the asset deletes its facts, not the workspace ────────

  describe('on delete cascade from the asset', () => {
    it('a hard delete of the asset removes its facts and leaves the workspace present', async () => {
      const asset = await newAsset(WS)
      expect(await insertFacts({ asset_id: asset })).toBeNull()
      expect(await factsCount(asset)).toBe(1)

      await db.query(`delete from assets where id = $1`, [asset])

      // The facts died with the file.
      expect(await factsCount(asset)).toBe(0)

      // Checked by row count, not by a keyed read: a wrong cascade would delete the
      // WORKSPACE row, and a query keyed on a row that no longer exists must not be
      // mistaken for a passing result. Deleting a file must never delete a tenant.
      const survived = await db.query<{ n: string }>(
        `select count(*)::text as n from workspaces where id = $1`,
        [WS],
      )
      expect(Number((survived.rows[0] as { n: string }).n)).toBe(1)
    })
  })

  // ── claim 4 · the trim box is all four or none ──────────────────────────────

  describe('the trim box is all-or-nothing', () => {
    it('all four trim columns null is accepted: a transparent image has no mark to measure', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({
        asset_id: asset,
        transparent_background: true,
        trim_x: null,
        trim_y: null,
        trim_width: null,
        trim_height: null,
      })
      expect(raised).toBeNull()
      expect(await factsCount(asset)).toBe(1)
    })

    it('a partially-null trim box is refused, so zeros can never stand in for "no box"', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({
        asset_id: asset,
        trim_x: 8,
        trim_y: 8,
        trim_width: 400,
        trim_height: null, // three present, one missing
      })
      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23514')
      expect(raised?.message).toContain('asset_logo_facts_trim_all_or_none')
    })

    it('a zero or negative width is refused: a box with no area is not a box', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({ asset_id: asset, trim_width: 0 })
      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23514')
      expect(raised?.message).toContain('asset_logo_facts_trim_width_positive')
    })
  })

  // ── claim 5 · the two enums refuse a value outside their list ────────────────

  describe('ink_polarity and shape_class are closed sets', () => {
    it('refuses an ink_polarity outside dark/light/mixed', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({ asset_id: asset, ink_polarity: 'greenish' })
      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23514')
      expect(raised?.message).toContain('ink_polarity')
    })

    it('refuses a shape_class outside square/wide/tall', async () => {
      const asset = await newAsset(WS)
      const raised = await insertFacts({ asset_id: asset, shape_class: 'roundish' })
      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23514')
      expect(raised?.message).toContain('shape_class')
    })
  })

  // ── claim 6 · one row per asset ─────────────────────────────────────────────

  describe('the primary key is the asset id', () => {
    it('refuses a second facts row for the same asset', async () => {
      const asset = await newAsset(WS)
      expect(await insertFacts({ asset_id: asset })).toBeNull()

      const raised = await insertFacts({ asset_id: asset, ink_polarity: 'light' })
      expect(raised).not.toBeNull()
      expect(raised?.code).toBe('23505')
      expect(raised?.message).toContain('asset_logo_facts_pkey')
    })
  })
})
