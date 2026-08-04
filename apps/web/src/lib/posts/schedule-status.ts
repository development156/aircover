import type { PostStatus } from '@sahoda/shared'

/**
 * Whether a post's "Scheduled" badge is making a promise the product cannot
 * keep, and which honest thing to say about it.
 *
 * SCHEDULED AUTO-PUBLISH IS NOT LIVE. `apps/jobs` defines a `publishPost` task,
 * but nothing dispatches it — the only cron in that package is the expired-hold
 * sweep, and `apps/web` carries no dependency on `@sahoda/jobs` at all. A
 * scheduled post's time arriving does nothing whatsoever.
 *
 * A "Scheduled" chip beside a date is read by everyone as "this goes out on its
 * own", so every scheduled post is already making that promise; a past-due one
 * has been caught out. Both get labelled, and the past-due case gets the
 * stronger, provable claim — the same way the publish preview says "Simulated —
 * nothing was posted" rather than quietly rendering a success.
 *
 * Pure: no clock of its own. `now` is injected so the server renders one
 * instant and tests are deterministic.
 */

/**
 * - `none`     — the post makes no auto-publish promise.
 * - `awaiting` — scheduled, time still ahead (or unknown): it will not post itself.
 * - `overdue`  — scheduled, time provably past: it did not post, and never will.
 */
export type AutoPublishTruth = 'none' | 'awaiting' | 'overdue'

interface AutoPublishCopy {
  /** Full sentence for list rows and the editor. */
  readonly note: string
  /** Week-grid cells have ~14 characters of room. Still reads as a warning. */
  readonly short: string
}

/**
 * Copy lives with the rule that selects it so the two cannot drift apart, and
 * so a test can assert what the words may never claim. Nothing here is
 * future-tense about publishing: "will go out at 6pm" is the same lie in
 * gentler words, because nothing is scheduled to run.
 */
export const AUTO_PUBLISH_COPY = {
  awaiting: {
    note: "Won't post itself — scheduled auto-publish isn't live yet. Copy it across at that time to post it.",
    short: 'Not auto-posted',
  },
  overdue: {
    note: "This time has passed and nothing was published — scheduled auto-publish isn't live yet. Copy it across to post it.",
    short: 'Missed · not posted',
  },
} as const satisfies Record<Exclude<AutoPublishTruth, 'none'>, AutoPublishCopy>

/**
 * The same correction at the point the belief forms — the composer's schedule
 * picker. It is stated as soon as a time is set, because that is the moment the
 * writer decides they are done with the post.
 */
export const SCHEDULE_FIELD_NOTE =
  "Setting a time doesn't publish it — scheduled auto-publish isn't live yet. Copy it across at that time to post it."

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime())

/**
 * What a scheduled post looks like HERE, which is not what the name suggests.
 *
 * This gate read `status === 'scheduled'` until it was found to be dead code:
 * apps/web has never written that status. `approvePost` is the one sanctioned
 * status write and it writes `approved`; inserts write `draft`; `savePost`
 * refuses `status` outright. The labelling was therefore unreachable — it
 * rendered for nobody while every unit test passed, because each one handed the
 * function a status by hand that no code path could produce.
 *
 * So a committed post is `approved` (or `scheduled`, kept for the day a real
 * schedule action lands) and the promise is made by the DATE: `post-card` and
 * `planner-row` render the time whenever `scheduled_at` is set, and a time
 * beside a post reads as "this goes out then". An approved post with no date
 * commits to the content only and has nothing to correct.
 *
 * `scheduled` is the exception that needs no date, because `status-badge`
 * renders the literal word "Scheduled" — that badge makes the promise on its
 * own, with or without a time.
 *
 * A dated DRAFT is still silent: a plan, not a commitment. Labelling every
 * dated post would train users to ignore the label, which costs us the past-due
 * case that actually matters. `publishing` is absent for the original reason —
 * apps/web cannot write it, so a branch for it would guard nothing.
 *
 * `schedule-status-reachability.test.ts` reads the statuses this app writes out
 * of the source and fails if this gate stops matching any of them.
 */
export function autoPublishTruth(
  status: PostStatus,
  scheduledAt: string | null,
  now: Date,
): AutoPublishTruth {
  const promisesAutoPublish =
    status === 'scheduled' || (status === 'approved' && scheduledAt !== null)
  if (!promisesAutoPublish) return 'none'

  // "It will not post itself" is true regardless of the time, so it is the
  // floor. Everything below can only ever upgrade to the stronger claim.
  if (scheduledAt === null || !isValidDate(now)) return 'awaiting'

  const due = Date.parse(scheduledAt)
  if (!Number.isFinite(due)) return 'awaiting'

  // Strictly past, matching `staleHoldNote`: a post due this very second has not
  // yet been missed, and "nothing was published" must be a claim we can prove.
  return due < now.getTime() ? 'overdue' : 'awaiting'
}
