import 'server-only'

import { CHANNEL, str, type ProjectionOutcome, type Queryable } from './webhook-store'

/**
 * `post.published`, `post.failed`, `post.partial` → `post_variants.publish_status`.
 *
 * ── WHAT THIS ACTUALLY BUYS, AND WHAT IT DOES NOT ────────────────────────────
 * It does NOT make scheduled posts land on time, and the brief that commissioned
 * this work believed it would. Measured in docs/32 §P6, the 73-199 s lag decomposes
 * into wait-for-the-next-five-minute-tick (uniform on [0, 300) s) plus 49-79 s of job
 * runtime — both entirely ours. `adapters/zernio.ts:325` sends `publishNow: true`
 * on every call, so SAHODA HOLDS THE SCHEDULE AND ZERNIO NEVER DOES: Zernio does
 * not know a scheduled post exists until our own cron decides to publish it, and no
 * event it could send would arrive earlier than the tick that caused it.
 *
 * What this DOES buy is the outcome our synchronous call cannot see. `createPost`
 * returns as soon as Zernio accepts the post; a platform can fail it minutes later
 * (an Instagram container that finishes processing badly is the standard case).
 * Today nothing notices — the variant sits at whatever the synchronous call wrote.
 * These events are that missing half.
 *
 * ── THE CORRELATION KEY, AND WHY IT IS NOT ZERNIO'S POST ID ──────────────────
 * Nothing in this schema stores Zernio's own post `_id`. Checked: no column on
 * `posts`, `post_variants` or `post_publish_logs` holds it, and `createPost` sends
 * no `metadata` for Zernio to echo back. So `payload.post.id` is UNUSABLE as a join
 * key today, and pretending otherwise would silently match nothing.
 *
 * The key used instead is `platforms[].platformPostId` against
 * `post_variants.platform_post_id`, which the synchronous publish already wrote.
 * That correlates exactly the events this file is for — a later outcome on a post
 * we published and recorded — and nothing else, which is honest.
 *
 * THE FOLLOW-UP THAT WOULD CLOSE THE GAP is to send `metadata: { variantId }` on
 * `createPost`; `WebhookPayloadPost.metadata` is documented as "echoed back so you
 * can map events onto your own records". That is a change to the live publish
 * request and it is deliberately NOT made here — it cannot be verified without
 * executing a real publish. Recorded as a request, not done quietly.
 */
export async function projectPostState(
  db: Queryable,
  args: { payload: Record<string, unknown>; workspaceId: string },
): Promise<ProjectionOutcome> {
  const post = args.payload.post
  const platforms =
    typeof post === 'object' && post !== null ? (post as Record<string, unknown>).platforms : null
  if (!Array.isArray(platforms)) return { kind: 'referent_absent', what: 'post.platforms' }

  let rows = 0
  let sawKnownChannel = false

  // WALKED, never `platforms[0]`. The field's own documentation says "A post can
  // span multiple accounts", and reading a list as a scalar is the defect class
  // this repo has already shipped three times.
  for (const entry of platforms) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>

    const platform = str(e, 'platform')
    const state = str(e, 'status')
    const platformPostId = str(e, 'platformPostId')
    if (platform === null || state === null || platformPostId === null) continue

    const channel = CHANNEL[platform]
    if (channel === undefined) continue
    sawKnownChannel = true

    // Only the two TERMINAL outcomes are written. An in-between state Zernio
    // reports and this schema has no name for is left alone rather than mapped onto
    // the nearest one — `publishing` here already means something specific (a held
    // claim with a lease), and writing it from an event would hand out a lease
    // nobody owns and no sweep would ever release.
    const publishStatus = state === 'published' ? 'published' : state === 'failed' ? 'failed' : null
    if (publishStatus === null) continue

    // ── THE GUARD THAT KEEPS A LATE EVENT FROM RESURRECTING A ROW ────────────
    // Zernio retries for up to ~51 hours and dead-letters after that, so a
    // `post.published` for a variant somebody has since deleted, re-drafted or
    // rescheduled can legitimately arrive a day and a half later. `publish_status
    // in ('scheduled','publishing','published')` restricts the write to rows still
    // in or just out of flight; `published` is included so a `post.failed` that
    // arrives AFTER a platform-side reversal is not ignored, which is the whole
    // point of this file. A row back at `pending` or `draft` has moved on, and a
    // late event about it is history rather than news.
    //
    // Matching on `platform_post_id` as well as workspace and channel means this
    // can only ever touch the variant the event is actually about.
    const updated = await db.query<{ id: string }>(
      `update post_variants v
          set publish_status = $1,
              permalink      = coalesce($2, v.permalink),
              updated_at     = now()
        where v.workspace_id = $3::uuid
          and v.channel = $4
          and v.platform_post_id = $5
          and v.publish_status in ('scheduled', 'publishing', 'published')
          and v.publish_status is distinct from $1
       returning v.id`,
      [publishStatus, str(e, 'publishedUrl'), args.workspaceId, channel, platformPostId],
    )
    rows += updated.rows.length
  }

  if (rows > 0) return { kind: 'projected', surface: 'publish_state', rows }

  // NOTHING WAS WRITTEN, and the two reasons are different facts. A channel this
  // product does not model is not the same as a post it has never heard of, and
  // collapsing them would make an unrouteable platform look like a missing row.
  return sawKnownChannel
    ? { kind: 'referent_absent', what: 'a post_variant matching this platform post id' }
    : { kind: 'channel_not_representable', platform: 'none of the platforms on this event' }
}
