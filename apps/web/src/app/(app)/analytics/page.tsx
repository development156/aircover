import type { Route } from 'next'

import { PageTitle } from '@/components/page-title'
import { AccountPanel } from '@/components/analytics/account-panel'
import { ReadinessLine } from '@/components/analytics/readiness-line'
import { ChannelCards } from '@/components/analytics/channel-cards'
import { PerformanceOverTime } from '@/components/analytics/performance-over-time'
import { PostRows } from '@/components/analytics/post-rows'
import { ReportExample } from '@/components/analytics/report-example'
import { TimingHeatmap } from '@/components/analytics/timing-heatmap'
import { ViewControls } from '@/components/analytics/view-controls'
import { changeFor, type Headline } from '@/lib/analytics/headline'
import { HeadlineStrip } from '@/components/analytics/headline-strip'
import { ACCOUNT_READ_TTL_MINUTES } from '@/lib/analytics/account-insights'
import { analyticsReadiness } from '@/lib/analytics/readiness'
import { readAnalyticsPage } from '@/lib/analytics/page-data'
import {
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  isSortKey,
  type SortDirection,
} from '@/lib/analytics/rows'
import { readMetricSeries } from '@/lib/analytics/series'
import { hrefFor, resolveView, windowLabel } from '@/lib/analytics/view-params'
import { readWindow } from '@/lib/analytics/window-data'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

export const metadata = { title: 'Analytics' }

/**
 * ANALYTICS — THE EVIDENCE, NOT THE STORY.
 *
 * ── THE DIVISION THIS PAGE EXISTS ON ─────────────────────────────────────────
 * `/report` is the narrative: what happened, what Sahoda decided, one thing to
 * do. This page is where somebody checks the working. It must never try to be
 * the story, and it must never leave a bare number for the reader to interpret
 * either — so every figure here carries what it is a number OF, and a comparison
 * against this workspace's own history.
 *
 * That is the whole reason it is two pages. A screen that both concludes and
 * evidences ends up doing neither: the conclusion gets buried in tables and the
 * tables get bent into supporting the conclusion.
 *
 * ── WHAT USED TO BE HERE, AND WHY IT WENT ────────────────────────────────────
 * A stack of weekly report cards, each opening with a verdict sentence. It was
 * the right idea on the wrong page — `/report` already tells that story, and two
 * screens narrating the same week is exactly how they come to disagree. The
 * arithmetic behind it stayed and became the shared foundation: `timing.ts` is
 * the one selector both pages read for the best slot, so the grid below and the
 * scheduling sentence on the report cannot contradict each other.
 *
 * ── EVERY NUMBER ON THIS PAGE IS READ AT ONE AGE ─────────────────────────────
 * Stored values are running lifetime totals, so a post published on the 1st has
 * thirty days of accumulating on one published on the 30th. Comparing them raw
 * measures how long ago something went out and reports it as how well it did.
 * `readWindow` picks one age and every section uses it, which is also what makes
 * the sections add up against each other.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string
    from?: string
    to?: string
    channel?: string
    sort?: string
    dir?: string
    page?: string
  }>
}) {
  const params = await searchParams
  const view = resolveView(params)

  /**
   * ── FOUR INDEPENDENT READS ───────────────────────────────────────────────
   * None of them depends on another, so none of them waits for another. A
   * hiccup in any one costs its own section and nothing else: every read below
   * returns its own absence rather than rejecting.
   */
  const [window, { account, hasPublished }, series] = await Promise.all([
    readWindow(view),
    readAnalyticsPage(),
    readMetricSeries('reach'),
  ])

  const sort = isSortKey(params.sort) ? params.sort : DEFAULT_SORT
  const direction: SortDirection = params.dir === 'asc' ? 'asc' : DEFAULT_DIRECTION
  const page = Number(params.page) || 1

  const label = windowLabel(view)
  const ready = window.kind === 'ready' ? window : null

  /**
   * ── ONE REASON, COMPUTED ONCE, FOR THE WHOLE SCREEN ───────────────────────
   * docs/40 §3.4 ruling 1. This mechanism existed, was fully tested, and was
   * DISCONNECTED by the 2026-08-29 rebuild: the collapse survived only as a
   * whole-page early return gated on `!hasPublished`, so a workspace one step
   * further along — posts out, nothing connected, where a beta account sits
   * after its first hour — got the same apology from five sections at once,
   * each diagnosing the page's single shared cause on its own.
   *
   * `measuredRows` is the only thing that proves measurement: rows carrying a
   * real number right now, not rows that exist.
   */
  const readiness = analyticsReadiness({
    account,
    hasPublished,
    measuredRows: ready ? ready.rows.filter((row) => row.reachAtAge !== null).length : 0,
  })

  /**
   * When the account figures were asked for. A reading is reused for
   * `ACCOUNT_READ_TTL_MINUTES` per server instance, so the panel below may be
   * showing numbers older than this render; the line under it says how old.
   * `null` when there is no reading to date, in which case the panel's own
   * state sentence is the whole story.
   */
  const accountReadAt =
    account.kind === 'ready' && account.readAt
      ? formatScheduledAt(account.readAt, window.kind === 'ready' ? window.timezone : null)
      : null
  const channels = ready ? [...new Set(ready.rows.map((row) => row.channel))].sort() : []

  /**
   * The four headline numbers, and the two this product cannot measure.
   *
   * Built here rather than in the strip so the absence of a figure is a decision
   * with a reason attached, visible beside the reason it is absent, rather than
   * a branch inside a component that renders whatever it is handed.
   */
  const headlines: Headline[] = [
    {
      id: 'reached',
      label: 'People reached',
      meaning: 'How many people saw your posts, counted once per post they saw.',
      value: null,
      absence: 'not-measured',
      caveat:
        'Reach is reported for each post separately, and this product cannot add those up into a figure for a period without counting the same person twice.',
      change: { kind: 'no-previous' },
    },
    {
      id: 'replied',
      label: 'People who replied',
      meaning: 'How many people wrote back to you under a post.',
      value: null,
      absence: 'not-measured',
      caveat:
        'Sahoda records likes, comments, shares and saves as one figure and does not keep them apart, so it cannot tell you how many people replied.',
      change: { kind: 'no-previous' },
    },
    {
      id: 'enquiries',
      label: 'Enquiries',
      meaning: 'People who got in touch through your site or your inbox.',
      value: null,
      absence: 'not-measured',
      caveat:
        'Enquiries are recorded, but nothing links one to the post that brought it, so this figure would not be about your posting.',
      change: { kind: 'no-previous' },
    },
    {
      id: 'published',
      label: 'Posts published',
      meaning: 'How many of your posts went out in this period.',
      value: ready ? ready.postsPublished : null,
      absence: ready ? undefined : 'unreadable',
      caveat: 'Counts each post once, however many channels it went to.',
      change: ready
        ? changeFor(ready.postsPublished, ready.postsPublishedPrevious, ready.weeksOfHistory)
        : { kind: 'no-previous' },
    },
  ]

  if (window.kind === 'no-workspace') {
    return (
      <div className="space-y-grid">
        <Header label={label} timezone={null} view={view} channels={[]} />
        <ReportExample
          headline="There is no workspace here yet to measure"
          detail="Sahoda measures a workspace. This account does not have one yet, so there is nothing for these numbers to be about."
          action={null}
        />
      </div>
    )
  }

  if (window.kind === 'unreadable') {
    return (
      <div className="space-y-grid">
        <Header label={label} timezone={null} view={view} channels={[]} />
        <ReportExample
          headline="Sahoda could not read your numbers just now"
          detail="The request went out and came back without an answer, so this is not a reading of your posts. Nothing is wrong with them. Refresh to try again."
          action={null}
        />
      </div>
    )
  }

  /**
   * Nothing has ever published, so every section below would be a frame around
   * the same sentence. ONE card, and then the page itself drawn from a made-up
   * business so a reader can see the shape of what they are about to get.
   */
  if (!hasPublished && window.rows.length === 0 && window.postsPublished === 0) {
    return (
      <div className="space-y-grid">
        <Header label={label} timezone={window.timezone} view={view} channels={[]} />
        <ReportExample
          headline="Nothing to measure yet"
          detail="Reach and followers come from the channel itself, so connecting an account starts the numbers even before you post."
          action={{ label: 'Connect a channel', href: '/connections' }}
        />
      </div>
    )
  }

  const rowHref = (change: { sort?: string; dir?: string; page?: string }): Route => {
    const base = hrefFor(view, {})
    const query = new URLSearchParams(base.includes('?') ? base.slice(base.indexOf('?') + 1) : '')
    const next = { sort, dir: direction, page: String(page), ...change }
    if (next.sort !== DEFAULT_SORT) query.set('sort', next.sort)
    else query.delete('sort')
    if (next.dir !== DEFAULT_DIRECTION) query.set('dir', next.dir)
    else query.delete('dir')
    if (next.page !== '1') query.set('page', next.page)
    else query.delete('page')
    const text = query.toString()
    return (text ? `/analytics?${text}` : '/analytics') as Route
  }

  return (
    <div className="space-y-grid">
      <Header label={label} timezone={window.timezone} view={view} channels={channels} />

      {/* Renders NOTHING once anything on the page has a number. Every section
          below defers to it rather than re-diagnosing. */}
      <ReadinessLine readiness={readiness} />

      <HeadlineStrip headlines={headlines} windowLabel={label} />

      <PerformanceOverTime series={series} />

      {/* ── WHAT YOUR WEEK LOOKS LIKE ───────────────────────────────────────
          The most actionable view on the page, and the one the CMO Report's
          timing sentence is derived from. Both read `bestSlotSentence` off the
          same selector, so the grid here and the sentence there cannot say
          different things about the same business.

          It deliberately ignores the date filter above it: a best slot is a
          claim about the business, and one that moved whenever somebody changed
          a date range would not be a pattern. The line under the grid says so. */}
      <section aria-labelledby="timing" className="surface-ring rounded-card bg-surface p-5">
        <h2 id="timing" className="type-h3 text-ink">
          What your week looks like
        </h2>
        <p className="mt-1 max-w-[62ch] type-meta text-muted">
          Average reach by the day and the part of day a post went out, across everything you have
          published rather than only this period.
        </p>
        <div className="mt-4">
          <TimingHeatmap timing={window.timing} timezone={window.timezone} />
        </div>
      </section>

      <PostRows
        rows={window.rows}
        sort={sort}
        direction={direction}
        page={page}
        hrefFor={rowHref}
        ageDays={window.ageDays}
        timezone={window.timezone}
      />

      <ChannelCards rows={window.rows} ageDays={window.ageDays} />

      {/* ── ACCOUNT HEALTH, LAST AND ON PURPOSE ──────────────────────────────
          Followers appear here and nowhere else on this page. A follower count
          is the number every other tool puts at the top, and it is the one
          figure on this screen that does not describe whether the work is
          working. Putting it beside reach would teach the reader to read it as
          performance. */}
      <section aria-labelledby="account-health" className="space-y-3">
        <h2 id="account-health" className="type-h3 text-ink">
          Account health
        </h2>
        {/* Pinned to `false` by the rebuild, which is how the collapse was
            lost: the card then re-stated the cause and re-offered the link the
            line above already carries. */}
        <AccountPanel analytics={account} reasonStated={readiness.kind !== 'measuring'} />
        {accountReadAt ? (
          <p className="type-meta text-muted tabular-nums">
            Read from Instagram at {accountReadAt}. Sahoda asks again once a reading is{' '}
            {ACCOUNT_READ_TTL_MINUTES} minutes old.
          </p>
        ) : null}
      </section>
    </div>
  )
}

/**
 * The header, and the one place the clock is named.
 *
 * Every date and every "Tuesday morning" on this page is in the workspace's own
 * zone, and a page that makes wall-clock claims without saying whose clock is
 * making a claim it cannot support for a reader in another country.
 */
function Header({
  label,
  timezone,
  view,
  channels,
}: {
  label: string
  timezone: string | null
  view: ReturnType<typeof resolveView>
  channels: readonly import('@sahoda/shared').Channel[]
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <PageTitle>Analytics</PageTitle>
        <p className="mt-1 type-sm text-muted">
          The numbers behind your CMO report.
          {timezone ? ` Dates and times are shown in ${timezone}.` : ''}
        </p>
        <p className="sr-only">Showing {label}.</p>
      </div>
      <ViewControls view={view} channels={channels} />
    </div>
  )
}
