import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

/**
 * THE MARKETING BRAIN'S THREE READERS, EXECUTED AGAINST A REAL POSTGRES.
 *
 * ── WHY A UNIT TEST CANNOT REPLACE THIS ──────────────────────────────────────
 * Each computer's own test file hands it rows and proves the arithmetic. None of
 * them can see the SQL that produces those rows, and the SQL is where the three
 * most consequential decisions in this feature live. Every one of them is a
 * decision that would produce a plausible, confidently wrong number if it were
 * made the obvious way instead:
 *
 *   · `readChannelOutcomes` takes the LATEST snapshot per post per metric.
 *     Production re-reports the same post daily and the value is a running
 *     total, so SUMMING would multiply engagement by how often our cron polled.
 *   · `readFeaturedPosts` collapses a cross-published post to ONE caption.
 *     Counting it once per channel would let a business that cross-posts more
 *     widely dominate its own comparison.
 *   · `readAudienceReadings` reads the `total` bucket only. MEASURED in
 *     production: `gained` and `lost` are zero on every row, so a reader built
 *     on the obvious columns declines forever for an invisible reason.
 *
 * A mocked client would agree with whatever the code did and prove none of the
 * three. So this boots a real Postgres in process from the real migration files
 * and calls the real exported functions, passing the database in through the
 * `Queryable` seam rather than pasting their queries into this file. A copied
 * query proves the copy works.
 *
 * ── WHAT THIS STILL CANNOT SEE ───────────────────────────────────────────────
 * Nothing here proves the readers are called with the right workspace by the
 * weekly pass; `run.test.ts` covers that with mocks. And PGlite is Postgres, but
 * it is not Supabase's Postgres — an extension-dependent behaviour would differ.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '22222222-2222-4222-8222-222222222222'
const USER = 'user_pglite_brain'

/** 24 lowercase hex characters, which is the shape the CHECK demands. */
const ACCOUNT = '6a7f000777555aae01b32ef5'

const post = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`
const variant = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`

describe('the Marketing Brain readers (real Postgres, in-process)', () => {
  let db: PGlite
  let readChannelOutcomes: typeof import('./store').readChannelOutcomes
  let readFeaturedPosts: typeof import('./store').readFeaturedPosts
  let readAudienceReadings: typeof import('./store').readAudienceReadings
  let client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: never[] }> }

  beforeAll(async () => {
    db = await bootFullSchema()
    const store = await import('./store')
    readChannelOutcomes = store.readChannelOutcomes
    readFeaturedPosts = store.readFeaturedPosts
    readAudienceReadings = store.readAudienceReadings
    client = {
      query: (sql: string, params?: unknown[]) =>
        db.query(sql, params as unknown[]) as Promise<{ rows: never[] }>,
    }

    await db.exec(`
      insert into workspaces (id, name, slug, created_by)
      values ('${WS}', 'Brain WS', 'brain-ws', '${USER}'),
             ('${OTHER_WS}', 'Other WS', 'other-ws', '${USER}')
      on conflict (id) do nothing;
    `)
  })

  /**
   * Isolation is a transaction, not a cleanup.
   *
   * `post_metric_snapshots` is APPEND-ONLY — a trigger refuses DELETE outright,
   * which is the third schema fact this file learned by being refused. Rolling
   * back is also the honest choice: a test that had to disable a production
   * guard to tidy up would be proving something about a database nobody runs.
   */
  beforeEach(async () => {
    await db.exec('begin')
  })

  afterEach(async () => {
    await db.exec('rollback')
  })

  /** A second variant of the SAME post, on another channel, as a cross-post makes. */
  async function givenSecondVariant(n: number, channel: string, body: string): Promise<void> {
    await db.query(
      `insert into post_variants (id, workspace_id, post_id, channel, body, publish_status)
       values ($1, $2, $3, $4, $5, 'published')`,
      [variant(n + 500), WS, post(n), channel, body],
    )
  }

  async function givenPost(n: number, body: string): Promise<void> {
    await db.query(
      `insert into posts (id, workspace_id, title, body, status, created_by)
       values ($1, $2, $3, $4, 'published', $5)`,
      [post(n), WS, `Post ${n}`, body, USER],
    )
    await db.query(
      `insert into post_variants (id, workspace_id, post_id, channel, body, publish_status)
       values ($1, $2, $3, 'instagram', $4, 'published')`,
      [variant(n), WS, post(n), body],
    )
  }

  async function givenMetric(
    n: number,
    channel: string,
    metric: string,
    value: number,
    on: string,
  ): Promise<void> {
    await db.query(
      // `measured_on` is GENERATED from `measured_at` and cannot be written.
      // Learned from this test refusing the insert, which a mocked client would
      // have accepted without comment.
      `insert into post_metric_snapshots
         (workspace_id, post_id, channel, metric, value, measured_at)
       values ($1, $2, $3, $4, $5, $6::timestamptz)`,
      [WS, post(n), channel, metric, value, `${on}T12:00:00Z`],
    )
  }

  describe('readChannelOutcomes', () => {
    it('takes the LATEST reading per post, never the sum of a re-reported total', async () => {
      await givenPost(1, 'a caption')
      // The same post re-reported on four days, the value climbing as a running
      // total. Summed this reads 30; the truth is 12.
      for (const [day, value] of [
        ['2026-02-01', 3],
        ['2026-02-02', 6],
        ['2026-02-03', 9],
        ['2026-02-04', 12],
      ] as const) {
        await givenMetric(1, 'instagram', 'engagement', value, day)
        await givenMetric(1, 'instagram', 'reach', 100, day)
      }

      const rows = await readChannelOutcomes(WS, 400, client)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.engagement).toBe(12)
      expect(rows[0]?.reach).toBe(100)
    })

    it('keeps one row per post PER CHANNEL, because that is what it compares', async () => {
      await givenPost(1, 'a caption')
      await givenMetric(1, 'instagram', 'engagement', 2, '2026-02-01')
      await givenMetric(1, 'instagram', 'reach', 100, '2026-02-01')
      await givenMetric(1, 'linkedin', 'engagement', 20, '2026-02-01')
      await givenMetric(1, 'linkedin', 'reach', 100, '2026-02-01')

      const rows = await readChannelOutcomes(WS, 400, client)

      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.channel).sort()).toEqual(['instagram', 'linkedin'])
    })

    it('never serves one workspace another workspace measurements', async () => {
      await givenPost(1, 'a caption')
      await givenMetric(1, 'instagram', 'engagement', 5, '2026-02-01')
      await givenMetric(1, 'instagram', 'reach', 100, '2026-02-01')

      expect(await readChannelOutcomes(OTHER_WS, 400, client)).toEqual([])
    })

    it('ignores a metric it does not know how to use', async () => {
      await givenPost(1, 'a caption')
      await givenMetric(1, 'instagram', 'impressions', 999, '2026-02-01')

      const rows = await readChannelOutcomes(WS, 400, client)

      // A row exists for the post because impressions were filtered out before
      // the pivot, so nothing is left: engagement and reach both stay absent.
      expect(rows).toEqual([])
    })
  })

  describe('readFeaturedPosts', () => {
    it('collapses a cross-published post to ONE caption and adds up what it earned', async () => {
      await givenPost(1, 'the caption')
      // TWO VARIANTS of one post, which is what a cross-post actually is. The
      // second one is the whole point: without it `distinct on (p.id)` has
      // nothing to collapse and the guard is untested. Verified by mutation —
      // removing the distinct turns this red only when this line is here.
      await givenSecondVariant(1, 'linkedin', 'the caption, trimmed')
      await givenMetric(1, 'instagram', 'engagement', 2, '2026-02-01')
      await givenMetric(1, 'instagram', 'reach', 100, '2026-02-01')
      await givenMetric(1, 'linkedin', 'engagement', 8, '2026-02-01')
      await givenMetric(1, 'linkedin', 'reach', 400, '2026-02-01')

      const rows = await readFeaturedPosts(WS, 400, client)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.body).toBe('the caption')
      expect(rows[0]?.engagement).toBe(10)
      expect(rows[0]?.reach).toBe(500)
    })

    it('adds the LATEST reading per channel, not every day of them', async () => {
      await givenPost(1, 'the caption')
      await givenMetric(1, 'instagram', 'engagement', 3, '2026-02-01')
      await givenMetric(1, 'instagram', 'engagement', 9, '2026-02-05')
      await givenMetric(1, 'instagram', 'reach', 100, '2026-02-05')

      const rows = await readFeaturedPosts(WS, 400, client)

      expect(rows[0]?.engagement).toBe(9)
    })

    it('returns nothing for a post that was never measured', async () => {
      await givenPost(1, 'never measured')
      expect(await readFeaturedPosts(WS, 400, client)).toEqual([])
    })

    it('never serves one workspace another workspace captions', async () => {
      await givenPost(1, 'the caption')
      await givenMetric(1, 'instagram', 'engagement', 2, '2026-02-01')
      await givenMetric(1, 'instagram', 'reach', 100, '2026-02-01')

      expect(await readFeaturedPosts(OTHER_WS, 400, client)).toEqual([])
    })
  })

  describe('readAudienceReadings', () => {
    async function givenAudience(bucket: string, value: number, on: string): Promise<void> {
      await db.query(
        `insert into audience_snapshots
           (workspace_id, account_id, channel, audience, dimension, bucket, value,
            measured_on, observed_at, timeframe, source)
         values ($1, $5, 'instagram', 'followers', 'follower_count', $2, $3,
                 $4::date, $4::timestamptz, 'day', 'test')`,
        // `account_id` is CHECKed against ^[0-9a-f]{24}$ — a platform id shape,
        // not a friendly name. Another thing only a real Postgres refuses.
        [WS, bucket, value, `${on}T00:00:00Z`, ACCOUNT],
      )
    }

    it('reads the total series and IGNORES gained and lost', async () => {
      // This is the shape production actually holds: gained and lost pinned at
      // zero while total moves. A reader built on them declines forever.
      await givenAudience('total', 100, '2026-02-01')
      await givenAudience('gained', 0, '2026-02-01')
      await givenAudience('lost', 0, '2026-02-01')
      await givenAudience('total', 140, '2026-03-05')

      const rows = await readAudienceReadings(WS, 800, client)

      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.total)).toEqual([100, 140])
    })

    it('returns the series oldest first, so a first-to-last diff is a diff', async () => {
      await givenAudience('total', 140, '2026-03-05')
      await givenAudience('total', 100, '2026-02-01')

      const rows = await readAudienceReadings(WS, 800, client)

      expect(rows[0]?.total).toBe(100)
      expect(rows[rows.length - 1]?.total).toBe(140)
    })

    it('never serves one workspace another workspace followers', async () => {
      await givenAudience('total', 100, '2026-02-01')
      expect(await readAudienceReadings(OTHER_WS, 800, client)).toEqual([])
    })
  })
})
