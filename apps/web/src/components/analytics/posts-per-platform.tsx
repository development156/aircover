import { Bars, type BarPoint } from '@/components/charts/bars'
import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { ChannelMark } from '@/components/posts/channel-mark'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { ChannelCount, WeekCount } from '@/lib/analytics/distribution'

/**
 * HOW MUCH WENT OUT, AND WHERE. THE TWO COUNT CHARTS.
 *
 * ── A COUNT IS NOT A READING, AND THESE ARE THE ONLY CHARTS THAT KNOW IT ─────
 * Every other chart on this page draws a measurement the platform gave us, and
 * refuses to draw a zero for a day nothing came back. These draw rows in our
 * own publish log, which is complete: a week with no column had no posts. So a
 * zero here is knowledge and is rendered as such. `distribution.ts` carries the
 * argument at length.
 *
 * ── WHY THE PLATFORM CHART IS NOT `Bars` ─────────────────────────────────────
 * `Bars` labels the two ENDS of its axis and nothing between them, which is
 * right for thirty dates at 1440 and wrong for four channels that each need
 * their own name. It also cannot put a logo under a column. So this one paints
 * its own columns and follows the same three rules: neutral `--ink-mute` fill
 * because lines take the accent and bars do not, a measured zero as a
 * `--line-firm` stub rather than nothing, and the peak named in words.
 *
 * The weekly chart IS `Bars`, unchanged, because its axis is two dates.
 */
export function PostsPerPlatform({ counts }: { counts: readonly ChannelCount[] }) {
  if (counts.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Posts per channel" />
        <ChartSparse compact>
          Nothing published in this period, so there is no split to draw. Each channel gets a column
          here as soon as a post goes out on it.
        </ChartSparse>
      </Panel>
    )
  }

  const peak = Math.max(...counts.map((count) => count.posts))
  const total = counts.reduce((sum, count) => sum + count.posts, 0)

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Posts per channel"
        sub="Each post counted once on every channel it went to, so the columns add up to more than the number of posts when one post went to two places."
      />

      <figure className="flex flex-col">
        <div className="flex h-[168px] items-end gap-3 max-narrow:h-[132px]">
          {counts.map((count, index) => (
            <div
              key={count.channel}
              className="enter-step flex min-w-0 flex-1 flex-col items-center justify-end gap-2 self-stretch"
              style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
            >
              <span className="type-meta font-[550] tabular-nums text-ink">{count.posts}</span>
              <span
                data-bar={count.posts === 0 ? 'zero' : 'value'}
                className={`w-full max-w-[28px] rounded-pill ${
                  count.posts === 0 ? 'bg-line-firm' : 'bg-ink-mute'
                }`}
                style={{
                  // `peak || 1` only avoids a divide by zero; every numerator
                  // there is 0, so no height is ever invented.
                  height: `${((count.posts / (peak || 1)) * 100).toFixed(2)}%`,
                  minHeight: '3px',
                }}
              />
            </div>
          ))}
        </div>

        {/* The logo IS the axis label, which is the one place in this system
            platform brand colour is allowed (docs/26 §1.6, `ChannelMark`). The
            name goes with it rather than being left to the logo alone: a mark
            nobody recognises is not a label. */}
        <div className="mt-2 flex gap-3">
          {counts.map((count) => (
            <div key={count.channel} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <ChannelMark channel={count.channel} size={16} />
              <span className="truncate type-meta text-muted">
                {CHANNEL_LABELS[count.channel] ?? count.channel}
              </span>
            </div>
          ))}
        </div>

        <figcaption className="sr-only">
          {total} {total === 1 ? 'publish' : 'publishes'} across {counts.length}{' '}
          {counts.length === 1 ? 'channel' : 'channels'}:{' '}
          {counts
            .map((count) => `${CHANNEL_LABELS[count.channel] ?? count.channel} ${count.posts}`)
            .join(', ')}
          .
        </figcaption>
      </figure>
    </Panel>
  )
}

/**
 * Posts per week of the chosen window.
 *
 * The columns are anchored to the window rather than to Monday, so only the
 * last one can be short. When it is, the sentence under the chart says so: a
 * two-day column beside four seven-day ones is a calendar, not a fall in
 * output, and nothing else on the chart could tell the reader that.
 */
export function PostsOverTime({ weeks }: { weeks: readonly WeekCount[] }) {
  const short = weeks[weeks.length - 1]

  if (weeks.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Posts over time" />
        <ChartSparse compact>
          This window is too short to split into weeks. Widen the date range above to see how much
          went out week by week.
        </ChartSparse>
      </Panel>
    )
  }

  const points: BarPoint[] = weeks.map((week) => ({
    label: week.from,
    // Never null. A week with nothing in it is a measured zero — see the file
    // header — and `Bars` draws that as a stub rather than as a gap.
    value: week.posts,
  }))

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Posts over time"
        sub="Distinct posts published each week of this window, counted once however many channels they went to."
      />
      <Bars points={points} unit="posts" />
      {short && short.days < 7 ? (
        <p className="type-meta text-muted tabular-nums">
          The last column covers {short.days} {short.days === 1 ? 'day' : 'days'}, not seven, so it
          is shorter for a reason that is not your posting.
        </p>
      ) : null}
    </Panel>
  )
}
