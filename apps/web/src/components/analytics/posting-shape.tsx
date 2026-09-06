import { ChannelSchema } from '@sahoda/shared'

import { Bars, type BarPoint } from '@/components/charts/bars'
import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { TrendArea, type TrendPoint } from '@/components/charts/trend-area'
import { ChannelMark } from '@/components/posts/channel-mark'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { FORMATS, FORMAT_LABELS, type FormatBreakdown } from '@/lib/analytics/content-format'
import type { FollowerSeries, PostingAbsence, Section } from '@/lib/analytics/posting-insights'
import { MIN_SERIES_DAYS } from '@/lib/analytics/series'
import type { ZernioDecayBucket, ZernioFrequencyRow } from '@sahoda/publishing'

/**
 * THE SHAPE OF THIS SHOP'S POSTING: followers per channel, what it posts, and
 * two cards that are honest about never having been proven.
 *
 * ── THE FOUR ABSENCES, ONCE, FOR ALL FOUR CARDS ──────────────────────────────
 * `not-connected`, `not-configured` and `unreadable` are three different claims
 * and only one of them earns a retry. They are written here once rather than
 * per card, because four cards each phrasing the page's single shared cause is
 * the exact defect `readiness.ts` exists to stop, and it is reachable again
 * every time a section is added.
 */
function absenceSentence(absence: PostingAbsence, subject: string): string {
  switch (absence) {
    case 'not-connected':
      return `${subject} come from the platforms themselves, and no account is connected that reports them.`
    case 'not-configured':
      // NO REMEDY. Reloading cannot add a key to a deployment.
      return `This copy of Sahoda has no publishing key set, so no request for ${subject.toLowerCase()} went out. Nothing is wrong with your accounts.`
    case 'unreadable':
      return `Sahoda could not read ${subject.toLowerCase()} just now, so this is not a reading of your accounts. Reload to try again.`
  }
}

function label(platform: string): string {
  const channel = ChannelSchema.safeParse(platform).data
  return channel ? (CHANNEL_LABELS[channel] ?? platform) : platform
}

function mark(platform: string) {
  const channel = ChannelSchema.safeParse(platform).data
  return channel ? <ChannelMark channel={channel} size={14} /> : null
}

/**
 * Follower evolution, ONE LINE PER CHANNEL.
 *
 * ── AN ACCOUNT WITH NO HISTORY IS NOT AN ACCOUNT AT ZERO ─────────────────────
 * Zernio refreshes follower counts once a day, so an account connected this
 * week genuinely has one point or none. A single point is a READING and is
 * printed as one, with no line and no change figure: the vocabulary of change
 * around one number claims two readings and an interval between them, and
 * `follower-chart.tsx` already refuses that for the Instagram card. Same rule,
 * per channel.
 */
export function FollowerEvolution({ section }: { section: Section<FollowerSeries[]> }) {
  if (section.kind === 'absent') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Followers by channel" />
        <ChartSparse compact>{absenceSentence(section.absence, 'Follower counts')}</ChartSparse>
      </Panel>
    )
  }

  if (section.value.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Followers by channel" />
        <ChartSparse compact>
          Sahoda asked your connected accounts and none of them reported a follower count for this
          period.
        </ChartSparse>
      </Panel>
    )
  }

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Followers by channel"
        sub="One line per connected account. Counts are refreshed once a day by the platform, so a line moves at most once a day."
      />
      <div className="grid grid-cols-2 gap-grid max-narrow:grid-cols-1">
        {section.value.map((series) => (
          <FollowerCard key={series.accountId} series={series} />
        ))}
      </div>
    </Panel>
  )
}

/** Internal coordinate space, matching `follower-chart.tsx`. */
const W = 300
const H = 72

function FollowerCard({ series }: { series: FollowerSeries }) {
  const values = series.points.map((point) => point.followers)
  const last = values[values.length - 1] ?? series.currentFollowers

  return (
    <article className="surface-ring rounded-card bg-surface p-4">
      <h3 className="flex items-center gap-2 type-eyebrow text-muted">
        {mark(series.platform)}
        {label(series.platform)}
        {series.username ? <span className="truncate normal-case">{series.username}</span> : null}
      </h3>

      <p className="mt-2 type-h2 text-ink">
        {last === null ? (
          <span className="type-sm text-muted">—</span>
        ) : (
          <span className="tabular-nums">{last.toLocaleString('en-IN')}</span>
        )}
      </p>

      {values.length < 2 ? (
        // One reading is a reading, not a trend. The same refusal
        // `follower-chart.tsx` makes, and the same reason.
        <p className="mt-1 type-meta text-muted">
          {values.length === 1
            ? 'One day of history so far. Not enough to show a trend.'
            : 'No history for this account yet. The platform reports a count once a day.'}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Followers on ${label(series.platform)} across ${values.length} days, from ${values[0]!.toLocaleString('en-IN')} on ${series.points[0]!.date} to ${last!.toLocaleString('en-IN')} on ${series.points[series.points.length - 1]!.date}.`}
            className="mt-2 h-[72px] w-full"
          >
            <path
              d={`M${values
                .map((value, index) => {
                  const min = Math.min(...values)
                  const span = Math.max(...values) - min || 1
                  const x = index * (W / (values.length - 1))
                  const y = H - ((value - min) / span) * H
                  return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
                })
                .join('L')}`}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* The axis is scaled to this account's own range, not to zero, so
              both ends are printed. An unlabelled zoomed axis is its own lie. */}
          <p className="mt-1 flex justify-between type-meta text-muted tabular-nums">
            <span>
              {series.points[0]!.date} · {Math.min(...values).toLocaleString('en-IN')}
            </span>
            <span>
              {series.points[series.points.length - 1]!.date} ·{' '}
              {Math.max(...values).toLocaleString('en-IN')}
            </span>
          </p>
        </>
      )}
    </article>
  )
}

/**
 * What this shop posts: photos, video, or words.
 *
 * The only chart on this page whose source is entirely our own database, so
 * "words only" is a finding rather than a guess. `content-format.ts` explains
 * why an attachment nobody could classify is its own count and not folded into
 * that one.
 */
export function ContentFormats({ breakdown }: { breakdown: FormatBreakdown }) {
  if (breakdown.kind === 'unreadable') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="What you posted" />
        <ChartSparse compact>
          Sahoda could not read what was attached to these posts, so this is not a count of your
          photos and videos. Reload to try again.
        </ChartSparse>
      </Panel>
    )
  }

  if (breakdown.kind === 'empty') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="What you posted" />
        <ChartSparse compact>
          Nothing published in this period, so there is nothing to break down by format.
        </ChartSparse>
      </Panel>
    )
  }

  const points: BarPoint[] = FORMATS.map((format) => ({
    label: FORMAT_LABELS[format],
    // A real count from a complete table. A format with none of them is a
    // measured zero, which `Bars` draws as a stub rather than a gap.
    value: breakdown.counts[format],
  }))

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="What you posted"
        sub="Read from what is attached to each post, so this is a count of your own library rather than anything a platform reported."
      />
      <Bars points={points} unit="posts" />
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {FORMATS.map((format) => (
          <li key={format} className="type-meta text-muted">
            {FORMAT_LABELS[format]}{' '}
            <span className="tabular-nums font-[550] text-ink">{breakdown.counts[format]}</span>
          </li>
        ))}
      </ul>
      {breakdown.counts.unknown > 0 ? (
        <p className="type-meta text-muted tabular-nums">
          {breakdown.counts.unknown} of {breakdown.posts} carry an attachment Sahoda could not
          identify. They are counted apart rather than called words only, which would say you
          published something you did not.
        </p>
      ) : null}
    </Panel>
  )
}

/** Below this a cadence row is one or two weeks and is not evidence of anything. */
export const MIN_CADENCE_WEEKS = 3

/**
 * Posting frequency against engagement.
 *
 * ── THE SAMPLE IS THE WHOLE STORY AND IT IS ON THE SCREEN ────────────────────
 * A row is "weeks where you posted N times, and the average engagement rate
 * across them". A row backed by one week is a single week wearing the clothes
 * of a finding, and plotting it beside a row backed by eighteen gives them the
 * same height. Rows under the floor are LISTED with their week count rather
 * than dropped: their absence would be invisible and their presence in a chart
 * would be a claim.
 *
 * NEVER PROVEN LIVE. See `posting-insights.ts`.
 */
export function PostingCadence({ section }: { section: Section<ZernioFrequencyRow[]> }) {
  if (section.kind === 'absent') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="How often you post, against how it does" />
        <ChartSparse compact>{absenceSentence(section.absence, 'These figures')}</ChartSparse>
      </Panel>
    )
  }

  const solid = section.value.filter((row) => row.weeksCount >= MIN_CADENCE_WEEKS)
  const thin = section.value.filter((row) => row.weeksCount < MIN_CADENCE_WEEKS)

  if (section.value.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="How often you post, against how it does" />
        <ChartSparse compact>
          Sahoda asked and your accounts hold no week-by-week history yet. This fills in once you
          have posted across a few weeks.
        </ChartSparse>
      </Panel>
    )
  }

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="How often you post, against how it does"
        sub="Weeks grouped by how many posts went out, and the average engagement rate across them."
      />
      {solid.length === 0 ? (
        <ChartSparse compact>
          Every cadence here is backed by fewer than {MIN_CADENCE_WEEKS} weeks, which is one or two
          weeks and not a pattern. The rows are below, with their samples.
        </ChartSparse>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-4 type-eyebrow text-muted">
                  Channel
                </th>
                <th scope="col" className="py-2 pl-4 type-eyebrow text-muted">
                  <span className="block text-right">Posts a week</span>
                </th>
                <th scope="col" className="py-2 pl-4 type-eyebrow text-muted">
                  <span className="block text-right">Engagement rate</span>
                </th>
                <th scope="col" className="py-2 pl-4 type-eyebrow text-muted">
                  <span className="block text-right">Weeks seen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {solid.map((row) => (
                <tr
                  key={`${row.platform}-${row.postsPerWeek}`}
                  className="border-b border-line last:border-0"
                >
                  <th scope="row" className="py-2 pr-4 text-left type-sm font-[550] text-ink">
                    <span className="flex items-center gap-2">
                      {mark(row.platform)}
                      {label(row.platform)}
                    </span>
                  </th>
                  <td className="py-2 pl-4 text-right type-sm tabular-nums text-ink">
                    {row.postsPerWeek}
                  </td>
                  <td className="py-2 pl-4 text-right type-sm tabular-nums text-ink">
                    {row.avgEngagementRate === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      `${row.avgEngagementRate.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
                    )}
                  </td>
                  <td className="py-2 pl-4 text-right type-sm tabular-nums text-muted">
                    {row.weeksCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {thin.length > 0 ? (
        <p className="type-meta text-muted tabular-nums">
          {thin.length} more {thin.length === 1 ? 'cadence is' : 'cadences are'} backed by fewer
          than {MIN_CADENCE_WEEKS} weeks and are left out. One week is not a pattern, and a row that
          looked like the others would be read as one.
        </p>
      ) : null}

      <p className="type-meta text-muted">
        This is a description of what happened, not advice. Posting more often may be the cause or
        the consequence of a good week, and these figures cannot tell the two apart.
      </p>
    </Panel>
  )
}

/**
 * How engagement accumulates after a post goes out.
 *
 * Each bucket is the average SHARE of a post's final engagement that had
 * arrived by then, so the bars are percentages and they are of different
 * populations: `postCount` moves between buckets because a post published
 * yesterday has no "30d+" reading yet. That is stated rather than smoothed.
 *
 * NEVER PROVEN LIVE. See `posting-insights.ts`.
 */
export function EngagementAccumulation({ section }: { section: Section<ZernioDecayBucket[]> }) {
  if (section.kind === 'absent') {
    return (
      <Panel className="space-y-4">
        <PanelHead title="When your engagement arrives" />
        <ChartSparse compact>{absenceSentence(section.absence, 'These figures')}</ChartSparse>
      </Panel>
    )
  }

  const measured = section.value.filter((bucket) => bucket.avgPctOfFinal !== null)

  if (section.value.length === 0 || measured.length < MIN_SERIES_DAYS) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="When your engagement arrives" />
        <ChartSparse compact>
          {section.value.length === 0
            ? 'Sahoda asked and your accounts hold no arrival history yet. This fills in once posts have been out long enough to be measured twice.'
            : `Only ${measured.length} of the seven time windows have been measured, which is not enough to describe how your engagement arrives.`}
        </ChartSparse>
      </Panel>
    )
  }

  const points: TrendPoint[] = measured.map((bucket, index) => ({
    x: index,
    y: bucket.avgPctOfFinal!,
    label: bucket.label,
  }))
  const smallest = Math.min(...measured.map((bucket) => bucket.postCount))
  const largest = Math.max(...measured.map((bucket) => bucket.postCount))

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="When your engagement arrives"
        sub="The average share of a post's final likes, comments, shares and saves that had arrived by each point after it went out."
      />
      <TrendArea
        points={points}
        unit="per cent of final engagement"
        pointNoun="windows"
        gradientId="decay-trend"
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {measured.map((bucket) => (
          <li key={bucket.label} className="type-meta text-muted">
            {bucket.label}{' '}
            <span className="tabular-nums font-[550] text-ink">
              {bucket.avgPctOfFinal!.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%
            </span>
          </li>
        ))}
      </ul>
      {smallest !== largest ? (
        // The population moves between buckets: a post published yesterday has
        // no "30d+" reading. Said out loud rather than letting the curve imply
        // one population throughout.
        <p className="type-meta text-muted tabular-nums">
          Measured across {smallest} to {largest} posts depending on the window, because a post has
          to be old enough to have a reading in one.
        </p>
      ) : null}
    </Panel>
  )
}
