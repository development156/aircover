import { Panel, PanelHead, ChartSparse } from '@/components/charts/panel'
import { PLATFORM_LABELS } from '@/components/posts/channel-label'
import type { ZernioInboxTopAccount } from '@sahoda/publishing'
import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * The leaderboard, widest table on the tab.
 *
 * ── WHY THE MEDIAN COLUMN CHECKS `repliedCount`, NOT JUST THE NUMBER ─────────
 * Zernio's own OpenAPI note: a `medianResponseSeconds` of 0 with
 * `repliedCount: 0` means "never replied", not "replies instantly". Rendering
 * the raw 0 would say the opposite of what happened, so this checks the
 * witness field before the figure it witnesses.
 *
 * ── WHY THE HEADERS USE `sr-only` RATHER THAN `max-wide:hidden` ──────────────
 * `two-widths-is-not-responsive` (memory): hiding a column with `hidden`
 * classes drops it from the accessible name entirely at that width. This table
 * scrolls horizontally instead (`overflow-x-auto`), so every column stays in
 * the DOM and in the accessibility tree at every width.
 */
export function TopAccountsTable({ accounts }: { accounts: readonly ZernioInboxTopAccount[] }) {
  if (accounts.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Top accounts by volume" />
        <ChartSparse compact>No account has any inbox activity in this window yet.</ChartSparse>
      </Panel>
    )
  }

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Top accounts by volume"
        sub="Ranked by total messages, received and sent, in this window."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1">
          <thead>
            <tr className="type-meta text-muted">
              <th scope="col" className="px-2 py-1 text-left">
                Account
              </th>
              <th scope="col" className="px-2 py-1 text-left">
                Platform
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Received
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Sent
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Conversations
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Median response
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.accountId} className="type-body text-ink">
                <td className="px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate font-[550]">{account.displayName}</p>
                    <p className="truncate type-meta text-muted">@{account.username}</p>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  {PLATFORM_LABELS[account.platform as ConnectionPlatform] ?? account.platform}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{account.received}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{account.sent}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{account.conversations}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {account.repliedCount > 0 ? (
                    formatSeconds(account.medianResponseSeconds)
                  ) : (
                    <span aria-hidden>—</span>
                  )}
                  {account.repliedCount === 0 ? (
                    <span className="sr-only">Never replied in this window</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
