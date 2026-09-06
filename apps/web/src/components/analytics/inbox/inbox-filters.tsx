import Link from 'next/link'

import { PLATFORM_LABELS } from '@/components/posts/channel-label'
import {
  INBOX_RANGE_DAYS,
  inboxHrefFor,
  type InboxAnalyticsView,
  type InboxRangeKey,
} from '@/lib/analytics/inbox-view-params'
import { cn } from '@/lib/utils'
import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * Window, platform, and account filters, as links.
 *
 * No client JS: every value already lives in the URL and a click is a
 * navigation, not a state update. `inboxHrefFor` keeps the other two filters
 * intact, so choosing a platform never resets the window or the account.
 */
export function InboxFilters({
  view,
  platforms,
  accounts,
}: {
  view: InboxAnalyticsView
  /** The platforms actually present in this window's data, in the order to show them. */
  platforms: readonly ConnectionPlatform[]
  /** Accounts present in this window's top-accounts leaderboard. */
  accounts: readonly { accountId: string; label: string }[]
}) {
  const pillClass = (current: boolean) =>
    cn(
      'rounded-sm px-3 py-1.5 type-meta font-[550] transition-micro',
      current ? 'surface-ring bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:text-ink',
    )

  return (
    <div className="flex flex-wrap items-start justify-end gap-x-6 gap-y-3">
      <nav aria-label="Date range" className="flex flex-wrap items-center gap-2">
        {(Object.keys(INBOX_RANGE_DAYS) as unknown as InboxRangeKey[]).map((days) => {
          const current = view.days === Number(days)
          return (
            <Link
              key={days}
              href={inboxHrefFor(view, { window: String(days) })}
              aria-current={current ? 'page' : undefined}
              className={pillClass(current)}
            >
              {INBOX_RANGE_DAYS[days]}
            </Link>
          )
        })}
      </nav>

      {platforms.length > 0 ? (
        <nav aria-label="Platform" className="flex flex-wrap items-center gap-2">
          <Link
            href={inboxHrefFor(view, { platform: undefined })}
            aria-current={view.platform === null ? 'page' : undefined}
            className={pillClass(view.platform === null)}
          >
            All platforms
          </Link>
          {platforms.map((platform) => {
            const current = view.platform === platform
            return (
              <Link
                key={platform}
                href={inboxHrefFor(view, { platform })}
                aria-current={current ? 'page' : undefined}
                className={pillClass(current)}
              >
                {PLATFORM_LABELS[platform] ?? platform}
              </Link>
            )
          })}
        </nav>
      ) : null}

      {accounts.length > 0 ? (
        <nav aria-label="Account" className="flex flex-wrap items-center gap-2">
          <Link
            href={inboxHrefFor(view, { account: undefined })}
            aria-current={view.accountId === null ? 'page' : undefined}
            className={pillClass(view.accountId === null)}
          >
            All accounts
          </Link>
          {accounts.map((account) => {
            const current = view.accountId === account.accountId
            return (
              <Link
                key={account.accountId}
                href={inboxHrefFor(view, { account: account.accountId })}
                aria-current={current ? 'page' : undefined}
                className={pillClass(current)}
              >
                {account.label}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
