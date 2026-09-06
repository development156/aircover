import Link from 'next/link'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { RANGE_DAYS, hrefFor, type AnalyticsView, type RangeKey } from '@/lib/analytics/view-params'
import { cn } from '@/lib/utils'
import type { Channel } from '@sahoda/shared'

/**
 * THE TWO FILTERS, AS LINKS. No client JS, because every value here already
 * lives in the URL (`view-params.ts`) and a link that changes it is a
 * navigation, not a state update. `hrefFor` keeps the neighbour filter intact
 * so picking a channel never resets the range and picking a range never
 * resets the channel.
 *
 * Range is never marked with colour alone: the current entry gets
 * `aria-current="page"` and a filled, ringed treatment, not just an accent
 * text colour a colour-blind reader could not tell apart from the rest.
 */
export function ViewControls({
  view,
  channels,
}: {
  view: AnalyticsView
  channels: readonly Channel[]
}) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-x-6 gap-y-3">
      <nav aria-label="Date range" className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_DAYS) as unknown as RangeKey[]).map((days) => {
          const current = !view.custom && view.days === Number(days)
          return (
            <Link
              key={days}
              href={hrefFor(view, { range: String(days), from: undefined, to: undefined })}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'rounded-sm px-3 py-1.5 type-meta font-[550] transition-micro',
                current
                  ? 'surface-ring bg-tint-50 text-accent dark:bg-s2'
                  : 'text-muted hover:text-ink',
              )}
            >
              {RANGE_DAYS[days]}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Channel" className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefFor(view, { channel: undefined })}
          aria-current={view.channel === null ? 'page' : undefined}
          className={cn(
            'rounded-sm px-3 py-1.5 type-meta font-[550] transition-micro',
            view.channel === null
              ? 'surface-ring bg-tint-50 text-accent dark:bg-s2'
              : 'text-muted hover:text-ink',
          )}
        >
          All channels
        </Link>
        {channels.map((channel) => {
          const current = view.channel === channel
          return (
            <Link
              key={channel}
              href={hrefFor(view, { channel })}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'rounded-sm px-3 py-1.5 type-meta font-[550] transition-micro',
                current
                  ? 'surface-ring bg-tint-50 text-accent dark:bg-s2'
                  : 'text-muted hover:text-ink',
              )}
            >
              {CHANNEL_LABELS[channel] ?? channel}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
