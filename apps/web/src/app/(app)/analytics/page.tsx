import Link from 'next/link'
import { ChartColumn, Plug } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { CreatePostButton } from '@/components/posts/create-post-button'
import { PageTitle } from '@/components/page-title'
import { PerformanceStrip } from '@/components/analytics/performance-strip'
import { BestPerforming } from '@/components/analytics/best-performing'
import { PerformanceOverTime } from '@/components/analytics/performance-over-time'
import { AccountPanel } from '@/components/analytics/account-panel'
import { ChannelTable } from '@/components/analytics/channel-table'
import { PostTable } from '@/components/analytics/post-table'
import { ANALYTICS_METRIC_CALLS, readAnalyticsPage } from '@/lib/analytics/page-data'
import { readMetricSeries } from '@/lib/analytics/series'

export const metadata = { title: 'Analytics' }

/**
 * Analytics — per-post performance, per-account insights, and the comparison.
 *
 * ── WHAT THIS PAGE IS ALLOWED TO SAY ─────────────────────────────────────────
 * Every rule the post cards already followed, and one more that only appears once
 * numbers are put next to each other. The card rules: a zero is never rendered for a
 * measurement that did not happen; `lastUpdated` is a POLL stamp and proves a sync
 * ran, not that anything was measured; a payload of zeroes inside a platform's
 * reporting window is pending, not measured; and a channel whose window we do not
 * know can never earn a zero at all.
 *
 * The new one: an ABSENT number must not become a zero by being aggregated or
 * ordered. A total that skipped two pending posts is a subtotal wearing a total's
 * clothes, and a pending post sorted to the bottom of a ranking has been called the
 * worst performer without a zero ever being drawn. `lib/analytics/compare.ts` owns
 * that refusal; this page only renders its verdicts.
 *
 * Three independent sections. The account read and the post read fail separately, so
 * a broken Instagram connection costs the account card and nothing else.
 */
export default async function AnalyticsPage() {
  const { rows, posts, account, hasPublished } = await readAnalyticsPage()

  // A FOURTH independent read, for the same reason the other three are independent:
  // the history lives in its own table and, until the founder applies migration
  // 20260819000100, that table does not exist. A read that cannot happen must cost
  // this one card and nothing else on the page.
  const series = await readMetricSeries('reach')

  /**
   * ── FIVE APOLOGIES, OR ONE ANSWER ────────────────────────────────────────
   *
   * Each container below argues correctly for its own existence, and MEASURED at
   * 1024 on a workspace with nothing, the five of them together said this:
   *
   *   Performance          four absence rules + "Connect a channel to start
   *                        measuring."
   *   Instagram account    "Connect Instagram to see followers and reach."
   *   Performance over time"Sahoda has started keeping a history. Nothing has
   *                        been measured yet..."
   *   Best performing      "Nothing has been measured yet, so there is nothing
   *                        to rank."
   *   Nothing published yet"Analytics start once a post goes out on a channel."
   *
   * 1250px of page to deliver one fact. Every sentence is true and the sum is a
   * screen that reads as five separate failures rather than one honest state.
   * This is the composition problem the individual comments could not see: each
   * card was reviewed against its own gate, never against its four neighbours.
   *
   * docs/26 §4 already rules on it. "Not yet measured" is for a slot that is
   * REAL and whose reading has not arrived. With no account linked and nothing
   * published, none of these quantities can have a value from any source — so
   * the third state applies, and the third state says OMIT THE SLOT.
   *
   * `PerformanceStrip` is ungated on `hasPublished` on purpose and that ruling
   * stands: account insights do not need this workspace to have published. What
   * they DO need is a linked account. So the gate here is not "has published",
   * it is "could any of this ever have had a value" — and both halves have to be
   * false before anything is hidden.
   */
  const nothingCanBeMeasured = account.kind === 'not-connected' && !hasPublished

  if (nothingCanBeMeasured) {
    return (
      <div className="space-y-grid">
        <PageTitle>Analytics</PageTitle>
        {/* One state, and it names BOTH doors. The old copy offered only "write
            a post", which is the second step: a post that goes out on no channel
            is still never measured, so sending a new workspace to the composer
            alone routes them the long way round to the same empty page. */}
        <EmptyState
          icon={ChartColumn}
          title="Nothing to measure yet"
          body="Analytics start when a post goes out on a connected channel. Until then there is nothing to measure — which is different from measuring nothing."
          action={
            /* ONE primary (docs/26 §1.5). Connecting leads because analytics
               cannot exist without it; writing a post is the hairline second. */
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/connections"
                className={buttonVariants({ variant: 'primary' })}
                data-guide="analytics.connect"
              >
                <Plug size={16} strokeWidth={2} aria-hidden />
                Connect a channel
              </Link>
              <CreatePostButton variant="secondary" />
            </div>
          }
          tip="Sahoda: Reach and followers come from the channel itself, so one connection starts them even before you post."
        />
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Analytics</PageTitle>
        {hasPublished ? (
          <p className="text-[12.5px] text-muted">
            {posts.length} published {posts.length === 1 ? 'post' : 'posts'} · {rows.length}{' '}
            {rows.length === 1 ? 'channel' : 'channels'}
          </p>
        ) : null}
      </div>

      {/* The reference opens this page with a KPI strip (1150x103) and the app
          had none in ANY state. It is NOT gated on `hasPublished`, and that is
          the point: these are ACCOUNT insights — reach, views, accounts engaged,
          interactions — which Instagram reports for the account itself and which
          do not require this workspace to have published anything. Hiding them
          behind a post count would withhold numbers that already exist.

          The tables below stay gated, because those genuinely are per-post rows
          and there is nothing to tabulate until a post goes out. */}
      <PerformanceStrip analytics={account} />

      <AccountPanel analytics={account} />

      {/* The reference's two remaining containers, side by side beneath the
          account panel. Best performing is WIRED — rankBy already refuses to rank
          an unmeasured row. Performance over time is wired too now, and draws
          nothing until there is a history to draw: before the migration it renders
          the same container it always did. See the component for the five things
          it refuses to plot. */}
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-grid max-wide:grid-cols-1">
        <PerformanceOverTime series={series} />
        <BestPerforming rows={rows} />
      </div>

      {hasPublished ? (
        <>
          <ChannelTable rows={rows} />
          <PostTable rows={rows} />
          {/* The cap is STATED, not silently applied. Rows past it come back
              `not-loaded`, and they are already counted in every denominator on
              this page — but a reader who sees "18 of 30 reported" deserves to
              know that some of the twelve were never asked rather than assuming
              all twelve are still pending. */}
          {rows.length > ANALYTICS_METRIC_CALLS ? (
            <p className="text-[12px] text-muted">
              Metrics are read for the first {ANALYTICS_METRIC_CALLS} published channels on this
              page. The rest are listed as not loaded — open a post to read its own.
            </p>
          ) : null}
        </>
      ) : (
        /* ── THE HIERARCHY INVERSION ────────────────────────────────────────
           docs/27 §1: "the largest, highest-contrast, most colour-saturated
           element on the page carries the LEAST information. The eye lands on
           the emptiest thing first."

           That was literally true. This block — a 44px orange marker tile, a
           bold heading and centred prose — was the loudest object on /analytics
           and it offered NO action at all: `EmptyState`'s `action` was simply
           omitted, so the one element the eye went to first was the one element
           you could not do anything with.

           It keeps its size. What changes is that it now carries the most
           information on the screen instead of the least: the remedy. Loudest
           and most useful are the same object again, which is the only
           arrangement in which loud is correct.

           The action is `CreatePostButton` — the route that works ON THIS
           BRANCH. `/posts/[id]` does not handle `id="new"` here, so linking a
           reader there would be a dead end. */
        <EmptyState
          icon={ChartColumn}
          title="Nothing published yet"
          body="Analytics start once a post goes out on a channel. Until then there is nothing to measure — which is different from measuring nothing."
          action={<CreatePostButton />}
        />
      )}
    </div>
  )
}
