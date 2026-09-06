import type { Route } from 'next'

import { ChannelSchema, type Channel } from '@sahoda/shared'

/**
 * THE WHOLE STATE OF /analytics, IN THE URL.
 *
 * ── WHY IT IS THE URL AND NOT COMPONENT STATE ────────────────────────────────
 * Two readers use this page. The owner opens it occasionally and wants the
 * default. An agency opens it weekly, narrows to one brand and one channel, and
 * then sends that view to a client or keeps it in a tab. Component state loses
 * both of them: the link goes nowhere in particular and a refresh throws the
 * work away.
 *
 * It also makes the CMO Report able to point AT something. A claim on that page
 * can link to the evidence for it with the filter already applied, which is the
 * whole reason the two pages exist separately.
 *
 * ── EVERY VALUE IS VALIDATED, AND AN INVALID ONE FALLS BACK SILENTLY ─────────
 * Query strings are typed by people and mangled by chat apps. An unrecognised
 * range is the default range, not an error page and not an empty screen: the
 * reader asked for their numbers and a malformed parameter is not a reason to
 * refuse them. What it must NEVER do is produce a window nobody asked for and
 * label it as the one they did — so the resolved window is rendered in the
 * header, always.
 *
 * Pure: no I/O, no clock beyond the `now` it is handed, no React.
 */

/** The three presets, and the custom window the URL also accepts. */
export const RANGE_DAYS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' } as const

export type RangeKey = keyof typeof RANGE_DAYS

export const DEFAULT_RANGE: RangeKey = 30

/**
 * How far back a custom window may reach.
 *
 * Two years, the same bound the weekly read uses. Not a preference: an unbounded
 * `from` is an unbounded query, and one pasted URL would read every row this
 * workspace has ever produced.
 */
export const MAX_RANGE_DAYS = 730

export interface AnalyticsView {
  /** Days back from `to`. Always resolved, never null. */
  days: number
  /** Inclusive `YYYY-MM-DD` bounds of the window actually used. */
  from: string
  to: string
  /** Null means every channel. Never an empty list, which reads as "none". */
  channel: Channel | null
  /** True when the window came from explicit dates rather than a preset. */
  custom: boolean
}

export interface RawParams {
  range?: string
  from?: string
  to?: string
  channel?: string
}

const DAY_MS = 86_400_000

function isDay(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/**
 * Resolve a view from whatever the query string holds.
 *
 * The order matters: explicit dates win over a preset, because somebody who
 * typed both meant the dates. A half-specified custom window (one end only) is
 * NOT completed with a guess — it falls back to the preset, since inventing the
 * other end would show a window nobody chose under a label saying they did.
 */
export function resolveView(params: RawParams, now: Date = new Date()): AnalyticsView {
  const channel =
    // Parsed through the shared schema rather than against a list copied here.
    // A channel added to the product must not need a second edit in this file to
    // become filterable, and a typo in a copied list is a filter that silently
    // matches nothing.
    ChannelSchema.safeParse(params.channel).data ?? null

  if (isDay(params.from) && isDay(params.to) && params.from <= params.to) {
    const spanned = Math.round(
      (Date.parse(`${params.to}T00:00:00Z`) - Date.parse(`${params.from}T00:00:00Z`)) / DAY_MS,
    )
    if (spanned >= 0 && spanned <= MAX_RANGE_DAYS) {
      return { days: spanned + 1, from: params.from, to: params.to, channel, custom: true }
    }
  }

  const asked = Number(params.range)
  const days = asked in RANGE_DAYS ? (asked as RangeKey) : DEFAULT_RANGE
  const to = dayOf(now)
  // Inclusive of both ends, so "last 7 days" is seven days and not eight.
  const from = dayOf(new Date(now.getTime() - (days - 1) * DAY_MS))
  return { days, from, to, channel, custom: false }
}

/**
 * The query string for a view with one thing changed.
 *
 * Built from the CURRENT view rather than from scratch, so changing the channel
 * keeps the range and changing the range keeps the channel. A control that
 * silently resets its neighbour is the most common way a filtered view becomes
 * unshareable.
 */
export function hrefFor(view: AnalyticsView, change: Partial<RawParams>): Route {
  const next = new URLSearchParams()

  const range = 'range' in change ? change.range : view.custom ? undefined : String(view.days)
  const from = 'from' in change ? change.from : view.custom ? view.from : undefined
  const to = 'to' in change ? change.to : view.custom ? view.to : undefined
  const channel = 'channel' in change ? change.channel : (view.channel ?? undefined)

  if (from && to) {
    next.set('from', from)
    next.set('to', to)
  } else if (range && Number(range) !== DEFAULT_RANGE) {
    // The default is not written into the URL. A link that carries every
    // default is longer, and it pins today's default into a link that will
    // outlive it.
    next.set('range', range)
  }
  if (channel) next.set('channel', channel)

  const query = next.toString()
  // Typed routes check link targets against the real route tree, and a plain
  // `string` is rejected at every call site. The cast is made ONCE, here, where
  // the literal prefix is visible on the line above it, rather than at each of
  // the links that use it.
  return (query ? `/analytics?${query}` : '/analytics') as Route
}

/** "1 to 30 August", the window a reader is actually looking at. */
export function windowLabel(view: AnalyticsView): string {
  return view.custom
    ? `${view.from} to ${view.to}`
    : (RANGE_DAYS[view.days as RangeKey] ?? 'Custom')
}

/** Is a `YYYY-MM-DD` inside the window, ends included? */
export function withinView(day: string, view: AnalyticsView): boolean {
  return day >= view.from && day <= view.to
}

/**
 * The window immediately before this one, of the same length.
 *
 * The only comparison this product makes is against the workspace's own history,
 * and "the same length, immediately before" is the version of that a reader can
 * check for themselves.
 */
export function previousWindow(view: AnalyticsView): { from: string; to: string } {
  const from = Date.parse(`${view.from}T00:00:00Z`)
  const to = new Date(from - DAY_MS)
  const start = new Date(from - view.days * DAY_MS)
  return { from: dayOf(start), to: dayOf(to) }
}

/**
 * ── THE METRIC THE BIG CHART IS DRAWING, ALSO IN THE URL ─────────────────────
 * Same argument as the range and the channel above it: a link to "the evidence
 * for that claim" has to be able to name the metric, and a reader who narrowed
 * to saves and refreshed should still be looking at saves.
 *
 * Nine of them, from two different sources, and `daily-metrics.ts` explains why
 * that matters. Three come from `post_metric_snapshots` and six from Zernio,
 * which is invisible in a query string and is why the chart states its basis.
 */
export const METRIC_KEYS = [
  'reach',
  'impressions',
  'engagement',
  'likes',
  'comments',
  'shares',
  'saves',
  'views',
  'clicks',
] as const

export type AnalyticsMetric = (typeof METRIC_KEYS)[number]

/** The three `post_metric_snapshots` keeps. Everything else is a live read. */
export const STORED_METRICS = ['impressions', 'reach', 'engagement'] as const

export type StoredMetric = (typeof STORED_METRICS)[number]

export const DEFAULT_METRIC: AnalyticsMetric = 'reach'

export function isStoredMetric(metric: AnalyticsMetric): metric is StoredMetric {
  return (STORED_METRICS as readonly string[]).includes(metric)
}

/**
 * An unrecognised metric is the default, silently.
 *
 * The same rule the range follows: a mangled query string is not a reason to
 * refuse somebody their numbers. What it must never do is show one metric under
 * another one's name, which is why the resolved metric is on the screen as the
 * selected toggle and in the chart's own caption.
 */
export function resolveMetric(raw: string | undefined): AnalyticsMetric {
  return (METRIC_KEYS as readonly string[]).includes(raw ?? '')
    ? (raw as AnalyticsMetric)
    : DEFAULT_METRIC
}

/**
 * The link that switches the metric and keeps every other filter.
 *
 * Built on `hrefFor`, so changing the metric cannot silently reset the range or
 * the channel — the defect that makes a filtered view unshareable, described at
 * the top of this file.
 */
export function metricHref(view: AnalyticsView, metric: AnalyticsMetric): Route {
  const base = hrefFor(view, {})
  const query = new URLSearchParams(base.includes('?') ? base.slice(base.indexOf('?') + 1) : '')
  // The default is not written into the URL, for the same reason the default
  // range is not: a link that carries every default pins today's default into a
  // link that will outlive it.
  if (metric === DEFAULT_METRIC) query.delete('metric')
  else query.set('metric', metric)
  const text = query.toString()
  return (text ? `/analytics?${text}` : '/analytics') as Route
}
