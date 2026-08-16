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

export function PerformanceStrip({ analytics }: { analytics: AccountAnalytics }) {
  // A label -> value map, so a slot with no reported key falls to the em dash
  // rather than shifting the other three along.
  const values = new Map<string, number>(
    analytics.kind === 'ready' ? analytics.insights.map((i) => [i.label, i.value]) : [],
  )
  const reason = reasonFor(analytics)

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Performance</h2>
        <Link
          href="/analytics"
          className="rounded-sm text-[12.5px] font-semibold text-accent transition-micro hover:underline"
        >
          Details
        </Link>
      </div>

      <dl className="grid grid-cols-4 gap-x-4 gap-y-3 max-wide:grid-cols-2 max-narrow:grid-cols-2">
        {SLOTS.map((label) => {
          const value = values.get(label)
          return (
            <div key={label} className="min-w-0">
              <dt className="truncate text-[12px] text-muted">{label}</dt>
              <dd className="text-[19px] leading-7 font-[650] tracking-[-0.02em] tabular-nums text-ink">
                {value === undefined ? '—' : value.toLocaleString('en-IN')}
              </dd>
            </div>
          )
        })}
      </dl>

      {/* The reference's Marketing Score ring. There is no score in this product
          — no inputs, no formula, nothing that could compute one — so the slot
          keeps its label and says so, rather than showing a ring at 0% that
          would read as a real and very bad score. */}
      <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-3">
        <span className="text-[12px] text-muted">Marketing score</span>
        <span className="text-[13px] font-[650] tabular-nums text-muted">—</span>
      </div>

      {reason ? <p className="text-[12px] text-muted">{reason}</p> : null}
    </Card>
  )
}
