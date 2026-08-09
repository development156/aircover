import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createBackfillStore, DEFAULT_BACKFILL_LIMIT } from './store'

/**
 * The two statements of the platform-id backfill, executed.
 *
 * ── WHY A SEPARATE QUERY AND NOT A WIDER RECONCILE SWEEP ─────────────────────
 * `listUnresolvedPublishes` deliberately requires `v.permalink is null` and
 * `v.publish_status <> 'published'`: it chases publishes that did NOT succeed.
 * Relaxing either would make it re-examine every successful publish forever, and
 * `applyResolution` writes the analytics key — a sweep that re-reads published posts
 * and rewrites their ids is precisely the machinery SL-069 warns about. So this is a
 * second, narrower, bounded statement rather than a widening of that one.
 *
 * ── WHY EXECUTED ─────────────────────────────────────────────────────────────
 * Both properties the caller depends on live in a `where` clause: the selection must
 * exclude fixture rows, and the update must be write-once. A `where` that reads
 * correctly can still be wrong — the publish lease next door was exactly that for
 * weeks. PGlite is Postgres compiled to WASM, in-process. The DDL is the columns
 * these two statements touch; drift from the real table stays the live suite's job.
 */

const DDL = `
  create table post_variants (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    post_id uuid not null,
    channel text not null,
    publish_status text not null default 'pending',
    platform_post_id text,
    permalink text,
    publish_claimed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
`

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'
/** Instagram's real media id: 17 decimal digits, which is NOT 24-hex. */
const IG_MEDIA_ID = '18104441855596739'
const REAL_PERMALINK = 'https://www.instagram.com/p/DbdSNpHDbtj/'
const FIXTURE_PERMALINK = 'fixture://instagram/fixture-65dc1a34-0272'

function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

describe('the platform-id backfill store (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createBackfillStore>

  const insert = async (v: {
    status?: string
    permalink?: string | null
    platformPostId?: string | null
    channel?: string
  }): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `insert into post_variants
         (workspace_id, post_id, channel, publish_status, platform_post_id, permalink)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        WS,
        POST,
        v.channel ?? 'instagram',
        v.status ?? 'published',
        v.platformPostId ?? null,
        v.permalink === undefined ? REAL_PERMALINK : v.permalink,
      ],
    )
    return r.rows[0]!.id
  }

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    store = createBackfillStore({ pool: poolOver(db) })
  })

  afterEach(async () => {
    await db.close()
  })

  describe('selection', () => {
    it('takes a published variant with a real permalink and no platform id', async () => {
      const id = await insert({})
      const rows = await store.listVariantsMissingPlatformId()
      expect(rows.map((r) => r.variantId)).toEqual([id])
      expect(rows[0]!.permalink).toBe(REAL_PERMALINK)
    })

    /**
     * The one that matters most today. Every published variant in production is a
     * fixture, and a fixture never touched the platform — backfilling one would mint
     * an analytics key for a post that does not exist.
     */
    it('never takes a fixture:// permalink', async () => {
      await insert({ permalink: FIXTURE_PERMALINK })
      expect(await store.listVariantsMissingPlatformId()).toEqual([])
    })

    it('never takes a variant that already has a platform id', async () => {
      await insert({ platformPostId: IG_MEDIA_ID })
      expect(await store.listVariantsMissingPlatformId()).toEqual([])
    })

    it('never takes a variant with no permalink', async () => {
      await insert({ permalink: null })
      expect(await store.listVariantsMissingPlatformId()).toEqual([])
    })

    it.each(['pending', 'scheduled', 'failed', 'publishing', 'skipped'])(
      'never takes a variant in %s',
      async (status) => {
        await insert({ status })
        expect(await store.listVariantsMissingPlatformId()).toEqual([])
      },
    )

    it('is bounded by the limit', async () => {
      for (let i = 0; i < 5; i += 1) await insert({})
      const store3 = createBackfillStore({ pool: poolOver(db), limit: 3 })
      expect(await store3.listVariantsMissingPlatformId()).toHaveLength(3)
    })

    it('has a bounded default', () => {
      expect(DEFAULT_BACKFILL_LIMIT).toBeGreaterThan(0)
      expect(DEFAULT_BACKFILL_LIMIT).toBeLessThanOrEqual(100)
    })
  })

  describe('write-once', () => {
    it('writes the platform id when the column is null', async () => {
      const id = await insert({})
      expect(await store.applyPlatformId(id, IG_MEDIA_ID)).toBe(true)

      const r = await db.query<{ platform_post_id: string }>(
        'select platform_post_id from post_variants where id = $1',
        [id],
      )
      expect(r.rows[0]!.platform_post_id).toBe(IG_MEDIA_ID)
    })

    /**
     * The write-once guarantee, executed rather than reviewed. A backfill that can
     * overwrite is a backfill that can corrupt a correct id on a second run.
     */
    it('refuses to overwrite an id that is already there, and says so', async () => {
      const existing = '17998877665544332'
      const id = await insert({ platformPostId: existing })

      expect(await store.applyPlatformId(id, IG_MEDIA_ID)).toBe(false)

      const r = await db.query<{ platform_post_id: string }>(
        'select platform_post_id from post_variants where id = $1',
        [id],
      )
      expect(r.rows[0]!.platform_post_id).toBe(existing)
    })

    it('refuses a 24-hex provider object id rather than storing it', async () => {
      const id = await insert({})
      await expect(store.applyPlatformId(id, '6a6c9771556939203a9bafac')).rejects.toThrow(
        /24-hex provider object id/,
      )

      const r = await db.query<{ platform_post_id: string | null }>(
        'select platform_post_id from post_variants where id = $1',
        [id],
      )
      expect(r.rows[0]!.platform_post_id).toBeNull()
    })
  })
})
