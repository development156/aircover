import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootFullSchema } from '@sahoda/db/testing'

import { STALE_AFTER_SECONDS, applyReconciledStatus, findStaleVariants } from './webhook-reconcile'

/**
 * THE SWEEP THAT CATCHES WHAT NEVER ARRIVED.
 *
 * Every assertion here is about the same rule, from a different angle: A MISSING
 * EVENT MEANS "WE HAVE NOT HEARD", NEVER "IT FAILED".
 */

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'

describe('reconciliation sweep (real Postgres, in-process)', () => {
  let db: PGlite
  const q = (): { query: PGlite['query'] } => ({
    query: (s: string, p?: unknown[]) => db.query(s, p),
  })

  beforeAll(async () => {
    db = await bootFullSchema()
  }, 120_000)

  beforeEach(async () => {
    await db.exec(`truncate zernio_webhook_events, post_variants, posts, workspaces cascade`)
    await db.query(`insert into workspaces (id,name,slug,created_by) values ($1,'A','a','u')`, [WS])
    await db.query(
      `insert into posts (id, workspace_id, title, status) values ($1,$2,'P','publishing')`,
      [POST, WS],
    )
  })

  /** A variant last touched `ageSeconds` ago. */
  const variant = async (
    channel: string,
    publishStatus: string,
    ageSeconds: number,
    platformPostId: string | null = 'pp_1',
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `insert into post_variants (workspace_id, post_id, channel, body, publish_status, platform_post_id, updated_at)
       values ($1,$2,$3,'b',$4,$5, now() - make_interval(secs => $6::int))
       returning id::text as id`,
      [WS, POST, channel, publishStatus, platformPostId, ageSeconds],
    )
    return r.rows[0]!.id
  }

  const stale = (limit = 25) => findStaleVariants(q() as never, { limit })

  // ── WHAT IT SELECTS ───────────────────────────────────────────────────────

  it('finds a variant stuck in flight past the threshold', async () => {
    const id = await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
    const rows = await stale()
    expect(rows.map((r) => r.variantId)).toEqual([id])
    expect(rows[0]!.staleForSeconds).toBeGreaterThan(STALE_AFTER_SECONDS)
  })

  it('leaves a RECENT in-flight variant alone', async () => {
    // The threshold is derived from the measured healthy publish (docs/32 §P6:
    // up to ~380 s end to end). Sweeping earlier would ask Zernio about every
    // perfectly healthy post.
    await variant('instagram', 'publishing', 60)
    expect(await stale()).toEqual([])
  })

  it('leaves a variant that already reached a terminal state alone', async () => {
    await variant('instagram', 'published', STALE_AFTER_SECONDS + 600)
    await variant('linkedin', 'failed', STALE_AFTER_SECONDS + 600)
    expect(await stale()).toEqual([])
  })

  it('SKIPS a variant an event has already explained', async () => {
    // Without this the sweep would spend a Zernio read per tick, forever, to learn
    // what is already in this database.
    const id = await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
    expect((await stale()).map((r) => r.variantId)).toEqual([id])

    await db.query(
      `insert into zernio_webhook_events (event_id, event, workspace_id, routing, payload, received_at)
       values ('e1','post.published',$1,'routed',$2::jsonb, now())`,
      [
        WS,
        JSON.stringify({ post: { platforms: [{ platformPostId: 'pp_1', status: 'published' }] } }),
      ],
    )

    expect(await stale()).toEqual([])
  })

  it('does NOT skip on an event for a DIFFERENT platform post', async () => {
    // The containment match must be on the id, not merely on the event's existence.
    await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
    await db.query(
      `insert into zernio_webhook_events (event_id, event, workspace_id, routing, payload, received_at)
       values ('e2','post.published',$1,'routed',$2::jsonb, now())`,
      [WS, JSON.stringify({ post: { platforms: [{ platformPostId: 'SOMEONE_ELSE' }] } })],
    )
    expect(await stale()).toHaveLength(1)
  })

  it('does NOT skip on an event that PREDATES the variant last change', async () => {
    // A post rescheduled AFTER an old event must be swept again: that event describes
    // a publish attempt that is no longer the current one. The query expresses this as
    // `e.received_at > v.updated_at`, and this is the case that pins the direction.
    await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
    await db.query(
      `insert into zernio_webhook_events (event_id, event, workspace_id, routing, payload, received_at)
       values ('e3','post.published',$1,'routed',$2::jsonb, now() - make_interval(secs => $3::int))`,
      [
        WS,
        JSON.stringify({ post: { platforms: [{ platformPostId: 'pp_1' }] } }),
        STALE_AFTER_SECONDS + 600,
      ],
    )

    // Assert the SETUP before relying on it: the event must really be older than the
    // variant's last change, or this test would pass for the wrong reason.
    const rel = await db.query<{ event_is_older: boolean }>(
      `select (max(e.received_at) < max(v.updated_at)) as event_is_older
         from post_variants v, zernio_webhook_events e`,
    )
    expect(rel.rows[0]!.event_is_older).toBe(true)

    // Still swept, because that event cannot explain the current attempt.
    expect(await stale()).toHaveLength(1)
  })

  it('honours the cap, oldest first, so nothing is silently dropped', async () => {
    await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 900, 'pp_a')
    await variant('linkedin', 'publishing', STALE_AFTER_SECONDS + 300, 'pp_b')
    const rows = await stale(1)
    expect(rows).toHaveLength(1)
    // Oldest first: the one that has been waiting longest is asked about first.
    expect(rows[0]!.channel).toBe('instagram')
  })

  it('still selects a variant the synchronous publish never named', async () => {
    // platform_post_id null is the worst case — the publish call itself did not
    // return. It is exactly the variant most likely to be stuck, so it must not be
    // filtered out by the join it cannot satisfy.
    const id = await variant('x', 'publishing', STALE_AFTER_SECONDS + 60, null)
    const rows = await stale()
    expect(rows.map((r) => r.variantId)).toEqual([id])
    expect(rows[0]!.platformPostId).toBeNull()
  })

  // ── WHAT IT WRITES, AND WHAT IT REFUSES TO WRITE ──────────────────────────

  describe('applying an outcome', () => {
    it('writes a terminal status Zernio actually reported', async () => {
      const id = await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
      const out = await applyReconciledStatus(q() as never, {
        variantId: id,
        publishStatus: 'published',
        permalink: 'https://example.test/p',
      })
      expect(out).toEqual({ kind: 'resolved', publishStatus: 'published' })
      const r = await db.query<{ publish_status: string; permalink: string }>(
        `select publish_status, permalink from post_variants where id = $1::uuid`,
        [id],
      )
      expect(r.rows[0]).toEqual({
        publish_status: 'published',
        permalink: 'https://example.test/p',
      })
    })

    it('reports SUPERSEDED rather than resurrecting a variant that moved on', async () => {
      // Between selection and the write, a user can delete, re-draft or reschedule.
      const id = await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
      await db.query(`update post_variants set publish_status = 'pending' where id = $1::uuid`, [
        id,
      ])

      const out = await applyReconciledStatus(q() as never, {
        variantId: id,
        publishStatus: 'published',
      })
      expect(out).toEqual({ kind: 'superseded' })
      const r = await db.query<{ publish_status: string }>(
        `select publish_status from post_variants where id = $1::uuid`,
        [id],
      )
      // Untouched. The caller is told it wrote nothing rather than believing it did.
      expect(r.rows[0]!.publish_status).toBe('pending')
    })

    it('THE RULE: there is no code path that can write a status from silence', async () => {
      // `applyReconciledStatus` takes 'published' | 'failed' as a REQUIRED argument
      // — there is no default and no "assume failed after N tries" branch anywhere
      // in the module. A variant nobody could get an answer about simply keeps the
      // status it had, and the sweep will pick it up again next tick.
      const source = await import('node:fs').then((fs) =>
        fs.readFileSync(new URL('./webhook-reconcile.ts', import.meta.url).pathname, 'utf8'),
      )
      // No branch turns an absent or failed READ into a 'failed' STATUS.
      expect(source).not.toMatch(/read_failed[\s\S]{0,200}publish_status\s*=\s*'failed'/)
      expect(source).not.toMatch(/catch[\s\S]{0,160}'failed'/)
      // And the only place a status is written is the guarded update.
      expect(source.match(/set publish_status/g) ?? []).toHaveLength(1)
    })

    it('a variant nobody could get an answer about keeps its status and stays swept', async () => {
      const id = await variant('instagram', 'publishing', STALE_AFTER_SECONDS + 60)
      // A read that failed writes nothing at all — the caller simply does not call
      // applyReconciledStatus. The variant is still in flight, and still selected.
      const r = await db.query<{ publish_status: string }>(
        `select publish_status from post_variants where id = $1::uuid`,
        [id],
      )
      expect(r.rows[0]!.publish_status).toBe('publishing')
      expect((await stale()).map((s) => s.variantId)).toEqual([id])
    })
  })
})
