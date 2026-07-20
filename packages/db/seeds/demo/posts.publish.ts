import {
  CONSTRAINTS,
  type Channel,
  type PostStatus,
  type VariantPublishStatus,
} from '@sahoda/shared'
import { DEMO_VARIANTS, type DemoPost } from './posts.content'
import { at } from './time'

/**
 * The three rules that decide whether a demo row claims a real-looking publish: which
 * channels may say 'published' at all, what platform id they claim, and what URL that id
 * renders as. They live together here, away from the SQL, because each one is a place where
 * a careless edit puts a fake success on screen — and because posts.ts plus the frozen copy
 * already exceed what two files can hold under the spec's 300-line limit.
 */

/** Obviously-fake platform ids: nothing here ever reached a real timeline. */
const PLATFORM_ID_BASE = 1_800_000
const PLATFORM_ID_SPAN = 200_000

export function scheduledAtFor(post: DemoPost, now: Date): Date | null {
  if (post.dayOffset === null || post.timeOfDay === null) return null
  return at(now, post.dayOffset, post.timeOfDay)
}

/**
 * A published variant hangs its attempt times off the post's schedule, so a published post
 * with no `dayOffset` is a data bug rather than a null to tolerate. Passing the null on
 * would surface as a bare TypeError inside `minutesFrom`, naming neither post nor channel.
 */
export function publishedAtFor(post: DemoPost, channel: Channel, now: Date): Date {
  const scheduledAt = scheduledAtFor(post, now)
  if (!scheduledAt) {
    throw new Error(`${post.labelTail}/${channel}: published post has no scheduled_at`)
  }
  return scheduledAt
}

/**
 * Instagram is `publishable: false` in Alpha, so its variants stay 'skipped' however the
 * parent post reads. Seeding one as 'published' would put a success on screen for a channel
 * the product cannot actually post to.
 */
export function publishStatusFor(status: PostStatus, channel: Channel): VariantPublishStatus {
  if (status !== 'published' && status !== 'scheduled') return 'pending'
  if (!CONSTRAINTS[channel].publishable) return 'skipped'
  return status === 'published' ? 'published' : 'scheduled'
}

/**
 * FNV-1a over the variant's own identity, deliberately NOT its position in DEMO_VARIANTS.
 * `post_variants` is `do update` while `post_publish_logs` is `do nothing` (the append-only
 * trigger rejects UPDATE), so a position-derived number would let inserting or reordering
 * one variant refresh every later variant's platform_post_id and permalink on re-run while
 * their publish logs kept the old pair forever. Hashing the identity makes the variant and
 * its log agree by construction, which is the whole point of deriving the id.
 */
export function platformIdFor(labelTail: string, channel: Channel): string {
  let hash = 0x811c9dc5
  for (const char of `${labelTail}.${channel}`) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0
  }
  return `demo-${channel}-${PLATFORM_ID_BASE + (hash % PLATFORM_ID_SPAN)}`
}

/** A hash only stands in for an id while it stays injective over the data we actually have. */
export function assertPlatformIdsDistinct(): void {
  const seen = new Map<string, string>()
  for (const variant of DEMO_VARIANTS) {
    const id = platformIdFor(variant.post, variant.channel)
    const owner = `${variant.post}/${variant.channel}`
    const clash = seen.get(id)
    if (clash) throw new Error(`platform id ${id} collides between ${clash} and ${owner}`)
    seen.set(id, owner)
  }
}

/**
 * Exhaustive on purpose. Defaulting would hand linkedin and instagram an x.com URL under the
 * shop's handle, and the only thing preventing that today is which channels the caller
 * happens to mark 'published' — a guarantee that belongs here, not there.
 */
export function permalinkFor(channel: Channel, platformPostId: string): string {
  switch (channel) {
    case 'x':
      return `https://x.com/chaiandchapters/status/${platformPostId}`
    case 'gbp':
      return `https://business.google.com/posts/demo/${platformPostId}`
    default:
      throw new Error(`no demo permalink shape for ${channel}: Alpha publishes only x and gbp`)
  }
}
