import type { PostStatus } from '@sahoda/shared'

import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * What "live publish state" is, and — just as importantly — what it is NOT.
 *
 * ── WHAT THIS CARRIES ────────────────────────────────────────────────────────
 * Server-owned publish state only: the post's lifecycle status, its schedule,
 * what the publish logs prove, and each channel's own outcome. That is the set
 * of things a PUBLISHER changes while the writer is looking at the screen.
 *
 * ── WHAT IT DELIBERATELY OMITS ───────────────────────────────────────────────
 * `title`, `body`, `channels`. Not an oversight — a hard boundary.
 * `use-autosave.ts:223-229` runs an effect on its `post` prop that calls
 * `evaluateRead`, which raises the "someone else changed this post" notice
 * whenever `updated_at` moves past the timestamp this editor adopted. A publish
 * bumps `updated_at` on every status change, so feeding a fresh post row into
 * the editor would accuse the publisher of being another person editing, on a
 * loop, while the writer is mid-sentence. Worse, adopting that row would replace
 * the draft they are typing.
 *
 * `post-editor.tsx:78` already draws this seam and says why: publish state is
 * "server-owned ... deliberately NOT from `variantsApi`. What a channel is doing
 * on a platform is not something the editor may have an opinion about." This is
 * the same line, enforced by the shape of the payload rather than by care.
 *
 * ── AND WHAT IT MUST NEVER CARRY ─────────────────────────────────────────────
 * Metrics. `listPostMetrics` calls Zernio up to `LIST_METRIC_CALLS` (6) times per
 * render, against a 60/min limit shared with analytics and the inbox. Every field
 * below is read from our own Postgres, so a poll costs Zernio exactly nothing —
 * and metrics stay in the server-rendered pass, where a refresh cannot blank a
 * panel that already had numbers in it.
 */

/** One post's server-owned publish state. */
export interface PostLiveState {
  postId: string
  /**
   * `posts.status` — what the user COMMITTED to, under the name that says so.
   *
   * Never evidence that anything published. The publish path writes
   * `post_variants` and leaves this column alone, so on a post that actually
   * went out this still reads `approved`. What happened is derived from
   * `variants` below, via `outcomeOf`.
   */
  intent: PostStatus
  /** ISO-8601, or null when the post carries no schedule. */
  scheduledAt: string | null
  /**
   * Per-channel outcome, EXACTLY as `variantStatusRow` built it — and the ONLY
   * evidence in this payload about what the post did.
   *
   * Not reshaped, not slimmed. `simulated` is computed there from the
   * `fixture://` permalink and then the permalink is nulled — "afterwards the
   * difference is gone" (`variant-status.ts:90-92`). Any hand-rolled wire shape
   * that carried `permalink` and `status` but dropped `simulated` would relabel
   * every fixture run as a real publish, which is the exact claim the whole rail
   * exists to refuse.
   *
   * This payload also carried `mode`, read from `post_publish_logs`, until that
   * turned out to be a SECOND derivation of the same fact off a different table.
   * These rows are what the publish path writes, so they are what is left.
   */
  variants: VariantStatusRow[]
}

export interface PublishSnapshot {
  posts: PostLiveState[]
  /** When the SERVER produced this, ISO-8601. Never the client's clock. */
  readAt: string
}

/**
 * How hard to watch, right now.
 *
 * `live`     — something is mid-publish. Seconds matter; the writer is watching.
 * `watching` — a scheduled post is due, or due within one cron tick. The sweep
 *              runs every 5 minutes (`apps/web/vercel.json`), so half a minute is
 *              already far finer than the thing being waited on.
 * `idle`     — nothing can move on its own. Do not poll at all.
 * `paused`   — watched long enough that something is evidently stuck. Stop, and
 *              SAY so, because a live region that has quietly given up reads as
 *              "nothing is happening" — which is a different claim entirely.
 */
export type LivePhase = 'live' | 'watching' | 'idle' | 'paused'

/** Mid-publish: fine-grained, because this is the window the writer is staring at. */
export const LIVE_INTERVAL_MS = 5_000

/**
 * Waiting for a cron tick. The sweep runs every five minutes (the `crons` entry
 * in `apps/web/vercel.json`), so the thing being waited on has a five-minute
 * granularity and 30s already over-samples it by a factor of ten.
 */
export const WATCHING_INTERVAL_MS = 30_000

/**
 * One cron tick's worth of lead. A post scheduled inside this window is one the
 * next sweep can pick up, so it is worth watching before its time arrives.
 */
export const TICK_LEAD_MS = 5 * 60 * 1000

/**
 * How long a single stretch of active watching may run before it stops.
 *
 * `PUBLISH_LEASE_SECONDS` is 600, so a variant genuinely mid-publish is released
 * by the sweep within ten minutes. Watching past that is watching something that
 * is not coming back, and an unattended tab must not poll until the laptop dies.
 */
export const WATCH_CAP_MS = 12 * 60 * 1000

/** Intents from which the server can still move the post on its own. */
const IN_FLIGHT_STATUSES: ReadonlySet<PostStatus> = new Set<PostStatus>(['publishing'])

/** Variant statuses that mean a publisher currently holds this channel. */
const IN_FLIGHT_VARIANTS: ReadonlySet<VariantStatusRow['status']> = new Set(['publishing'] as const)

/** True when a publisher is working on this post right now. */
export function isInFlight(post: PostLiveState): boolean {
  return (
    IN_FLIGHT_STATUSES.has(post.intent) ||
    post.variants.some((variant) => IN_FLIGHT_VARIANTS.has(variant.status))
  )
}

/**
 * True when the post is scheduled and its moment has arrived, or arrives within
 * one sweep. An unparseable `scheduled_at` counts as NOT due: guessing would
 * start a poll on a row nothing is going to touch.
 */
export function isDueSoon(post: PostLiveState, now: Date): boolean {
  if (post.intent !== 'scheduled') return false
  if (post.scheduledAt === null) return false
  const at = Date.parse(post.scheduledAt)
  if (Number.isNaN(at)) return false
  return at <= now.getTime() + TICK_LEAD_MS
}

export interface Cadence {
  phase: LivePhase
  /** null means STOP — no timer is armed at all. */
  intervalMs: number | null
}

/**
 * The whole polling policy, as one pure function.
 *
 * Pure on purpose: the cadence is the part with teeth (it decides whether a
 * forgotten tab hammers the database for an afternoon), and a rule buried in a
 * `useEffect` can only be tested by rendering and waiting on timers. Here it is
 * a table of inputs and answers.
 *
 * `watchedMs` is how long this stretch of active watching has already run — the
 * caller owns that clock, so this stays free of state.
 */
export function cadenceFor(
  posts: readonly PostLiveState[],
  now: Date,
  watchedMs: number,
  isVisible: boolean,
): Cadence {
  // A hidden tab is the single biggest saving available and the easiest to get
  // wrong by omitting. Nobody is reading it, so there is nothing for a live
  // update to be live FOR. Checked before anything else, so no other branch can
  // arm a timer behind a tab that is not on screen.
  if (!isVisible) return { phase: 'idle', intervalMs: null }

  const inFlight = posts.some(isInFlight)
  const dueSoon = posts.some((post) => isDueSoon(post, now))

  // Nothing the server can move without the user doing something. Stop dead —
  // an idle posts list should cost exactly as much as a static page, because
  // that is what it is.
  if (!inFlight && !dueSoon) return { phase: 'idle', intervalMs: null }

  if (watchedMs >= WATCH_CAP_MS) return { phase: 'paused', intervalMs: null }

  if (inFlight) return { phase: 'live', intervalMs: LIVE_INTERVAL_MS }
  return { phase: 'watching', intervalMs: WATCHING_INTERVAL_MS }
}

/**
 * Never re-evaluate more often than this, however close the next post is. Guards
 * against a schedule right on the boundary producing a zero-delay loop.
 */
export const MIN_WAKE_MS = 1_000

/**
 * Re-evaluate at least this often while ANY future schedule exists, even a
 * distant one. Costs nothing — a wake is a recomputation, not a fetch — and it
 * means a tab left open across a schedule being moved earlier still catches it.
 */
export const MAX_WAKE_MS = 5 * 60 * 1000

/**
 * How long until this page is worth LOOKING at again, when it is not worth
 * polling now.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * `cadenceFor` returning `intervalMs: null` says "do not fetch". Read as "do not
 * look again" it becomes a bug that eats the ordinary case: a post scheduled ten
 * minutes out is outside `TICK_LEAD_MS`, so the cadence is `idle`, so nothing is
 * armed — and if nothing re-enters the decision, that post publishes and the
 * screen never moves. Which is the entire thing this feature exists to fix.
 *
 * So "not now" and "not ever" are kept apart: this returns when the next
 * scheduled post enters its watch window, and the caller arms a timer that only
 * RE-DECIDES. No request is made at the wake — the cadence is simply computed
 * again, and by then the post is due and the real poll starts.
 *
 * `null` means there is genuinely nothing on the clock: no scheduled post with a
 * parseable future time. Then, and only then, is stopping correct.
 */
export function msUntilNextWatch(posts: readonly PostLiveState[], now: Date): number | null {
  const waits = posts
    .filter((post) => post.intent === 'scheduled' && post.scheduledAt !== null)
    .map((post) => Date.parse(post.scheduledAt as string))
    .filter((at) => !Number.isNaN(at))
    // The moment it enters the watch window, not the moment it fires: the sweep
    // may pick it up a tick early, and arriving late would miss the transition.
    .map((at) => at - TICK_LEAD_MS - now.getTime())
    .filter((ms) => ms > 0)

  if (waits.length === 0) return null
  return Math.min(MAX_WAKE_MS, Math.max(MIN_WAKE_MS, Math.min(...waits)))
}

/** Index a snapshot for lookup by the card that renders one post. */
export function byPostId(snapshot: PublishSnapshot): Map<string, PostLiveState> {
  return new Map(snapshot.posts.map((post) => [post.postId, post]))
}

/** The lifecycle facts a snapshot needs, from whichever read supplied them. */
export interface LifecycleFacts {
  id: string
  status: PostStatus
  scheduledAt: string | null
}

/**
 * Build a snapshot from lifecycle facts plus the two batched maps the list
 * screens already hold.
 *
 * ── WHY THIS IS A SEPARATE PURE FUNCTION ─────────────────────────────────────
 * The snapshot is produced twice from two different places, and they must not
 * drift. The FIRST one is free: `posts/page.tsx` has already read the posts
 * (`listPosts` returns `status` and `scheduled_at`), the modes and the variant
 * states, so seeding the provider costs no extra query at all. Every LATER one
 * comes from `buildPublishSnapshot`, which re-reads all three because a poll has
 * no page render to borrow from.
 *
 * Two callers, one assembler. If the seed and the polled update were assembled
 * separately, a field could be right on load and subtly different one tick
 * later — the kind of difference that shows up as a chip flickering between two
 * claims and is very hard to attribute afterwards.
 */
export function assembleSnapshot(
  lifecycles: readonly LifecycleFacts[],
  variants: ReadonlyMap<string, VariantStatusRow[]>,
  readAt: string,
): PublishSnapshot {
  return {
    readAt,
    posts: lifecycles.map((row) => ({
      postId: row.id,
      intent: row.status,
      scheduledAt: row.scheduledAt,
      // `?? []` is load-bearing and means UNKNOWN, not "nothing published":
      // `listVariantStates` returns an empty map on any read failure. `outcomeOf`
      // reports `unknown` for it and every consumer then falls back to intent
      // rather than claiming — or denying — a publish nobody read.
      variants: variants.get(row.id) ?? [],
    })),
  }
}
