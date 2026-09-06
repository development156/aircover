import type { Route } from 'next'

/**
 * The state of /analytics's "Inbox analytics" tab, in the URL.
 *
 * Same reasoning as `view-params.ts`'s `AnalyticsView`: a filtered view must
 * be a link somebody can share, and a malformed query string must fall back
 * to the default rather than produce a window nobody asked for.
 */
export const INBOX_RANGE_DAYS = {
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
} as const

export type InboxRangeKey = keyof typeof INBOX_RANGE_DAYS

export const DEFAULT_INBOX_RANGE: InboxRangeKey = 30

export interface InboxAnalyticsView {
  days: InboxRangeKey
  platform: string | null
  accountId: string | null
}

export interface RawInboxParams {
  tab?: string
  window?: string
  platform?: string
  account?: string
}

export function resolveInboxView(params: RawInboxParams): InboxAnalyticsView {
  const asked = Number(params.window)
  const days = asked in INBOX_RANGE_DAYS ? (asked as InboxRangeKey) : DEFAULT_INBOX_RANGE
  const platform = params.platform && params.platform.trim() !== '' ? params.platform : null
  const accountId = params.account && params.account.trim() !== '' ? params.account : null
  return { days, platform, accountId }
}

/**
 * The query string for the inbox tab with one thing changed, `tab=inbox`
 * always carried so a filter link never falls back to the posting tab.
 */
export function inboxHrefFor(
  view: InboxAnalyticsView,
  change: Partial<{ window: string; platform: string; account: string }>,
): Route {
  const next = new URLSearchParams()
  next.set('tab', 'inbox')

  const window = 'window' in change ? change.window : String(view.days)
  const platform = 'platform' in change ? change.platform : (view.platform ?? undefined)
  const account = 'account' in change ? change.account : (view.accountId ?? undefined)

  if (window && Number(window) !== DEFAULT_INBOX_RANGE) next.set('window', window)
  if (platform) next.set('platform', platform)
  if (account) next.set('account', account)

  return `/analytics?${next.toString()}` as Route
}

/** The link to the posting tab, preserving nothing from the inbox filters. */
export function postingTabHref(): Route {
  return '/analytics' as Route
}
