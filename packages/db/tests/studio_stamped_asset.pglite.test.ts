import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * `studio_generation_images.stamped_asset_id` — the column, its tenancy trigger
 * and its `on delete set null` behaviour, EXECUTED against real Postgres.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * `20260831150000_studio_stamped_asset.sql` records the logo-stamped copy of a
 * generated image as an ADDITIONAL asset beside the original. Two things can go
 * quietly wrong: the tenancy trigger can let a pointer name another workspace's
 * file, and the foreign key's `on delete set null` can be wired to `cascade`
 * instead so that deleting the stamped copy takes the whole generation record
 * with it. This file runs each of those, not just checks that the trigger or the
 * index exists. The row that must SURVIVE a stamped-asset delete is the one that
 * matters: it is the record of a generation the customer paid for.
 *
 * ── A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD ───────────────────────────────
 * The tenancy-guard and the on-delete tests below were each run once against a
 * deliberately broken copy of the migration (see the handoff for the exact
 * mutations and the messages they printed) and confirmed red before the migration
 * was restored to its applied form.
 *
 * ── WHAT THIS CANNOT PROVE ────────────────────────────────────────────────────
 * PGlite connects as superuser, so RLS is created here and not enforced. This file
 * does NOT prove tenant isolation: the membership policies from the migrations are
 * present but bypassed. RLS enforcement is proved separately, from an anon-key
 * client carrying a minted member token, in `studio-generations-rls.pglite.test.ts`
 * and its neighbours. What this file proves is the column's structural guards: the
 * tenancy TRIGGER (which fires for superuser too) and the foreign key's delete
 * action.
 *
 * ── WHY ROWS ARE WRITTEN WITH stamped_asset_id SET AT INSERT ──────────────────
 * `studio_generation_images` is append-only: `app.block_mutations()` refuses a
 * member UPDATE outright (20260829210000, section 6). So a stamped pointer is set
 * at INSERT time, never by a later UPDATE, and these tests write it that way. The
 * one write that reaches the column afterwards is the FK's own set-null on delete,
 * which arrives as a knock-on statement `block_mutations` permits.
 */

const MIGRATIONS = [
  ...CONTENT_FOUNDATION,
  '20260819000400_assets.sql',
  '20260829210000_studio_generations.sql',
  '20260831150000_studio_stamped_asset.sql',
] as const

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'

describe('studio_generation_images.stamped_asset_id (real Postgres, in-process)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema(MIGRATIONS)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    // Deleting the workspaces cascades to generations, images and assets. That
    // reaches the append-only `studio_generation_images` as a knock-on statement
    // (`pg_trigger_depth() > 1`), which `block_mutations` permits; a direct
    // `delete from studio_generation_images` would be refused, which is the point.
    await db.exec(`delete from workspaces;`)
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values ($1, 'QA', 'qa', 'user_qa'), ($2, 'Other', 'other', 'user_other')`,
      [WS, OTHER_WS],
    )
  })

  /** A picture in the library. Defaults to WS; pass a workspace to make it foreign. */
  async function newAsset(workspace: string = WS): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into assets (workspace_id, storage_path, kind, mime, title)
       values ($1, $2, 'image', 'image/png', 'Generated') returning id`,
      [workspace, `${workspace}/assets/${crypto.randomUUID()}.png`],
    )
    return (r.rows[0] as { id: string }).id
  }

  /** A generation (one press) in WS. */
  async function newGeneration(): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into studio_generations (workspace_id, mode, prompt_given)
       values ($1, 'on_brand', 'a poster') returning id`,
      [WS],
    )
    return (r.rows[0] as { id: string }).id
  }

  /**
   * One generated image, with its original `asset_id` and an optional
   * `stamped_asset_id`, written in a single INSERT (the append-only rule forbids
   * setting the stamp by a later UPDATE).
   */
  async function newImage(opts: {
    generationId: string
    assetId: string
    stampedAssetId?: string | null
  }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into studio_generation_images
         (workspace_id, generation_id, idx, asset_id, stamped_asset_id)
       values ($1, $2, 0, $3, $4) returning id`,
      [WS, opts.generationId, opts.assetId, opts.stampedAssetId ?? null],
    )
    return (r.rows[0] as { id: string }).id
  }

  async function stampedOf(imageId: string): Promise<string | null> {
    const r = await db.query<{ stamped_asset_id: string | null }>(
      `select stamped_asset_id from studio_generation_images where id = $1`,
      [imageId],
    )
    return (r.rows[0] as { stamped_asset_id: string | null }).stamped_asset_id
  }

  // ── claim 1 ────────────────────────────────────────────────────────────────

  it('links a stamped asset in the SAME workspace', async () => {
    const original = await newAsset()
    const stamped = await newAsset()
    const gen = await newGeneration()
    const img = await newImage({ generationId: gen, assetId: original, stampedAssetId: stamped })

    expect(await stampedOf(img)).toBe(stamped)
  })

  // ── claim 2 ────────────────────────────────────────────────────────────────

  it('refuses a stamped asset from ANOTHER workspace, by SQLSTATE and message', async () => {
    const original = await newAsset()
    const theirs = await newAsset(OTHER_WS)
    const gen = await newGeneration()

    let raised: { message: string; code: string | undefined } | null = null
    try {
      await newImage({ generationId: gen, assetId: original, stampedAssetId: theirs })
    } catch (error) {
      const e = error as { message?: string; code?: string; cause?: { code?: string } }
      raised = { message: e.message ?? String(error), code: e.code ?? e.cause?.code }
    }

    expect(raised).not.toBeNull()
    expect(raised?.message).toContain('does not belong to workspace')
    expect(raised?.code).toBe('23514')
  })

  // ── claim 3 ────────────────────────────────────────────────────────────────

  it('a hard delete of the stamped asset nulls the link and LEAVES the image row and its original asset_id intact', async () => {
    const original = await newAsset()
    const stamped = await newAsset()
    const gen = await newGeneration()
    const img = await newImage({ generationId: gen, assetId: original, stampedAssetId: stamped })
    expect(await stampedOf(img)).toBe(stamped)

    await db.query(`delete from assets where id = $1`, [stamped])

    // Checked FIRST and by row count, not through `stampedOf`: a wrong cascade
    // deletes the image row itself, and a query keyed on `id = $1` for a row that
    // no longer exists must not be mistaken for a passing NULL read. This is the
    // assertion that matters: the record of a paid-for generation survives.
    const survived = await db.query<{ n: string }>(
      `select count(*)::text as n from studio_generation_images where id = $1`,
      [img],
    )
    expect(Number((survived.rows[0] as { n: string }).n)).toBe(1)

    // The original picture is untouched: its asset row still exists and asset_id
    // still names it.
    const row = await db.query<{ asset_id: string | null; stamped_asset_id: string | null }>(
      `select asset_id, stamped_asset_id from studio_generation_images where id = $1`,
      [img],
    )
    const r = row.rows[0] as { asset_id: string | null; stamped_asset_id: string | null }
    expect(r.asset_id).toBe(original)
    expect(r.stamped_asset_id).toBeNull()

    const originalStill = await db.query<{ n: string }>(
      `select count(*)::text as n from assets where id = $1`,
      [original],
    )
    expect(Number((originalStill.rows[0] as { n: string }).n)).toBe(1)
  })

  // ── claim 4 ────────────────────────────────────────────────────────────────

  it('accepts NULL, because not every picture is stamped', async () => {
    const original = await newAsset()
    const gen = await newGeneration()
    const img = await newImage({ generationId: gen, assetId: original, stampedAssetId: null })

    expect(await stampedOf(img)).toBeNull()
  })
})
