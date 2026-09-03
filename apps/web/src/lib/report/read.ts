/**
 * THE SHAPES THE REPORT COMPOSER READS.
 *
 * ── A BASELINE IS THREE WEEKS OF THE SAME MEASUREMENT, NOT A GUESS ───────────
 * "Up 34% on your normal" is a claim about the reader's business, so a normal
 * has to be a measurement before it can be a comparison: the mean of the three
 * complete weeks BEFORE the reported one, each computed exactly the way the
 * reported week is computed. Fewer than that and there is no normal — the reader
 * is handed `null` and `compose.ts` says "first weeks, still learning your
 * normal" rather than dividing by whatever it has.
 *
 * ── A FAILED READ IS `unreadable`, NEVER ZERO ────────────────────────────────
 * Zero people reached is a sentence about somebody's business. Not knowing is a
 * sentence about us. The two are never merged here.
 *
 * The readers that once filled these shapes (`readReach`, `readReplies`,
 * `readEnquiries`, `readPlanTimes`, `readPostTitles`) were removed 2026-09-03:
 * `/report` reads through `lib/analytics/window-data` and `lib/loop/report`
 * instead, and nothing called them.
 */

export type WeeklyRead =
  | {
      status: 'ok'
      value: number
      baseline: number | null
      /** Posts that went out in the reported week, measured or not. */
      postsRan: number
      /** Posts that went out AND came back with a reading. */
      postsMeasured: number
      /** Each post of the reported week with its highest reading. */
      posts: ReadonlyArray<{ postId: string; title: string; channel: string; value: number }>
    }
  | { status: 'unreadable' }

export type CountRead =
  { status: 'ok'; value: number; previous: number | null } | { status: 'unreadable' }
