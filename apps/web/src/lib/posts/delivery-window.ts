/**
 * How long a HEALTHY scheduled delivery can take, from the minute the customer
 * picked to the post actually going out.
 *
 * ## Why this exists
 *
 * Publishing is driven by a Vercel cron that ticks every five minutes
 * (`apps/web/vercel.json`), so a post scheduled for 10:00 is picked up by the
 * 10:00 or 10:05 tick and then takes as long as the batch takes. Nothing about
 * that is broken — it is what a polling scheduler is.
 *
 * The defect it closes is that `autoPublishTruth` had no allowance for it at
 * all: `due < now` meant a post rendered "Late · check", under a warning
 * triangle, from the very second it came due. Every correctly-delivered
 * scheduled post showed a false alarm for the whole time the system was working
 * exactly as designed — and two inches away the picker was already telling the
 * truth ("This goes out on its own at AROUND that time"). The screen
 * contradicted itself.
 *
 * ## The two halves, and why neither is a guess
 *
 * `SWEEP_INTERVAL_MINUTES` is not a preference. It is the cron expression in
 * `apps/web/vercel.json`, restated here because a `'use client'` component
 * cannot read a deployment config. `delivery-window.test.ts` parses that file,
 * derives the interval from the schedule, and fails if the two stop agreeing —
 * so raising the cron to a one-minute step breaks the build rather than leaving a
 * seven-minute window in place.
 *
 * `SWEEP_RUNTIME_ALLOWANCE_SECONDS` is the batch's own execution time, measured
 * from `post_publish_logs` on 2026-08-19. Every scheduler delivery in production
 * (`job_run_id` beginning `cron:`) took **49-79 s** after its tick, over three
 * distinct ticks. 120 s is roughly 1.5x the observed maximum, on a deliberately
 * small sample.
 *
 * ## Erring long is the correct direction, and the reason is asymmetric
 *
 * Too SHORT and every healthy post is labelled late, which teaches people to
 * ignore the label — and then the one post that genuinely failed is ignored
 * too. Too LONG and a genuine failure waits a few more minutes to be named,
 * when it is already late and nothing further is lost. A warning that cries
 * wolf on the happy path is worse than one that is slightly slow, so when the
 * allowance is uncertain it is rounded up.
 *
 * Not a UI nicety: this is the difference between a status the reader can trust
 * and one they learn to scroll past.
 */

/**
 * The publish sweep's cron period, in minutes. MUST match the `*&#47;N` in the
 * `/api/cron/sweeps` schedule in `apps/web/vercel.json`; the test enforces it.
 */
export const SWEEP_INTERVAL_MINUTES = 5

/**
 * How long the sweep itself may take once a tick has started, in seconds.
 * MEASURED 49-79 s across three production ticks; see the note above for why
 * this is rounded up rather than fitted.
 */
export const SWEEP_RUNTIME_ALLOWANCE_SECONDS = 120

/**
 * The whole window: the longest wait for a tick, plus the longest the tick's own
 * work may take. A post is not late until this has elapsed.
 *
 * Worst case is a full interval, not half: a post scheduled one second after a
 * tick waits the entire period for the next one.
 */
export const SCHEDULE_DELIVERY_WINDOW_MS =
  (SWEEP_INTERVAL_MINUTES * 60 + SWEEP_RUNTIME_ALLOWANCE_SECONDS) * 1000

/**
 * Has this post outlived the window in which a healthy delivery would have
 * happened?
 *
 * Strictly greater, matching the boundary `autoPublishTruth` already kept at
 * zero: a post at the exact edge of the window has not yet been missed, and
 * "nothing was published" must be a claim we can prove.
 *
 * Returns `false` for anything unreadable, which is the same floor the caller
 * applies elsewhere — we cannot assert a time has passed when we cannot read the
 * time.
 */
export function isPastDeliveryWindow(dueMs: number, nowMs: number): boolean {
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return false
  return dueMs + SCHEDULE_DELIVERY_WINDOW_MS < nowMs
}
