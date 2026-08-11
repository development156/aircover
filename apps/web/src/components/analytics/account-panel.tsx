import Link from 'next/link'

import { Card, CardLabel } from '@/components/ui/card'
import { FollowerChart, FollowerFlow } from '@/components/analytics/follower-chart'
import { accountLagCopy } from '@/lib/analytics/copy'
import type { AccountAnalytics } from '@/lib/analytics/account-insights'

/**
 * The Instagram account half of the page: followers, and the headline account figures.
 *
 * ── EVERY STATE, INCLUDING THE ONES HOME HIDES ───────────────────────────────
 * `InstagramInsights` on Home renders NOTHING when nothing is connected, and that is
 * right there: Home is designed for empty first, and a grid of dashes reads broken.
 *
 * Here it is wrong. This is the page a customer opens to ask "how are my accounts
 * doing", and answering silence to that question is worse than answering "you have
 * not connected one". So `not-connected` renders, with the action attached.
 *
 * The two delays are stated SEPARATELY, beside the numbers each one governs. They
 * are different endpoints with different `dataDelay` fields — 24h for followers, 48h
 * for insights, both verbatim from the live API on 2026-08-11 — and printing the
 * shorter one under the older figures would claim a freshness Instagram never
 * offered.
 */
export function AccountPanel({ analytics }: { analytics: AccountAnalytics }) {
  if (analytics.kind === 'not-connected') {
    return (
      <Card className="space-y-2">
        <CardLabel>Instagram account</CardLabel>
        <p className="text-[14px] text-ink">Connect Instagram to see followers and reach.</p>
        <p className="text-[12.5px] text-muted">
          Account insights come from the connected account, not from your posts, so there’s nothing
          to show until one is linked.
        </p>
        <Link
          href="/connections"
          className="inline-flex text-[13px] font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open connections
        </Link>
      </Card>
    )
  }

  if (analytics.kind === 'reconnect') {
    return (
      <Card className="space-y-2">
        <CardLabel>Instagram account</CardLabel>
        <p className="text-[14px] text-ink">Reconnect Instagram to see followers and reach.</p>
        <p className="text-[12.5px] text-muted">
          The connection expired, so we can’t read metrics until it’s renewed. Your posts and their
          own metrics are unaffected.
        </p>
        <Link
          href="/connections"
          className="inline-flex text-[13px] font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open connections
        </Link>
      </Card>
    )
  }

  if (analytics.kind === 'unreadable') {
    return (
      <Card className="space-y-2">
        <CardLabel>Instagram account</CardLabel>
        {/* Says we could not look. Pointedly does NOT say the account is empty —
            an unreadable call and an account with no followers are the same
            blank space and completely different facts. */}
        <p className="text-[14px] text-ink">Couldn’t read your account insights just now.</p>
        <p className="text-[12.5px] text-muted">Refresh to try again.</p>
      </Card>
    )
  }

  const { followers, gained, lost, insights, followerLagHours, insightsLagHours, nothingReported } =
    analytics

  return (
    <Card className="space-y-5">
      <CardLabel>Instagram account · last 30 days</CardLabel>

      <section aria-label="Followers" className="space-y-2">
        {followers.length === 0 ? (
          <>
            <p className="text-[14px] text-ink">
              {/* NOT "0 followers". Instagram told us nothing, which is not a count.
                  Worded to hold whether this is too-early or never-coming — there is
                  no connection timestamp here to tell those apart. */}
              {nothingReported
                ? 'No follower history to show yet.'
                : 'Instagram hasn’t reported follower history for this window.'}
            </p>
          </>
        ) : (
          <>
            <FollowerChart points={followers} />
            <FollowerFlow gained={gained} lost={lost} />
          </>
        )}
        <p className="text-[12px] text-muted">{accountLagCopy(followerLagHours)}</p>
      </section>

      {insights.length > 0 ? (
        <section aria-label="Account insights" className="space-y-2 border-t border-line pt-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {insights.map((tile) => (
              <div key={tile.label}>
                <dt className="text-[12px] text-muted">{tile.label}</dt>
                <dd className="text-[20px] leading-7 font-bold tabular-nums text-ink">
                  {tile.value.toLocaleString('en-IN')}
                </dd>
              </div>
            ))}
          </dl>
          {/* The insights delay — the LONGER one. Reusing the follower delay here
              would claim these figures are a day fresher than they are. */}
          <p className="text-[12px] text-muted">{accountLagCopy(insightsLagHours)}</p>
        </section>
      ) : null}
    </Card>
  )
}
