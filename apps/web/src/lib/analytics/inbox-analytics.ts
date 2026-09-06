import 'server-only'

import {
  ScopeError,
  type ZernioInboxHeatmapBucket,
  type ZernioInboxResponseTime,
  type ZernioInboxSourceRow,
  type ZernioInboxTopAccount,
  type ZernioInboxVolume,
} from '@sahoda/publishing'

import { countAccounts } from '@/lib/inbox/read'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { profileForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'

/**
 * Server reads for /analytics's "Inbox analytics" tab, against Zernio's
 * `/analytics/inbox/*` surface.
 *
 * ── THE SAME FOUR-WAY SPLIT AS `account-insights.ts` ─────────────────────────
 * `not-connected` is a claim about the customer's accounts, so it is answered from
 * `countAccounts` (which already filters to Zernio-backed connections via
 * `external_account->>profileId`) BEFORE any transport is consulted — the ordering
 * `not-connected-vs-unreadable.test.ts` pins on the sibling file. `not-configured`
 * is kept apart from `unreadable`: a missing `ZERNIO_API_KEY` means no request went
 * out, so "try again" is advice that cannot work. `null` from `countAccounts` means
 * "we did not find out how many accounts exist", never zero — it resolves to
 * `unreadable`, never to `not-connected`.
 */

export interface InboxAnalyticsFilter {
  days: 7 | 30 | 90
  platform: string | null
  accountId: string | null
}

export interface InboxAnalyticsReady {
  kind: 'ready'
  volume: ZernioInboxVolume
  heatmap: ZernioInboxHeatmapBucket[]
  sources: ZernioInboxSourceRow[]
  responseTime: ZernioInboxResponseTime
  topAccounts: ZernioInboxTopAccount[]
}

export type InboxAnalytics =
  | InboxAnalyticsReady
  | { kind: 'not-connected' }
  | { kind: 'not-configured' }
  | { kind: 'unreadable' }

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Read every panel of the inbox analytics tab in one round trip.
 *
 * Five independent calls, none informing another, so they run inside a single
 * `Promise.all` — the ratchet `read-waterfall.test.ts` enforces on this route holds
 * a sequential version to the same standard as its posting sibling.
 */
export async function readInboxAnalytics(
  filter: InboxAnalyticsFilter,
  now: Date = new Date(),
): Promise<InboxAnalytics> {
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return { kind: 'unreadable' }
  if (workspace.status === 'none') return { kind: 'not-connected' }
  const workspaceId = workspace.workspace.id

  // ── ASK WHO IS CONNECTED BEFORE ASKING THE TRANSPORT ────────────────────────
  // Same order as `readInstagramAnalytics`, and the same reason: "no account
  // connected" must never depend on whether a publishing key happens to exist in
  // this environment, or every fresh preview reports a failure that never occurred.
  const connectedAccounts = await countAccounts('conversations')
  if (connectedAccounts === null) return { kind: 'unreadable' }
  if (connectedAccounts === 0) return { kind: 'not-connected' }

  const reads = zernioClientReads()
  if (!reads) return { kind: 'not-configured' }

  let profile
  try {
    profile = await profileForWorkspace(workspaceId)
  } catch (error) {
    if (error instanceof ScopeError) return { kind: 'not-connected' }
    return { kind: 'unreadable' }
  }

  const fromDate = isoDaysAgo(now, filter.days)
  const baseFilter = {
    fromDate,
    platform: filter.platform ?? undefined,
    accountId: filter.accountId ?? undefined,
  }

  try {
    const [volume, heatmap, sources, responseTime, topAccounts] = await Promise.all([
      reads.inboxVolume(profile, baseFilter),
      reads.inboxHeatmap(profile, baseFilter),
      reads.inboxSourceBreakdown(profile, baseFilter),
      reads.inboxResponseTime(profile, baseFilter),
      reads.inboxTopAccounts(profile, { ...baseFilter, limit: 10 }),
    ])
    return {
      kind: 'ready',
      volume,
      heatmap: heatmap.buckets,
      sources: sources.sources,
      responseTime,
      topAccounts: topAccounts.accounts,
    }
  } catch (error) {
    console.error(
      '[analytics] inbox analytics read failed',
      error instanceof Error ? error.message : 'unknown',
    )
    return { kind: 'unreadable' }
  }
}
