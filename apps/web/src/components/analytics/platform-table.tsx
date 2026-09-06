import { ChannelSchema } from '@sahoda/shared'

import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { ChannelMark } from '@/components/posts/channel-mark'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { DailyMetricsRead } from '@/lib/analytics/daily-metrics'
import { ENGAGEMENT_PARTS, type PlatformBreakdownRow } from '@/lib/analytics/platform-breakdown'

/**
 * EVERY METRIC, EVERY PLATFORM, IN ONE TABLE.
 *
 * The only place in this product where likes, comments, shares, saves, clicks
 * and views appear as themselves rather than folded into one `engagement`
 * figure. `platform-breakdown.ts` explains why every number in a row comes from
 * one source and why the rate refuses a partial numerator.
 *
 * ── A CELL WITH NO READING IS A DASH, NOT A ZERO ─────────────────────────────
 * docs/37 §4's absence mark. Ten columns is exactly where a zero would be
 * cheapest to write and most expensive to be wrong about: a platform that does
 * not report saves at all would otherwise be shown as a platform where nobody
 * ever saved anything.
 */
function Cell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="text-muted" title="Not reported.">
        —
      </span>
    )
  }
  return <>{value.toLocaleString('en-IN')}</>
}

function label(platform: string): string {
  const channel = ChannelSchema.safeParse(platform).data
  // Zernio's key when it is not one of ours (`twitter`, `tiktok`, `threads`).
  // Shown as it arrived rather than guessed at: a wrong name on a row of real
  // numbers is worse than an unfamiliar one.
  return channel ? (CHANNEL_LABELS[channel] ?? platform) : platform
}

const COLUMNS: ReadonlyArray<{ key: keyof PlatformBreakdownRow; label: string }> = [
  { key: 'posts', label: 'Posts' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
  { key: 'saves', label: 'Saves' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'views', label: 'Views' },
  { key: 'impressions', label: 'Times shown' },
  { key: 'reach', label: 'People reached' },
]

export function PlatformTable({
  read,
  rows,
  windowLabel,
}: {
  read: DailyMetricsRead
  rows: readonly PlatformBreakdownRow[]
  windowLabel: string
}) {
  if (read.kind === 'not-connected') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Every metric, by channel" />
        <ChartSparse compact>
          These come from the platforms themselves, and no account is connected that reports them.
          Connecting a channel starts this table even before you post again.
        </ChartSparse>
      </Panel>
    )
  }

  if (read.kind === 'unreadable') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Every metric, by channel" />
        <ChartSparse compact>
          Sahoda could not read these figures just now, so this is not a reading of your channels.
          Nothing is wrong with them. Reload to try again.
        </ChartSparse>
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Every metric, by channel" />
        <ChartSparse compact>
          Sahoda asked your connected accounts and none of them reported anything for{' '}
          {windowLabel.toLowerCase()}.
        </ChartSparse>
      </Panel>
    )
  }

  const partial = rows.filter((row) => row.measuredParts < ENGAGEMENT_PARTS.length)

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Every metric, by channel"
        sub="Likes, comments, shares and saves as themselves, which is the one place in Sahoda they are not added into a single figure."
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-2 pr-4 type-eyebrow text-muted">
                Channel
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className="py-2 pl-4 type-eyebrow text-muted">
                  <span className="block text-right">{column.label}</span>
                </th>
              ))}
              <th scope="col" className="py-2 pl-4 type-eyebrow text-muted">
                <span className="block text-right">Engagement rate</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.platform} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-4 text-left type-sm font-[550] text-ink">
                  <span className="flex items-center gap-2">
                    <ChannelMark
                      channel={ChannelSchema.safeParse(row.platform).data ?? 'instagram'}
                      size={14}
                    />
                    {label(row.platform)}
                  </span>
                </th>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="py-2 pl-4 text-right type-sm tabular-nums text-ink"
                  >
                    <Cell value={row[column.key] as number | null} />
                  </td>
                ))}
                <td className="py-2 pl-4 text-right type-sm tabular-nums text-ink">
                  {row.engagementRate === null ? (
                    <span
                      className="text-muted"
                      title={
                        row.measuredParts < ENGAGEMENT_PARTS.length
                          ? 'One of likes, comments, shares or saves was not reported, so a rate here would be understated.'
                          : 'No reach reported, so there is nothing to take a share of.'
                      }
                    >
                      —
                    </span>
                  ) : (
                    `${(row.engagementRate * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {partial.length > 0 ? (
        <p className="type-meta text-muted">
          A rate is left blank where one of likes, comments, shares or saves was not reported. The
          sum would be short and the rate lower than the truth, with nothing on the row to say so.
        </p>
      ) : null}

      {/* Two different questions, both answered honestly, and a reader
          comparing them deserves to know they are different. */}
      <p className="type-meta text-muted">
        Counted by the platforms, so this includes posts imported from your accounts as well as the
        ones Sahoda published. The count at the top of the page is only the ones Sahoda sent.
      </p>
    </Panel>
  )
}
