import { ReportExample } from '@/components/analytics/report-example'
import { InboxFilters } from '@/components/analytics/inbox/inbox-filters'
import { InboxKpiStrip } from '@/components/analytics/inbox/inbox-kpi-strip'
import { MessagesOverTime } from '@/components/analytics/inbox/messages-over-time'
import { MessagesPerPlatform } from '@/components/analytics/inbox/messages-per-platform'
import { ResponseTime } from '@/components/analytics/inbox/response-time'
import { TopAccountsTable } from '@/components/analytics/inbox/top-accounts-table'
import { InboxHeatmap } from '@/components/analytics/inbox/inbox-heatmap'
import { readInboxAnalytics } from '@/lib/analytics/inbox-analytics'
import type { InboxAnalyticsView } from '@/lib/analytics/inbox-view-params'
import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * The "Inbox analytics" tab: Zernio's inbox surface, evidenced the same way
 * the posting tab evidences reach — every figure carries what it is a number
 * OF, and the four-way split (`ready` / `not-connected` / `not-configured` /
 * `unreadable`) is `readInboxAnalytics`'s own, not re-derived here.
 */
export async function InboxAnalytics({ view }: { view: InboxAnalyticsView }) {
  const analytics = await readInboxAnalytics({
    days: view.days,
    platform: view.platform,
    accountId: view.accountId,
  })

  if (analytics.kind === 'not-connected') {
    return (
      <div className="space-y-grid">
        <InboxFilters view={view} platforms={[]} accounts={[]} />
        <ReportExample
          headline="No inbox account connected yet"
          detail="This is a reading of your messages, comments and reviews. Connect a channel that sends inbox activity to Sahoda and this tab fills in."
          action={{ label: 'Connect a channel', href: '/connections' }}
        />
      </div>
    )
  }

  if (analytics.kind === 'not-configured') {
    return (
      <div className="space-y-grid">
        <InboxFilters view={view} platforms={[]} accounts={[]} />
        <ReportExample
          headline="Inbox analytics is not set up in this environment"
          detail="Sahoda has an account connected but no reader configured here, so no request went out. This is ours to fix, not something reloading can change."
          action={null}
        />
      </div>
    )
  }

  if (analytics.kind === 'unreadable') {
    return (
      <div className="space-y-grid">
        <InboxFilters view={view} platforms={[]} accounts={[]} />
        <ReportExample
          headline="Sahoda could not read your inbox numbers just now"
          detail="The request went out and came back without an answer, so this is not a reading of your inbox. Nothing is wrong with it. Refresh to try again."
          action={null}
        />
      </div>
    )
  }

  const platforms = [
    ...new Set(analytics.volume.byPlatform.map((p) => p.platform as ConnectionPlatform)),
  ]
  const accounts = analytics.topAccounts.map((a) => ({
    accountId: a.accountId,
    label: a.displayName,
  }))

  return (
    <div className="space-y-grid">
      <InboxFilters view={view} platforms={platforms} accounts={accounts} />

      <InboxKpiStrip summary={analytics.volume.summary} responseTime={analytics.responseTime} />

      <MessagesOverTime days={analytics.volume.timeseries} />

      <MessagesPerPlatform byPlatform={analytics.volume.byPlatform} />

      <div className="grid grid-cols-2 gap-grid max-wide:grid-cols-1">
        <ResponseTime responseTime={analytics.responseTime} />
        <TopAccountsTable accounts={analytics.topAccounts} />
      </div>

      <InboxHeatmap buckets={analytics.heatmap} />
    </div>
  )
}
