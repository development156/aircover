import { CONSTRAINTS, type Channel, type VariantPublishStatus } from '@sahoda/shared'
import { DEMO_VARIANTS, type DemoPost } from './posts.content'
import { at } from './time'

/**
 * The rules that decide what a demo row may claim about publishing: which channels may say
 * 'published' at all, what platform id they claim, and what URL that id renders as. They
 * live together here, away from the SQL, because each one is a place where a careless edit
 * puts a fake success on screen — and because posts.ts plus the frozen copy already exceed
 * what two files can hold under the spec's 300-line limit.
 *
 * Every id and URL below is built to the FIXTURE ADAPTER's own shape
 * (packages/publishing/src/adapters/fixture.ts). That is the repo-wide honesty convention:
 * a simulated publish is labelled `mode='fixture'` and carries a `fixture://` permalink,
 * "so it can never be mistaken for a real publish" (packages/publishing/CLAUDE.md). These
 * rows are simulated, so they must be indistinguishable from what a fixture run writes.
 */

export function scheduledAtFor(post: DemoPost, now: Date): Date | null {
  if (post.dayOffset === null || post.timeOfDay === null) return null
  return at(now, post.dayOffset, post.timeOfDay)
}

/**
 * A simulated-publish variant hangs its attempt times off the post's schedule, so such a
 * post with no `dayOffset` is a data bug rather than a null to tolerate. Passing the null
 * on would surface as a bare TypeError inside `minutesFrom`, naming neither post nor
 * channel.
 */
export function publishedAtFor(post: DemoPost, channel: Channel, now: Date): Date {
  const scheduledAt = scheduledAtFor(post, now)
  if (!scheduledAt) {
    throw new Error(`${post.labelTail}/${channel}: simulated-publish post has no scheduled_at`)
  }
  return scheduledAt
}

/**
 * Instagram is `publishable: false` in Alpha, so its variants stay 'skipped' however the
 * parent post reads. Seeding one as 'published' would put a success on screen for a channel
 * the product cannot actually post to.
 *
 * Keyed off `post.simulatedPublish`, never off `post.status === 'published'` — no demo post
 * carries that status any more, precisely so the lifecycle chip cannot claim a real publish
 * (see the field's doc comment in posts.content.ts).
 */
export function publishStatusFor(post: DemoPost, channel: Channel): VariantPublishStatus {
  const simulated = post.simulatedPublish ?? false
  if (!simulated && post.status !== 'scheduled') return 'pending'
  if (!CONSTRAINTS[channel].publishable) return 'skipped'
  return simulated ? 'published' : 'scheduled'
}

/**
 * The fixture adapter's platform id, verbatim: `fixture-<postId>-<variantId>`.
 *
 * Takes the two uuids rather than the label pair so this file stays a leaf — posts.ts owns
 * `postId`/`variantId`, and importing them back would make the pair circular. Deriving the
 * id from those uuids also makes `post_variants` (upserted with `do update`) and
 * `post_publish_logs` (append-only, `do nothing`) agree by construction on re-run: both
 * sides recompute the same value from the same uuidv5 inputs.
 *
 * This replaces a `demo-<channel>-<FNV hash>` id whose partner permalink was a real-looking
 * `https://x.com/chaiandchapters/status/…`. Between them they rendered as a genuine post on
 * a real timeline for content that has never left this database.
 */
export function platformIdFor(postUuid: string, variantUuid: string): string {
  return `fixture-${postUuid}-${variantUuid}`
}

/** A generated id only stands in for a real one while it stays injective over our data. */
export function assertPlatformIdsDistinct(
  idFor: (labelTail: string, channel: Channel) => string,
): void {
  const seen = new Map<string, string>()
  for (const variant of DEMO_VARIANTS) {
    const id = idFor(variant.post, variant.channel)
    const owner = `${variant.post}/${variant.channel}`
    const clash = seen.get(id)
    if (clash) throw new Error(`platform id ${id} collides between ${clash} and ${owner}`)
    seen.set(id, owner)
  }
}

/**
 * The fixture adapter's permalink scheme, verbatim. `fixture://` is a scheme no browser
 * resolves and which `apps/web` is tested never to render as a link
 * (posts-publish.test.ts: "a `fixture://` URL rendered anywhere invites being read as a
 * real post"). No per-channel URL shape is needed or wanted here: the channel is a path
 * segment, so there is no real-platform URL left to get wrong.
 */
export function permalinkFor(channel: Channel, platformPostId: string): string {
  return `fixture://${channel}/${platformPostId}`
}
