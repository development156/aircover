import { describe, expect, it } from 'vitest'

import { AGEING_AFTER_MS, freshnessOf, newestOf, STALE_AFTER_MS } from '@/lib/ops/freshness'

const NOW = new Date('2026-08-01T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('freshnessOf', () => {
  it('is fresh under an hour', () => {
    const f = freshnessOf(ago(20 * 60_000), NOW)
    expect(f.level).toBe('fresh')
    expect(f.label).toBe('Last synced 20 minutes ago')
  })

  it('is ageing from six hours', () => {
    expect(freshnessOf(ago(AGEING_AFTER_MS), NOW).level).toBe('ageing')
    expect(freshnessOf(ago(AGEING_AFTER_MS - 1), NOW).level).toBe('fresh')
  })

  it('is stale from a day', () => {
    expect(freshnessOf(ago(STALE_AFTER_MS), NOW).level).toBe('stale')
    expect(freshnessOf(ago(STALE_AFTER_MS - 1), NOW).level).toBe('ageing')
  })

  it('reports the 30-hour gap that started this card as stale, in days', () => {
    const f = freshnessOf(ago(30 * 60 * 60 * 1000), NOW)
    expect(f.level).toBe('stale')
    expect(f.label).toBe('Last synced 1 day ago')
  })

  it('treats "we do not know" as its own state, never as fresh', () => {
    // The whole point of the card: a syncer that never ran cannot report that
    // it never ran, so an absent figure must be loud rather than silent.
    const f = freshnessOf(null, NOW)
    expect(f.level).toBe('unknown')
    expect(f.ageMs).toBeNull()
    expect(f.label).toMatch(/unknown/)
  })

  it('treats an unparseable timestamp as unknown, not as now', () => {
    expect(freshnessOf('not a date', NOW).level).toBe('unknown')
  })

  it('clamps a future timestamp to "just now" rather than a negative age', () => {
    const f = freshnessOf(new Date(NOW.getTime() + 90_000).toISOString(), NOW)
    expect(f.ageMs).toBe(0)
    expect(f.label).toBe('Last synced just now')
  })

  it('singularises one hour and one day', () => {
    expect(freshnessOf(ago(60 * 60_000), NOW).label).toBe('Last synced 1 hour ago')
    expect(freshnessOf(ago(25 * 60 * 60_000), NOW).label).toBe('Last synced 1 day ago')
  })
})

describe('newestOf', () => {
  it('takes the newest across the tables', () => {
    expect(newestOf([ago(60_000), ago(10_000), ago(600_000)])).toBe(ago(10_000))
  })

  it('ignores tables that have never been written', () => {
    expect(newestOf([null, ago(60_000), null])).toBe(ago(60_000))
  })

  it('is null when nothing has ever been written', () => {
    expect(newestOf([null, null])).toBeNull()
  })

  it('ignores an unparseable stamp rather than letting it win', () => {
    expect(newestOf(['garbage', ago(60_000)])).toBe(ago(60_000))
  })
})
