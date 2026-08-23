import type { PostStatus } from '@sahoda/shared'

import { isPastDeliveryWindow } from '@/lib/posts/delivery-window'
import { publishEvidence } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

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
 * - `none`      — the post makes no auto-publish promise, or it is fully out.
 * - `awaiting`  — nothing has published, time still ahead (or unknown): it will not post itself.
 * - `overdue`   — nothing has published, time provably past: it did not post, and never will.
 * - `partial`   — live on at least one channel, not on at least one other.
 * - `simulated` — every publish on it was a fixture run: nothing reached a platform.
 */
export type AutoPublishTruth = 'none' | 'awaiting' | 'overdue' | 'partial' | 'simulated'

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
    note: "Won't post itself. Scheduled auto-publish isn't live yet. Copy it across at that time to post it.",
    short: 'Not auto-posted',
  },
  overdue: {
    note: "This time has passed and nothing was published. Scheduled auto-publish isn't live yet. Copy it across to post it.",
    short: 'Missed · not posted',
  },
  partial: {
    note: "Out on some channels and not on others. Scheduled auto-publish isn't live yet, so the rest will stay put. Send those from the post rather than publishing it again.",
    short: 'Partly out',
  },
  simulated: {
    note: "Nothing reached a platform. This ran as a simulation, and scheduled auto-publish isn't live yet. Copy it across to post it for real.",
    short: 'Simulated only',
  },
} as const satisfies Record<Exclude<AutoPublishTruth, 'none'>, AutoPublishCopy>

/**
 * The same correction at the point the belief forms — the composer's schedule
 * picker. It is stated as soon as a time is set, because that is the moment the
 * writer decides they are done with the post.
 */
export const SCHEDULE_FIELD_NOTE =
  "Setting a time doesn't publish it. Scheduled auto-publish isn't live yet. Copy it across at that time to post it."

/**
 * What the picker says once the dispatcher is actually running.
 *
 * Deliberately not "will go out at 6pm sharp": the sweep runs every five minutes
 * and takes a bounded number of posts per tick, so the honest promise is "around
 * then", and the honest scope is "the channels that are connected".
 */
export const SCHEDULE_FIELD_NOTE_LIVE =
  'This goes out on its own at around that time, on every connected channel.'

/** The picker's note for this environment. `enabled` is a server fact — never guessed. */
export function scheduleFieldNote(enabled: boolean): string {
  return enabled ? SCHEDULE_FIELD_NOTE_LIVE : SCHEDULE_FIELD_NOTE
}

/** Row copy for a live dispatcher. Nothing here claims a post already went out. */
export const AUTO_PUBLISH_COPY_LIVE = {
  awaiting: { note: 'Goes out on its own at this time.', short: 'Auto-posts' },
  overdue: {
    note: 'This time has passed and it has not gone out yet. Check the channel status on the post.',
    short: 'Late · check',
  },
  partial: {
    note: 'Out on some channels and not on others. Check the channel status on the post.',
    short: 'Partly out',
  },
  simulated: {
    note: 'Nothing reached a platform. This ran as a simulation. Send it again to post it for real.',
    short: 'Simulated only',
  },
} as const satisfies Record<Exclude<AutoPublishTruth, 'none'>, AutoPublishCopy>

/** The copy set for this environment. */
export function autoPublishCopy(enabled: boolean) {
  return enabled ? AUTO_PUBLISH_COPY_LIVE : AUTO_PUBLISH_COPY
}

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
 *
 * ── WHY THE VARIANT ROWS ARE AN ARGUMENT AND NOT AN OPTION ───────────────────
 * `posts.status` plus a date cannot answer "did this go out" — see
 * `publish-evidence.ts`, which now owns that reading for every consumer. It answered
 * `overdue` — "this time has passed and nothing was published" — for four rows in
 * production whose own channel chips, two inches above, read "published". The
 * post-level status rolls up late or not at all: `65dc1a34` sat at `scheduled`
 * with both of its variants at `published`, and three demo posts sat at
 * `approved` with two published channels each. `post_variants.publish_status` is
 * where a publish is actually recorded, so that is what this reads.
 *
 * Required in position, never optional. `variantStates?:` on the props is the
 * shape that produced two defects in two days elsewhere in this app (`lagHours?`,
 * `simulated?`): a call site that forgets it gets a silent default instead of a
 * type error, and the default is invisible precisely where it is wrong.
 *
 * ── NO ROWS IS NOT EVIDENCE OF NO PUBLISH ────────────────────────────────────
 * `listVariantStates` returns an empty map on ANY read failure, and `.get(id)`
 * cannot distinguish "this post has no variants" from "the query threw". So an
 * empty list yields the floor rather than `overdue`: during a variant-read outage
 * the alternative is every past-due card on the page reviving the exact lie this
 * change removes. The cost is a post whose variants were never generated reading
 * "won't post itself" instead of "missed" — weaker, still true, and production
 * carries no such row (0 past-due posts have no variants).
 */
export function autoPublishTruth(
  status: PostStatus,
  scheduledAt: string | null,
  now: Date,
  variants: readonly VariantStatusRow[],
): AutoPublishTruth {
  const promisesAutoPublish =
    status === 'scheduled' || (status === 'approved' && scheduledAt !== null)
  if (!promisesAutoPublish) return 'none'

  const evidence = publishEvidence(variants)

  // A platform has it. Nothing below may say otherwise, whatever the clock says —
  // the time a post was due is not evidence about whether it went.
  if (evidence.live > 0) {
    // A fixture channel counts as unfinished here: the row says published and no
    // platform ever saw it, so the post is not out everywhere it was aimed.
    return evidence.outstanding > 0 || evidence.simulated > 0 ? 'partial' : 'none'
  }

  // Published only through the fixture rail. "Nothing was published" is TRUE of
  // the platforms and false of the screen, which shows two channels marked
  // published — so it names the simulation instead of denying the chips.
  if (evidence.simulated > 0) return 'simulated'

  // "It will not post itself" is true regardless of the time, so it is the
  // floor. Everything below can only ever upgrade to the stronger claim.
  if (scheduledAt === null || !isValidDate(now)) return 'awaiting'
  if (evidence.outstanding === 0) return 'awaiting'

  const due = Date.parse(scheduledAt)
  if (!Number.isFinite(due)) return 'awaiting'

  // ── PAST DUE IS NOT LATE, AND THE DIFFERENCE IS THE WHOLE POINT ────────────
  // This read `due < now`, so a post rendered "Late · check" under a warning
  // triangle from the second it came due. Publishing runs on a five-minute cron,
  // and MEASURED in production every scheduler delivery landed 73-199 s after
  // its scheduled time — so the warning fired on EVERY healthy post, every time,
  // for the whole time the system was working correctly. The picker two inches
  // away already said "at around that time"; this line was the one contradicting
  // it. See `delivery-window.ts` for how long healthy takes and why the
  // allowance errs long.
  //
  // Inside the window the claim stays `awaiting` — "goes out on its own at this
  // time" is still true of a post that is on its way — rather than becoming a
  // fourth state. A post that is merely in transit has nothing to correct.
  return isPastDeliveryWindow(due, now.getTime()) ? 'overdue' : 'awaiting'
}
