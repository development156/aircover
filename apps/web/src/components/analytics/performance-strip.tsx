import { CountUp } from '@/components/motion/count-up'
import { Unmeasured } from '@/components/design-system/absence-row'
import Link from 'next/link'

import { Card } from '@/components/ui/card'
import type { AccountAnalytics } from '@/lib/analytics/account-insights'

/**
 * Home's performance strip (reference `.card` "Performance", 754x156 at 1440).
 *
 * ── WHY IT EXISTS NOW ────────────────────────────────────────────────────────
 * Home had no metric container at all. Not an empty one — none. Earlier runs
 * classified it as "content differs" and skipped it, which is exactly the
 * reading the run-9 brief revoked: a container is STRUCTURE and must exist even
 * with nothing in it. Four slots reading "—" is honest; no card is a defect,
 * because the reader cannot tell "we measured nothing" from "this product does
 * not measure".
 *
 * ── WHY THESE FOUR METRICS AND NOT THE REFERENCE'S FOUR ──────────────────────
 * The reference shows Followers, Reach, Conversions, Revenue. Sahoda has no
 * concept of conversions or revenue — no order, no attribution, no currency
 * anywhere in the schema — so building those two slots would create containers
 * that can never be filled by anything except a fabrication.
 *
 * The four here are `INSIGHT_KEYS` from account-insights.ts: Reach, Views,
 * Accounts engaged, Interactions. Those are the keys Instagram's account-insights
 * endpoint ACTUALLY returns, verified live on 2026-08-10. Same shape as the
 * reference, same density, same four slots — filled with what this product can
 * truthfully know.
 *
 * ── WHAT IS DELIBERATELY MISSING ─────────────────────────────────────────────
 * No sparkline and no delta. The insights arrive as single values, not series,
 * and there is no prior-period read to difference against. A sparkline needs
 * points and a delta needs a previous number; inventing either is the exact
 * failure the brief names ("NEVER invent numbers, sparkline points"). The
 * follower series that DOES exist is already drawn by InstagramInsights, and
 * duplicating it here would be two charts of one number.
 *
 * Marketing Score has no source in this product at all and renders as an em
 * dash beside its label, per the brief's ruling for score-shaped containers.
 */

/** The four slots, in reading order. Labels match account-insights' INSIGHT_KEYS. */
const SLOTS = ['Reach', 'Views', 'Accounts engaged', 'Interactions'] as const

/**
 * Why there is no number, in the reader's terms.
 *
 * One sentence per state of the union, never a shared "no data". "Nothing is
 * connected" and "this build cannot reach Instagram" are different facts and
 * only one of them is the reader's to act on.
 */
function reasonFor(analytics: AccountAnalytics): string | null {
  switch (analytics.kind) {
    case 'ready':
      return analytics.insights.length > 0
        ? null
        : 'Instagram has not reported these for this window yet.'
    case 'not-connected':
      return 'Connect a channel to start measuring.'
    case 'reconnect':
      return 'Reconnect Instagram to start measuring again.'
    case 'not-configured':
      return 'This environment has no metrics connection, so no request went out.'
    case 'unreadable':
      return 'Could not read these just now. Refresh to try again.'
  }
}

export function PerformanceStrip({
  analytics,
  reasonStated = false,
  detailsLink = true,
}: {
  analytics: AccountAnalytics
  /**
   * "Details" goes to /analytics, which is where this strip ALSO renders.
   *
   * MEASURED on the after-frames 2026-08-23: on /analytics the card's only link
   * was an accent-coloured "Details" pointing at the page the reader is already
   * on. A control that says what happens when it is used (docs/37 §17) cannot be
   * one that does nothing, and a self-link is the quietest dead end there is —
   * it does not error, it just fails to go anywhere. /home keeps it, because
   * from there it is a real destination.
   */
  detailsLink?: boolean
  /**
   * The page has already said WHY there is nothing here, once, at the top.
   *
   * Default `false`, so /home — which has no page-level statement — keeps the
   * sentence and this component's standalone contract is unchanged. Only
   * /analytics opts in, where `ReadinessLine` carries the same claim with the
   * remedy attached, and repeating it under four dashes is one of the six
   * restatements docs/40 §3.1 counted.
   */
  reasonStated?: boolean
}) {
  // A label -> value map, so a slot with no reported key falls to the em dash
  // rather than shifting the other three along.
  const values = new Map<string, number>(
    analytics.kind === 'ready' ? analytics.insights.map((i) => [i.label, i.value]) : [],
  )
  const reason = reasonStated ? null : reasonFor(analytics)

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-h3">Performance</h2>
        {detailsLink ? (
          <Link
            href="/analytics"
            className="card-link rounded-sm type-meta font-semibold text-accent transition-micro hover:underline"
          >
            Details
          </Link>
        ) : null}
      </div>

      <dl className="grid grid-cols-4 gap-x-4 gap-y-3 max-wide:grid-cols-2 max-narrow:grid-cols-2">
        {SLOTS.map((label) => {
          const value = values.get(label)
          return (
            <div key={label} className="min-w-0">
              <dt className="truncate type-meta text-muted">{label}</dt>
              {/* `type-h2`, not `text-[19px] leading-7 font-[650] tracking-[-0.02em]`.
                  19px is not a step on the scale and never was — docs/26 §5
                  exists because sizes hand-written at a call site drift from
                  every other call site that hand-wrote one. */}
              <dd className="type-h2 tabular-nums text-ink">
                {value === undefined ? (
                  // The UNMEASURED mark, not a bare em dash. The slot is real
                  // and the reading has not arrived (docs/26 §4) — and unlike a
                  // dash it carries an accessible name, so the absence is
                  // legible to a screen reader instead of being skipped.
                  <Unmeasured what={label} />
                ) : (
                  // THE call site docs/26 §8.1 was written for. These are
                  // SETTLED account readings for a closed period: finished, and
                  // they will not move again while you look at them. Contrast
                  // the credit balance, which may not count and is guarded
                  // against it by count-up.guard.test.ts.
                  <CountUp value={value} />
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      {/* ── MARKETING SCORE IS GONE, AND THAT IS THE THIRD TIME ────────────
          The reference has a Marketing Score ring. This comment used to argue
          that "there is no score in this product — no inputs, no formula,
          nothing that could compute one — so the slot keeps its label and says
          so". The premise is right and the conclusion was wrong, in exactly the
          way `100 of —` was wrong and the four Brand Brain tiles were wrong.

          docs/26 §4 has three absence states and this is the THIRD: the
          quantity does not exist. It renders NOTHING. A dash is the mark for a
          slot that is real and not yet filled, so using it here told every
          reader their marketing score was pending when in fact this product has
          no such number and never had one.

          Not showing a ring at 0% was the right instinct. Deleting the row is
          the same instinct carried one step further. */}
      {reason ? <p className="type-meta text-muted">{reason}</p> : null}
    </Card>
  )
}
