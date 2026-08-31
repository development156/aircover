import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { asMember, bootFullSchema, probe } from './helpers/pglite-tenant'

/**
 * studio_generations / studio_generation_images, WITH RLS ENFORCED.
 *
 * Real Postgres (PGlite), every migration applied, the superuser bit dropped per
 * transaction, so the policies in the migration are the only thing standing
 * between the two tenants. It never skips: no network and no credential are
 * involved, so green here means a policy was actually enforced rather than a
 * suite that declined to run.
 *
 * A third identity, `USER_C`, holds a valid token and belongs to no workspace.
 * It is what proves the policies key on MEMBERSHIP rather than merely on "some
 * other tenant" — a policy that let a stranger read everything would still pass
 * a two-tenant test.
 *
 * ── WHAT THIS FILE GUARDS BEYOND ISOLATION ──────────────────────────────────
 * Two claims in the migration's header are doctrine rather than convenience, and
 * both are asserted here because both are silent when they break:
 *
 *   · A provenance record cannot be edited after it is written. If that stops
 *     being true, "why does this image look like this" stops having a truthful
 *     answer and nothing on any screen looks different.
 *   · Deleting the PICTURE must not delete the RECORD of how it was made. The
 *     record is how a person answers "why did this cost me six credits" after
 *     they have tidied up their library.
 *
 * Those two pull against each other: the second needs the row to change
 * (`asset_id` becomes null) while the first forbids changes. The migration
 * resolves it through `app.block_mutations()`, which permits a change arriving
 * as a knock-on effect of another statement. That resolution is subtle enough
 * that it is worth a test rather than a comment.
 */

const WS_A = '33333333-0000-4000-8000-aaaaaaaaaaaa'
const WS_B = '44444444-0000-4000-8000-bbbbbbbbbbbb'
const USER_A = 'user_gen_a'
const USER_B = 'user_gen_b'
const USER_C = 'user_gen_none'

const SIGNALS_A = JSON.stringify([
  { field: 'palette', certainty: 'confirmed', value: '#1f6feb' },
  { field: 'audience', certainty: 'inferred', value: 'local families' },
])

type Row = { id: string }

/**
 * `probe` returns `{rows}` OR `{denied}`, and the difference is load-bearing: a
 * policy that returns ZERO ROWS and one that REFUSES THE STATEMENT are different
 * behaviours, and RLS on a select is meant to be the first. Flattening them
 * would let a table that started throwing look identical to a table that
 * correctly hid its rows.
 */
function rowsOf<T>(result: { rows: T[] } | { denied: string }, what: string): T[] {
  if ('denied' in result) {
    throw new Error(`${what} was DENIED rather than filtered: ${result.denied}`)
  }
  return result.rows
}

describe('Studio generation provenance RLS (real Postgres, policies enforced)', () => {
  let db: PGlite
  let genA = ''
  let genB = ''
  let assetA = ''
  let imageA = ''

  beforeAll(async () => {
    db = await bootFullSchema()

    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'A', 'gen-a', '${USER_A}'),
        ('${WS_B}', 'B', 'gen-b', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner');
    `)

    const a = await db.query<Row>(
      `insert into studio_generations
         (workspace_id, mode, prompt_given, prompt_sent, provider, model_id, image_tier,
          seed, format_id, channel, width, height, brand_signals, cost_credits, created_by)
       values
         ('${WS_A}', 'on_brand', 'a plate of samosas', 'a plate of samosas, warm light',
          'openrouter', 'some/model', 'draft', 42, 'instagram_post', 'instagram',
          1080, 1080, '${SIGNALS_A}'::jsonb, 6, '${USER_A}')
       returning id`,
    )
    genA = a.rows[0]!.id

    const b = await db.query<Row>(
      `insert into studio_generations (workspace_id, mode, prompt_given)
       values ('${WS_B}', 'explore', 'their idea') returning id`,
    )
    genB = b.rows[0]!.id

    const asset = await db.query<Row>(
      `insert into assets (workspace_id, storage_path, kind, created_by)
       values ('${WS_A}', '${WS_A}/library/generated.png', 'image', '${USER_A}') returning id`,
    )
    assetA = asset.rows[0]!.id

    const img = await db.query<Row>(
      `insert into studio_generation_images
         (workspace_id, generation_id, idx, asset_id, seed, width, height, sha256)
       values ('${WS_A}', '${genA}', 0, '${assetA}', 42, 1080, 1080, '${'a'.repeat(64)}')
       returning id`,
    )
    imageA = img.rows[0]!.id
  })

  describe('a member sees their own workspace and nothing else', () => {
    it('reads its own generations', async () => {
      const rows = rowsOf(
        await asMember(db, USER_A, (tx) => probe<Row>(tx, `select id from studio_generations`)),
        'member reading own generations',
      )
      expect(rows.map((r) => r.id)).toEqual([genA])
    })

    it('cannot see the other tenant generation, and gets zero rows rather than an error', async () => {
      const rows = rowsOf(
        await asMember(db, USER_B, (tx) =>
          probe<Row>(tx, `select id from studio_generations where id = '${genA}'`),
        ),
        'other tenant reading a generation',
      )
      expect(rows).toEqual([])
    })

    it('reads its own produced images and not the other tenant images', async () => {
      const mine = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<Row>(tx, `select id from studio_generation_images`),
        ),
        'member reading own images',
      )
      expect(mine).toHaveLength(1)
      const theirs = rowsOf(
        await asMember(db, USER_B, (tx) =>
          probe<Row>(tx, `select id from studio_generation_images`),
        ),
        'other tenant reading images',
      )
      expect(theirs).toEqual([])
    })

    /**
     * The prompt AS SENT is the most sensitive column here: it carries the
     * customer's brand conditioning folded into their own words. Asserted
     * explicitly so a policy that hid rows but leaked a column would fail.
     */
    it('the other tenant cannot read the prompt that was actually sent', async () => {
      const rows = rowsOf(
        await asMember(db, USER_B, (tx) =>
          probe<{ prompt_sent: string }>(tx, `select prompt_sent from studio_generations`),
        ),
        'other tenant reading prompts',
      )
      expect(rows.map((r) => r.prompt_sent)).not.toContain('a plate of samosas, warm light')
    })
  })

  describe('a valid token belonging to NO workspace reads nothing', () => {
    it('sees no generations at all', async () => {
      const rows = rowsOf(
        await asMember(db, USER_C, (tx) => probe<Row>(tx, `select id from studio_generations`)),
        'stranger reading generations',
      )
      expect(rows).toEqual([])
    })

    it('sees no produced images at all', async () => {
      const rows = rowsOf(
        await asMember(db, USER_C, (tx) =>
          probe<Row>(tx, `select id from studio_generation_images`),
        ),
        'stranger reading images',
      )
      expect(rows).toEqual([])
    })
  })

  describe('writes across a tenant boundary are refused', () => {
    it('cannot INSERT a generation into another workspace', async () => {
      await expect(
        asMember(db, USER_B, (tx) =>
          tx.exec(
            `insert into studio_generations (workspace_id, mode, prompt_given)
             values ('${WS_A}', 'explore', 'planted')`,
          ),
        ),
      ).rejects.toThrow(/row-level security/i)
    })

    it('cannot UPDATE another workspace generation, and silently changes nothing', async () => {
      await asMember(db, USER_B, (tx) =>
        tx.exec(`update studio_generations set prompt_given = 'hijacked' where id = '${genA}'`),
      )
      const after = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<{ prompt_given: string }>(
            tx,
            `select prompt_given from studio_generations where id = '${genA}'`,
          ),
        ),
        'owner re-reading the prompt',
      )
      expect(after[0]!.prompt_given).toBe('a plate of samosas')
    })

    it('cannot DELETE another workspace generation', async () => {
      await asMember(db, USER_B, (tx) =>
        tx.exec(`delete from studio_generations where id = '${genA}'`),
      )
      const still = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<Row>(tx, `select id from studio_generations where id = '${genA}'`),
        ),
        'owner re-reading after a foreign delete',
      )
      expect(still).toHaveLength(1)
    })
  })

  /**
   * The composite foreign key, not a policy. RLS decides who may READ a row; it
   * cannot stop a member of BOTH workspaces from parenting their own image onto
   * the other tenant's generation. The `(generation_id, workspace_id)` pairing
   * can, and that is why it exists.
   */
  describe('the composite key stops a cross-tenant link RLS alone would allow', () => {
    it('refuses an image in workspace B pointing at a generation in workspace A', async () => {
      // `idx: 5`, NOT 0, and that is the whole test. Slide 0 of this generation
      // already exists, so an insert at 0 is rejected by the uniqueness rule and
      // would pass this test with the composite key removed entirely. Measured:
      // weakening the key to `foreign key (generation_id)` left all 17 green
      // until this index changed.
      await expect(
        db.exec(
          `insert into studio_generation_images (workspace_id, generation_id, idx)
           values ('${WS_B}', '${genA}', 5)`,
        ),
      ).rejects.toThrow(/foreign key/i)
    })
  })

  describe('a provenance record cannot be edited once written', () => {
    it('refuses a direct UPDATE by the owner, who is otherwise allowed to write', async () => {
      await expect(
        db.exec(`update studio_generation_images set seed = 99 where id = '${imageA}'`),
      ).rejects.toThrow()
    })

    it('refuses a direct DELETE by the owner', async () => {
      await expect(
        db.exec(`delete from studio_generation_images where id = '${imageA}'`),
      ).rejects.toThrow()
    })

    /** One row per slide per generation, so a retrying writer writes nothing twice. */
    it('refuses a second row for the same slide of the same generation', async () => {
      await expect(
        db.exec(
          `insert into studio_generation_images (workspace_id, generation_id, idx)
           values ('${WS_A}', '${genA}', 0)`,
        ),
      ).rejects.toThrow()
    })
  })

  /**
   * THE ONE THAT MATTERS MOST, and the one the two rules above pull against.
   *
   * Tidying the library must not erase the answer to "why did this cost me six
   * credits". The record survives with `asset_id` blanked, which is a different
   * and honest state: the image was made, and its file is gone.
   */
  describe('deleting the picture keeps the record of how it was made', () => {
    it('blanks asset_id and leaves the provenance row standing', async () => {
      await db.exec(`delete from assets where id = '${assetA}'`)

      const rows = rowsOf(
        await asMember(db, USER_A, (tx) =>
          probe<{ id: string; asset_id: string | null; seed: number }>(
            tx,
            `select id, asset_id, seed from studio_generation_images where id = '${imageA}'`,
          ),
        ),
        'owner reading the image record after deleting the file',
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.asset_id).toBeNull()
      expect(Number(rows[0]!.seed)).toBe(42)
    })
  })

  /**
   * A generation that says it is finished must say WHEN. Enforced in the schema
   * rather than the application, because a 'ready' row with no finish time is a
   * shape every screen would have to defend against forever.
   */
  describe('a settled generation cannot lack a finish time', () => {
    it('refuses ready without finished_at', async () => {
      await expect(
        db.exec(`update studio_generations set status = 'ready' where id = '${genB}'`),
      ).rejects.toThrow()
    })

    it('accepts ready with finished_at', async () => {
      await db.exec(
        `update studio_generations set status = 'ready', finished_at = now() where id = '${genB}'`,
      )
      const rows = await db.query<{ status: string }>(
        `select status from studio_generations where id = '${genB}'`,
      )
      expect(rows.rows[0]!.status).toBe('ready')
    })

    it('refuses a queued row that claims a finish time', async () => {
      await expect(
        db.exec(
          `insert into studio_generations (workspace_id, mode, prompt_given, finished_at)
           values ('${WS_A}', 'explore', 'too early', now())`,
        ),
      ).rejects.toThrow()
    })
  })
})
