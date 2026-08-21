import type { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { PostStatusSchema, VariantPublishStatusSchema, decideAssetDelete } from '@sahoda/shared'
import type { PostStatus, VariantPublishStatus } from '@sahoda/shared'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * A5b — the delete guard and the usage record, EXECUTED against real Postgres.
 *
 * ── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
 * The guard exists twice: once in TypeScript (`decideAssetDelete`, so a person
 * gets a sentence) and once in PL/pgSQL (`app.assert_asset_not_in_use`, so every
 * caller has to pass it). Two languages stating one rule is a drift risk, and
 * the ONLY defence is a test that runs both against the same list of statuses.
 * That is the parity block below, and it is why this file imports the shared
 * module rather than restating its verdicts.
 *
 * ── A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD ───────────────────────────────
 * So the delete is actually attempted, against a real scheduled post, and the
 * raised message is read. Asserting that a trigger EXISTS proves nothing about
 * what it does.
 *
 * ── WHAT THIS CANNOT PROVE ───────────────────────────────────────────────────
 * PGlite connects as superuser, so RLS is created here and not enforced. Tenant
 * isolation is proved separately, from an anon-key client carrying a minted
 * member token, in `scripts/assets-cross-tenant.mjs`.
 */

const MIGRATIONS = [
  ...CONTENT_FOUNDATION,
  // `partial` — a post live on one channel and definitively not going out on
  // another. The status the guard is most likely to be written without.
  '20260804000002_post_status_partial.sql',
  '20260819000400_assets.sql',
  '20260820000000_asset_attachments.sql',
  '20260820000100_delete_asset_rpc.sql',
  // A6. The gate is not told about derivatives; it has to keep working BECAUSE
  // of how they are shaped. That claim is what the block at the end of this file
  // executes.
  '20260821000000_asset_derivatives.sql',
] as const

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'

describe('A5b · asset delete gate + usage record (real Postgres, in-process)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema(MIGRATIONS)
  }, 60_000)

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    // Order matters: usages hang off both assets and posts.
    await db.exec(`
      delete from asset_usages;
      delete from post_media;
      delete from asset_derivatives;
      delete from post_variants;
      delete from posts;
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
      `insert into assets (workspace_id, storage_path, kind, mime, bytes, width, height)
       values ($1, $2, 'image', 'image/jpeg', 1000, 800, 600) returning id`,
      [workspace, `${workspace}/assets/${crypto.randomUUID()}.jpg`],
    )
    return (r.rows[0] as { id: string }).id
  }

  async function newPost(
    status: PostStatus,
    title: string | null,
    workspace = WS,
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into posts (workspace_id, title, status) values ($1, $2, $3) returning id`,
      [workspace, title, status],
    )
    return (r.rows[0] as { id: string }).id
  }

  /** Exactly how the composer attaches a library file: one insert, nothing else. */
  async function attach(postId: string, assetId: string, workspace = WS): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into post_media (workspace_id, post_id, asset_id, storage_path, mime, bytes, width, height)
       values ($1, $2, $3, $4, 'image/jpeg', 1000, 800, 600) returning id`,
      [workspace, postId, assetId, `${workspace}/assets/x-${crypto.randomUUID()}.jpg`],
    )
    return (r.rows[0] as { id: string }).id
  }

  async function usageCount(assetId: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from asset_usages where asset_id = $1`,
      [assetId],
    )
    return Number((r.rows[0] as { n: string }).n)
  }

  /** Attempt the delete. Returns the raised message, or null when it succeeded. */
  async function tryDelete(assetId: string): Promise<string | null> {
    try {
      await db.query(`delete from assets where id = $1`, [assetId])
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  // ── the usage record ───────────────────────────────────────────────────────

  describe('asset_usages is maintained by the attachment, not alongside it', () => {
    it('attaching a library file records the usage with no second statement', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      await attach(post, asset)

      const r = await db.query<{ post_id: string; channel: string | null; position: number }>(
        `select post_id, channel, position from asset_usages where asset_id = $1`,
        [asset],
      )
      expect(r.rows).toHaveLength(1)
      expect((r.rows[0] as { post_id: string }).post_id).toBe(post)
      // Null, not an invented channel: `post_media` has no channel column.
      expect((r.rows[0] as { channel: string | null }).channel).toBeNull()
    })

    it('an upload straight onto a post records NO usage — it has no library entry', async () => {
      const post = await newPost('draft', 'A draft')
      await db.query(
        `insert into post_media (workspace_id, post_id, storage_path, mime) values ($1, $2, 'p/x.jpg', 'image/jpeg')`,
        [WS, post],
      )
      const r = await db.query<{ n: string }>(`select count(*)::text as n from asset_usages`)
      expect(Number((r.rows[0] as { n: string }).n)).toBe(0)
    })

    it('detaching removes the usage', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      const mediaId = await attach(post, asset)
      expect(await usageCount(asset)).toBe(1)

      await db.query(`delete from post_media where id = $1`, [mediaId])
      expect(await usageCount(asset)).toBe(0)
    })

    it('one file in two posts is two usages, and detaching one leaves the other', async () => {
      const asset = await newAsset()
      const a = await newPost('draft', 'A')
      const b = await newPost('draft', 'B')
      const mediaA = await attach(a, asset)
      await attach(b, asset)
      expect(await usageCount(asset)).toBe(2)

      await db.query(`delete from post_media where id = $1`, [mediaA])
      expect(await usageCount(asset)).toBe(1)
    })

    it('the same file attached twice to one post does not double-count the usage', async () => {
      // The applied migration's `unique (asset_id, post_id, channel)` does NOT
      // cover this — Postgres treats NULLs as distinct — which is what the
      // partial index in 20260820000000 exists to close.
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      await attach(post, asset)
      await attach(post, asset)
      expect(await usageCount(asset)).toBe(1)
    })

    it('removing one of two attachments of the same file keeps the post using it', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      const first = await attach(post, asset)
      await attach(post, asset)

      await db.query(`delete from post_media where id = $1`, [first])
      // The second attachment is still there, so the post still uses the file.
      expect(await usageCount(asset)).toBe(1)
    })

    it('deleting the post takes its attachments and usages with it', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      await attach(post, asset)

      await db.query(`delete from posts where id = $1`, [post])
      expect(await usageCount(asset)).toBe(0)
    })
  })

  // ── tenant integrity ───────────────────────────────────────────────────────

  describe('a post can never point at another workspace’s file', () => {
    it('the composite foreign key refuses it structurally', async () => {
      const theirAsset = await newAsset(OTHER_WS)
      const myPost = await newPost('draft', 'Mine')

      // Not an RLS check — RLS is bypassed here. This is the KEY refusing a pair
      // that does not exist: (their asset id, my workspace id).
      await expect(attach(myPost, theirAsset, WS)).rejects.toThrow(/foreign key|violates/i)
    })
  })

  // ── the guard ──────────────────────────────────────────────────────────────

  describe('the guard refuses, and says where the file is used', () => {
    it('a scheduled post blocks the delete and is named by TITLE', async () => {
      const asset = await newAsset()
      const post = await newPost('scheduled', 'Diwali offer')
      await attach(post, asset)

      const message = await tryDelete(asset)
      expect(message).not.toBeNull()
      expect(message).toContain('Diwali offer')
      expect(message).toContain('scheduled to go out')
      expect(message).toContain('Remove it from that post first')
      // And the file really is still there.
      const r = await db.query<{ n: string }>(
        `select count(*)::text as n from assets where id = $1`,
        [asset],
      )
      expect(Number((r.rows[0] as { n: string }).n)).toBe(1)
    })

    it('an untitled post is described as untitled, never by its id', async () => {
      const asset = await newAsset()
      const post = await newPost('published', null)
      await attach(post, asset)

      const message = await tryDelete(asset)
      expect(message).toContain('an untitled post')
      expect(message).not.toContain(post)
    })

    it('a whitespace-only title is treated as no title', async () => {
      const asset = await newAsset()
      await attach(await newPost('published', '   '), asset)
      expect(await tryDelete(asset)).toContain('an untitled post')
    })

    it('names three posts and counts the rest', async () => {
      const asset = await newAsset()
      for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
        await attach(await newPost('scheduled', title), asset)
      }
      const message = await tryDelete(asset)
      expect(message).toContain('One')
      expect(message).toContain('5 posts')
      expect(message).toContain('2 more posts')
      expect(message).not.toContain('Five')
    })

    it('a single extra post is counted in the singular', async () => {
      const asset = await newAsset()
      for (const title of ['One', 'Two', 'Three', 'Four']) {
        await attach(await newPost('published', title), asset)
      }
      expect(await tryDelete(asset)).toContain('1 more post')
    })

    it('a variant that is publishing locks a post whose own status does not', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'Half out')
      await attach(post, asset)
      await db.query(
        `insert into post_variants (workspace_id, post_id, channel, body, publish_status)
         values ($1, $2, 'instagram', 'hi', 'published')`,
        [WS, post],
      )

      const message = await tryDelete(asset)
      expect(message).toContain('Half out')
      expect(message).toContain('already published on a channel')
    })

    it('a file nothing uses deletes cleanly', async () => {
      const asset = await newAsset()
      expect(await tryDelete(asset)).toBeNull()
    })

    it('a file used only by a DRAFT is refused by the foreign key until it is detached', async () => {
      // The trigger lets it through — a draft is not committed to anything. The
      // `on delete restrict` foreign key then refuses, because the attachment is
      // still on the post. The server action detaches first; this proves that a
      // caller that does NOT cannot strip a post's photo by accident.
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      const mediaId = await attach(post, asset)

      expect(await tryDelete(asset)).toMatch(/foreign key|violates|still referenced/i)

      await db.query(`delete from post_media where id = $1`, [mediaId])
      expect(await tryDelete(asset)).toBeNull()
    })
  })

  // ── the transactional delete ───────────────────────────────────────────────

  describe('public.delete_asset — the detach cannot outrun the guard', () => {
    /** Call the RPC the way the server action does. Returns the raised message, or the path. */
    async function callDelete(
      assetId: string,
      detach: boolean,
    ): Promise<{ ok: true; path: string | null } | { ok: false; message: string }> {
      try {
        const r = await db.query<{ delete_asset: string | null }>(
          `select public.delete_asset($1, $2) as delete_asset`,
          [assetId, detach],
        )
        return { ok: true, path: (r.rows[0] as { delete_asset: string | null }).delete_asset }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    }

    it('THE HOLE: a locked post keeps its photo, because the detach never runs', async () => {
      // This is the defect the function exists to close. The old three-step
      // apps/web version deleted the post_media row FIRST, using an answer read
      // moments earlier — so a post scheduled in between lost its photo and the
      // trigger then found nothing to refuse. Here the detach is inside the same
      // transaction as the check, so the refusal rolls it back.
      const asset = await newAsset()
      const post = await newPost('scheduled', 'Going out Thursday')
      const mediaId = await attach(post, asset)

      // `detach: true` — the caller consented, which is the DANGEROUS input.
      const result = await callDelete(asset, true)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.message).toContain('Going out Thursday')

      // The attachment survived. Nothing was stripped from the scheduled post.
      const media = await db.query<{ n: string }>(
        `select count(*)::text as n from post_media where id = $1`,
        [mediaId],
      )
      expect(Number((media.rows[0] as { n: string }).n)).toBe(1)

      // And so did the usage record and the file.
      expect(await usageCount(asset)).toBe(1)
      const still = await db.query<{ n: string }>(
        `select count(*)::text as n from assets where id = $1`,
        [asset],
      )
      expect(Number((still.rows[0] as { n: string }).n)).toBe(1)
    })

    it('a mixed set refuses whole — the draft does not lose its photo either', async () => {
      // Partial application is the other half of the same defect: detaching the
      // drafts and then refusing means the person pressed "delete", got a
      // refusal, and silently lost the photo off two other posts.
      const asset = await newAsset()
      const draft = await newPost('draft', 'A draft')
      const scheduled = await newPost('scheduled', 'Going out Thursday')
      await attach(draft, asset)
      await attach(scheduled, asset)

      const result = await callDelete(asset, true)
      expect(result.ok).toBe(false)

      const media = await db.query<{ n: string }>(
        `select count(*)::text as n from post_media where asset_id = $1`,
        [asset],
      )
      expect(Number((media.rows[0] as { n: string }).n)).toBe(2)
    })

    it('an unlocked post detaches and the file goes, returning its storage path', async () => {
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      await attach(post, asset)

      const result = await callDelete(asset, true)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.message)
      expect(result.path).toMatch(/\/assets\//)

      expect(await usageCount(asset)).toBe(0)
      const media = await db.query<{ n: string }>(
        `select count(*)::text as n from post_media where asset_id = $1`,
        [asset],
      )
      expect(Number((media.rows[0] as { n: string }).n)).toBe(0)
    })

    it('WITHOUT consent, an attached file is refused rather than quietly detached', async () => {
      // A caller that forgets to ask cannot detach anything: `p_detach` defaults
      // to false and the foreign key then refuses.
      const asset = await newAsset()
      const post = await newPost('draft', 'A draft')
      await attach(post, asset)

      const result = await callDelete(asset, false)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.message).toMatch(/foreign key|violates|still referenced/i)
      expect(await usageCount(asset)).toBe(1)
    })

    it('a file nothing uses goes on the first call, with or without consent', async () => {
      const asset = await newAsset()
      const result = await callDelete(asset, false)
      expect(result.ok).toBe(true)
    })

    it('a file that is not in the library is refused, and does not say whose it is', async () => {
      const theirs = await newAsset(OTHER_WS)
      // PGlite is superuser so RLS does not apply here — this asserts the
      // MISSING branch's wording, not the tenant boundary. That boundary is
      // proved against the real database, under a member token, in
      // `scripts/assets-live-proof.mjs`.
      const result = await callDelete('00000000-0000-4000-8000-000000000000', false)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.message).toContain('not in your library')
      expect(result.message).not.toContain(theirs)
    })
  })

  // ── parity: the two statements of one rule ─────────────────────────────────

  describe('the SQL guard and the shared decision agree on every status', () => {
    for (const status of PostStatusSchema.options) {
      it(`posts.status = ${status}`, async () => {
        const asset = await newAsset()
        const post = await newPost(status, 'A post')
        const mediaId = await attach(post, asset)

        const sqlRefused = (await tryDelete(asset)) !== null
        // The FK also refuses while the attachment is on the post, so the SQL
        // side is read from the raised message: only the TRIGGER names a post.
        const message = await tryDelete(asset)
        const triggerRefused = message !== null && message.includes('A post')

        const decision = decideAssetDelete([
          { postId: post, postTitle: 'A post', postStatus: status, variantStatuses: [] },
        ])

        expect(sqlRefused).toBe(true) // the FK, regardless
        expect(triggerRefused).toBe(!decision.ok)

        await db.query(`delete from post_media where id = $1`, [mediaId])
      })
    }

    for (const publishStatus of VariantPublishStatusSchema.options) {
      it(`post_variants.publish_status = ${publishStatus}`, async () => {
        const asset = await newAsset()
        const post = await newPost('draft', 'A post')
        const mediaId = await attach(post, asset)
        await db.query(
          `insert into post_variants (workspace_id, post_id, channel, body, publish_status)
           values ($1, $2, 'x', 'hi', $3)`,
          [WS, post, publishStatus],
        )

        const message = await tryDelete(asset)
        const triggerRefused = message !== null && message.includes('A post')

        const decision = decideAssetDelete([
          {
            postId: post,
            postTitle: 'A post',
            postStatus: 'draft',
            variantStatuses: [publishStatus as VariantPublishStatus],
          },
        ])

        expect(triggerRefused).toBe(!decision.ok)
        await db.query(`delete from post_media where id = $1`, [mediaId])
      })
    }
  })

  /** A cropped copy of `assetId`, exactly as `mintCroppedAttachment` writes one. */
  async function newDerivative(assetId: string, workspace = WS): Promise<string> {
    const id = crypto.randomUUID()
    await db.query(
      `insert into asset_derivatives
         (id, workspace_id, asset_id, storage_path, recipe, channels, formats,
          crop_x, crop_y, crop_w, crop_h, focal_x, focal_y, mime, bytes, width, height)
       values ($1, $2, $3, $4, $5, $6, $7, 0, 240, 1080, 1440, 0.5, 0.5, 'image/jpeg', 900, 1080, 1440)`,
      [
        id,
        workspace,
        assetId,
        `${workspace}/derivatives/${assetId}/${id}.jpg`,
        '0-240-1080-1440-jpg-8388608',
        ['instagram'],
        JSON.stringify({ instagram: 'image' }),
      ],
    )
    return id
  }

  /** Attach the CROP: asset_id names the original, derivative_id names the crop. */
  async function attachCrop(
    postId: string,
    assetId: string,
    derivativeId: string,
    workspace = WS,
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into post_media
         (workspace_id, post_id, asset_id, derivative_id, storage_path, mime, bytes, width, height)
       values ($1, $2, $3, $4, $5, 'image/jpeg', 900, 1080, 1440) returning id`,
      [
        workspace,
        postId,
        assetId,
        derivativeId,
        `${workspace}/derivatives/${assetId}/${derivativeId}.jpg`,
      ],
    )
    return (r.rows[0] as { id: string }).id
  }

  // ── A6 · the gate, with a CROP on the post instead of the original ─────────

  describe('the delete gate understands derivatives', () => {
    /**
     * THE DISCRIMINATING TEST, and the reason the table is shaped the way it is.
     *
     * Had a crop been its own `assets` row with `post_media.asset_id` pointing at
     * the CROP, deleting the ORIGINAL would find no `asset_usages` row, the
     * trigger would find nothing to refuse, and a post scheduled for Thursday
     * would lose its photo with nobody told. The refusal below is what proves
     * that door is shut — not the argument, which was also available to the
     * version that had the bug.
     */
    it('refuses to delete an original whose CROP is on a scheduled post, and names it', async () => {
      const asset = await newAsset()
      const derivative = await newDerivative(asset)
      const post = await newPost('scheduled', 'Diwali offer')
      await attachCrop(post, asset, derivative)

      // The usage record was written from the attachment even though the file on
      // the post is the crop — because `asset_id` still names the original.
      expect(await usageCount(asset)).toBe(1)

      const message = await tryDelete(asset)
      expect(message).not.toBeNull()
      expect(message).toContain('Diwali offer')
      expect(message).toContain('scheduled to go out')

      // Nothing was touched: not the asset, not the crop, not the attachment.
      const survived = await db.query<{ n: string }>(
        `select count(*)::text as n from assets where id = $1`,
        [asset],
      )
      expect(Number((survived.rows[0] as { n: string }).n)).toBe(1)
      const crop = await db.query<{ n: string }>(
        `select count(*)::text as n from asset_derivatives where id = $1`,
        [derivative],
      )
      expect(Number((crop.rows[0] as { n: string }).n)).toBe(1)
    })

    it('refuses when a VARIANT is publishing, even with the post row still behind', async () => {
      // The mid-flight window: the dispatcher moves a variant before it settles
      // the parent. A gate reading only the post row would open for exactly the
      // seconds during which the crop's bytes are being read.
      const asset = await newAsset()
      const derivative = await newDerivative(asset)
      const post = await newPost('approved', 'Mid flight')
      await attachCrop(post, asset, derivative)
      await db.query(
        `insert into post_variants (workspace_id, post_id, channel, body, publish_status)
         values ($1, $2, 'instagram', 'x', 'publishing')`,
        [WS, post],
      )

      const message = await tryDelete(asset)
      expect(message).not.toBeNull()
      expect(message).toContain('Mid flight')
    })

    it('lets the original go when only a DRAFT uses the crop, and the crop goes with it', async () => {
      // The control. Without it a gate that refused everything would pass the two
      // tests above while making the delete button permanently broken.
      const asset = await newAsset()
      const derivative = await newDerivative(asset)
      const post = await newPost('draft', 'Still writing')
      const mediaId = await attachCrop(post, asset, derivative)

      // The attachment is detached first, exactly as `delete_asset(p_detach=>true)`
      // does inside its transaction.
      await db.query(`delete from post_media where id = $1`, [mediaId])
      expect(await tryDelete(asset)).toBeNull()

      // The crop CASCADED. A derivative cannot outlive its original.
      const left = await db.query<{ n: string }>(
        `select count(*)::text as n from asset_derivatives where id = $1`,
        [derivative],
      )
      expect(Number((left.rows[0] as { n: string }).n)).toBe(0)
    })

    it('refuses a post_media row that names a crop without naming its original', async () => {
      // THE CHECK THAT KEEPS THE GATE WHOLE. A row like this would be invisible
      // to the trigger — it reads `asset_usages`, which is derived from
      // `asset_id` — so the original could be deleted out from under a scheduled
      // post. It cannot be written at all.
      const asset = await newAsset()
      const derivative = await newDerivative(asset)
      const post = await newPost('scheduled', 'Sneaky')

      let raised: string | null = null
      try {
        await db.query(
          `insert into post_media (workspace_id, post_id, derivative_id, storage_path, mime)
           values ($1, $2, $3, 'p/x.jpg', 'image/jpeg')`,
          [WS, post, derivative],
        )
      } catch (error) {
        raised = error instanceof Error ? error.message : String(error)
      }
      expect(raised).toContain('post_media_derivative_needs_asset')
    })

    it('refuses a crop attached under a DIFFERENT asset than the row names', async () => {
      // The composite foreign key. A row claiming asset A while carrying a crop of
      // asset B would let the gate guard the wrong file: A is locked, B is free,
      // and deleting B strips the post.
      const assetA = await newAsset()
      const assetB = await newAsset()
      const cropOfB = await newDerivative(assetB)
      const post = await newPost('draft', 'Mismatched')

      let raised: string | null = null
      try {
        await attachCrop(post, assetA, cropOfB)
      } catch (error) {
        raised = error instanceof Error ? error.message : String(error)
      }
      expect(raised).not.toBeNull()
      expect(raised).toContain('post_media_derivative_of_asset_fk')
    })

    it('keeps a crop inside its own workspace, by key rather than by convention', async () => {
      const mine = await newAsset(WS)
      let raised: string | null = null
      try {
        // Another tenant's workspace id against my asset. The composite FK to
        // `assets (id, workspace_id)` has no such pair.
        await newDerivative(mine, OTHER_WS)
      } catch (error) {
        raised = error instanceof Error ? error.message : String(error)
      }
      expect(raised).not.toBeNull()
    })
  })
})
