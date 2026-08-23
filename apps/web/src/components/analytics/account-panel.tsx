import { CardEmpty } from '@/components/empty-state'
import Link from 'next/link'

import { Panel, PanelHead } from '@/components/charts/panel'
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
/** One remedy link, written once — four states used to carry four copies. */
function ConnectionsLink() {
  return (
    <Link
      href="/connections"
      className="inline-flex items-center rounded-sm type-sm font-semibold text-accent underline-offset-2 hover:underline max-narrow:min-h-[44px]"
    >
      Open connections
    </Link>
  )
}

export function AccountPanel({
  analytics,
  reasonStated = false,
}: {
  analytics: AccountAnalytics
  /**
   * The page stated the cause and the remedy once, at the top.
   *
   * Default `false` keeps every existing caller — and `analytics.test.tsx`'s
   * four state assertions — on the standalone contract described above, where
   * answering silence to "how is my account doing" would be worse than
   * answering "you have not connected one". When the PAGE has already answered
   * it, a second copy of the same sentence and a second copy of the same link
   * is not honesty, it is repetition: two of the six statements docs/40 §3.1
   * counted were this card and the strip above it saying "connect a channel".
   */
  reasonStated?: boolean
}) {
  /**
   * The quiet form: the container stands, the claim is a slot-level statement,
   * and the remedy is not offered twice. Used only when the page carried it.
   */
  if (reasonStated && (analytics.kind === 'not-connected' || analytics.kind === 'reconnect')) {
    return (
      <Panel className="space-y-3">
        <PanelHead title="Instagram account" />
        <CardEmpty align="start" body="Followers and reach appear here once an account is linked." />
      </Panel>
    )
  }

  if (analytics.kind === 'not-connected') {
    return (
      <Panel className="space-y-3">
        <PanelHead title="Instagram account" />
        <CardEmpty
          align="start"
          lead="Connect Instagram to see followers and reach."
          body="Account insights come from the connected account, not from your posts, so there’s nothing to show until one is linked."
          action={<ConnectionsLink />}
        />
      </Panel>
    )
  }

  if (analytics.kind === 'reconnect') {
    return (
      <Panel className="space-y-3">
        <PanelHead title="Instagram account" />
        <CardEmpty
          align="start"
          lead="Reconnect Instagram to see followers and reach."
          body="The connection expired, so we can’t read metrics until it’s renewed. Your posts and their own metrics are unaffected."
          action={<ConnectionsLink />}
        />
      </Panel>
    )
  }

  // Distinct from `unreadable` below: there a call went out and did not come
  // back, here no call was ever made. "Refresh to try again" is the right advice
  // for the first and useless for the second, so this branch does not offer it.
  if (analytics.kind === 'not-configured') {
    return (
      <Panel className="space-y-3">
        <PanelHead title="Instagram account" />
        <CardEmpty
          align="start"
          lead="Sahoda can’t read account insights here."
          body="Your account is connected. This environment has no metrics connection, so no request went out. Your posts and their own metrics are unaffected."
        />
      </Panel>
    )
  }

  if (analytics.kind === 'unreadable') {
    return (
      <Panel className="space-y-3">
        <PanelHead title="Instagram account" />
        {/* Says we could not look. Pointedly does NOT say the account is empty —
            an unreadable call and an account with no followers are the same
            blank space and completely different facts. */}
        <CardEmpty
          align="start"
          lead="Couldn’t read your account insights just now."
          body="Refresh to try again."
        />
      </Panel>
    )
  }

  const { followers, gained, lost, insights, followerLagHours, insightsLagHours, nothingReported } =
    analytics

  return (
    <Panel className="space-y-5">
      <PanelHead title="Instagram account" sub="last 30 days" />

      <section aria-label="Followers" className="space-y-2">
        {followers.length === 0 ? (
          <>
            <p className="type-body text-ink">
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
        <p className="type-meta text-muted">{accountLagCopy(followerLagHours)}</p>
      </section>

      {insights.length > 0 ? (
        <section aria-label="Account insights" className="space-y-2 border-t border-line pt-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            {insights.map((tile) => (
              <div key={tile.label}>
                <dt className="type-meta text-muted">{tile.label}</dt>
                <dd className="text-[20px] leading-7 font-bold tabular-nums text-ink">
                  {tile.value.toLocaleString('en-IN')}
                </dd>
              </div>
            ))}
          </dl>
          {/* The insights delay — the LONGER one. Reusing the follower delay here
              would claim these figures are a day fresher than they are. */}
          <p className="type-meta text-muted">{accountLagCopy(insightsLagHours)}</p>
        </section>
      ) : null}
    </Panel>
  )
}
