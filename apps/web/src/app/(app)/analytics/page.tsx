import { ChartColumn } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { PerformanceStrip } from '@/components/analytics/performance-strip'
import { BestPerforming, PerformanceOverTime } from '@/components/analytics/best-performing'
import { AccountPanel } from '@/components/analytics/account-panel'
import { ChannelTable } from '@/components/analytics/channel-table'
import { PostTable } from '@/components/analytics/post-table'
import { ANALYTICS_METRIC_CALLS, readAnalyticsPage } from '@/lib/analytics/page-data'

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
          account panel. Best performing is WIRED — rankBy already refuses to
          rank an unmeasured row. Performance over time is a container only:
          nothing in this product stores a metric history. See the component. */}
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-grid max-wide:grid-cols-1">
        <PerformanceOverTime />
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
        <EmptyState
          icon={ChartColumn}
          title="Nothing published yet"
          body="Analytics start once a post goes out on a channel. Until then there is nothing to measure — which is different from measuring nothing."
        />
      )}
    </div>
  )
}
