import { describe, it, expect } from 'vitest'

import {
  DEFAULT_METRIC,
  METRIC_KEYS,
  isStoredMetric,
  metricHref,
  resolveMetric,
  resolveView,
  hrefFor,
  previousWindow,
  withinView,
  DEFAULT_RANGE,
  MAX_RANGE_DAYS,
  type AnalyticsView,
} from './view-params'

const NOW = new Date('2026-08-29T12:00:00Z')

describe('resolveView — defaults and fallbacks', () => {
  it('with no params resolves the default range and every channel (null)', () => {
    const v = resolveView({}, NOW)
    expect(v.days).toBe(DEFAULT_RANGE)
    expect(v.channel).toBeNull()
    expect(v.custom).toBe(false)
  })

  /**
   * The reader asked for their numbers; a mangled parameter is not a refusal.
   * It must land on the default window, never throw and never an empty one.
   */
  it('an unrecognised range falls back to the default rather than throwing or going empty', () => {
    const v = resolveView({ range: 'yesterday' }, NOW)
    expect(v.days).toBe(DEFAULT_RANGE)
    expect(v.custom).toBe(false)
  })

  /**
   * A typo'd channel must fall back to "all channels" (null), never to some
   * OTHER channel that was never asked for — that would silently narrow the
   * reader's own view without their say-so.
   */
  it('an unrecognised channel falls back to null, never to an unrequested channel', () => {
    const v = resolveView({ channel: 'not-a-real-channel' }, NOW)
    expect(v.channel).toBeNull()
  })

  it('a valid channel from the shared schema is accepted', () => {
    const v = resolveView({ channel: 'instagram' }, NOW)
    expect(v.channel).toBe('instagram')
  })
})

describe('resolveView — custom windows', () => {
  it('explicit from/to wins over a preset range', () => {
    const v = resolveView({ range: '90', from: '2026-08-01', to: '2026-08-10' }, NOW)
    expect(v.custom).toBe(true)
    expect(v.from).toBe('2026-08-01')
    expect(v.to).toBe('2026-08-10')
  })

  /**
   * Showing a window nobody chose, under a label saying they did, is the
   * defect this guards against. Only one end given must fall back to the
   * preset, never invent the missing end.
   */
  it('a half-specified window (only from) falls back to the preset, not an invented end', () => {
    const v = resolveView({ from: '2026-08-01' }, NOW)
    expect(v.custom).toBe(false)
    expect(v.days).toBe(DEFAULT_RANGE)
  })

  it('a half-specified window (only to) falls back to the preset, not an invented start', () => {
    const v = resolveView({ to: '2026-08-10' }, NOW)
    expect(v.custom).toBe(false)
    expect(v.days).toBe(DEFAULT_RANGE)
  })

  it('from later than to falls back to the preset', () => {
    const v = resolveView({ from: '2026-08-10', to: '2026-08-01' }, NOW)
    expect(v.custom).toBe(false)
    expect(v.days).toBe(DEFAULT_RANGE)
  })

  /**
   * An unbounded custom window is an unbounded query — one pasted URL could
   * read every row a workspace has ever produced. Over MAX_RANGE_DAYS must
   * fall back rather than honour it.
   */
  it('a custom window longer than MAX_RANGE_DAYS falls back to the preset', () => {
    const from = '2020-01-01'
    const to = '2026-08-29' // more than MAX_RANGE_DAYS (730) apart
    const spanDays = Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    )
    expect(spanDays).toBeGreaterThan(MAX_RANGE_DAYS)
    const v = resolveView({ from, to }, NOW)
    expect(v.custom).toBe(false)
    expect(v.days).toBe(DEFAULT_RANGE)
  })
})

describe('resolveView — "last 7 days" is inclusive of both ends', () => {
  it('spans exactly 7 calendar days, not 8', () => {
    const v = resolveView({ range: '7' }, NOW)
    expect(v.to).toBe('2026-08-29')
    expect(v.from).toBe('2026-08-23')
    const spanDays =
      Math.round(
        (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000,
      ) + 1
    expect(spanDays).toBe(7)
  })
})

describe('hrefFor — a control never silently resets its neighbour', () => {
  const base: AnalyticsView = resolveView({ range: '90', channel: 'instagram' }, NOW)

  it('keeps the channel when changing the range', () => {
    const href = hrefFor(base, { range: '7' })
    expect(href).toContain('range=7')
    expect(href).toContain('channel=instagram')
  })

  it('keeps the range when changing the channel', () => {
    const href = hrefFor(base, { channel: 'facebook' })
    expect(href).toContain('range=90')
    expect(href).toContain('channel=facebook')
  })
})

describe('hrefFor — the default is never written into the URL', () => {
  it('omits the default range from the URL', () => {
    const v = resolveView({ range: String(DEFAULT_RANGE) }, NOW)
    const href = hrefFor(v, {})
    expect(href).not.toContain('range=')
  })

  it('returns the bare /analytics when nothing is set', () => {
    const v = resolveView({}, NOW)
    const href = hrefFor(v, {})
    expect(href).toBe('/analytics')
  })
})

describe('hrefFor — custom windows', () => {
  it('an explicit custom window emits from and to, not range', () => {
    const v = resolveView({ from: '2026-08-01', to: '2026-08-10' }, NOW)
    const href = hrefFor(v, {})
    expect(href).toContain('from=2026-08-01')
    expect(href).toContain('to=2026-08-10')
    expect(href).not.toContain('range=')
  })
})

describe('previousWindow', () => {
  /**
   * The only comparison this product makes is against the workspace's own
   * history: same length, immediately before, no overlap and no gap.
   */
  it('is the same length, immediately before, with no overlap', () => {
    const v = resolveView({ range: '7' }, NOW) // 2026-08-23..2026-08-29, days=7
    const prev = previousWindow(v)
    expect(prev.to).toBe('2026-08-22') // exactly the day before view.from
    const prevDays =
      Math.round(
        (Date.parse(`${prev.to}T00:00:00Z`) - Date.parse(`${prev.from}T00:00:00Z`)) / 86_400_000,
      ) + 1
    expect(prevDays).toBe(v.days)
  })
})

describe('withinView — inclusive at both ends', () => {
  it('includes the from and to boundaries themselves', () => {
    const v = resolveView({ from: '2026-08-01', to: '2026-08-10' }, NOW)
    expect(withinView('2026-08-01', v)).toBe(true)
    expect(withinView('2026-08-10', v)).toBe(true)
    expect(withinView('2026-07-31', v)).toBe(false)
    expect(withinView('2026-08-11', v)).toBe(false)
  })
})

describe('the metric, and the two sources behind it', () => {
  const view = resolveView({ range: '7', channel: 'instagram' }, new Date('2026-08-30T10:00:00Z'))

  it('falls back to the default rather than refusing an unknown metric', () => {
    expect(resolveMetric('saves')).toBe('saves')
    expect(resolveMetric('unicorns')).toBe(DEFAULT_METRIC)
    expect(resolveMetric(undefined)).toBe(DEFAULT_METRIC)
  })

  it('keeps the range and the channel when the metric changes', () => {
    // A control that silently resets its neighbour is how a filtered view stops
    // being shareable. Stated at the top of `view-params.ts`, pinned here.
    const href = metricHref(view, 'likes')
    expect(href).toContain('metric=likes')
    expect(href).toContain('range=7')
    expect(href).toContain('channel=instagram')
  })

  it('does not write the default metric into the URL', () => {
    expect(metricHref(view, DEFAULT_METRIC)).not.toContain('metric=')
  })

  it('knows which metrics this database keeps and which need a live read', () => {
    // Three stored, six live. Getting this wrong reads a live metric out of an
    // empty snapshot table and calls the answer "nothing measured".
    const stored = METRIC_KEYS.filter(isStoredMetric)
    expect([...stored].sort()).toEqual(['engagement', 'impressions', 'reach'])
    expect(METRIC_KEYS.filter((metric) => !isStoredMetric(metric))).toHaveLength(6)
  })
})
