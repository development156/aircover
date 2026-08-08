import { describe, it, expect } from 'vitest'
import type { MetricAvailability } from '@sahoda/publishing'

import { accountLagCopy, metricCopy, metricValue } from '@/lib/analytics/copy'

/**
 * The copy IS the honesty guarantee at the last mile. A correct classification
 * rendered with the wrong sentence is the same bug the classifier exists to stop,
 * so the mapping from state to words is pinned here rather than left to the markup.
 */

const EVERY_STATE: MetricAvailability[] = [
  { kind: 'pending', reason: 'lag', availableAfter: '2026-08-10T06:00:00.000Z' },
  { kind: 'pending', reason: 'processing', availableAfter: null },
  { kind: 'pending', reason: 'never-measured', availableAfter: null },
  { kind: 'unresolved', message: null },
  { kind: 'unavailable', reason: 'not-published' },
  { kind: 'unavailable', reason: 'no-platform-id' },
  { kind: 'unavailable', reason: 'not-connected' },
  { kind: 'unavailable', reason: 'reconnect' },
  { kind: 'unavailable', reason: 'unreadable' },
  { kind: 'unavailable', reason: 'not-loaded' },
]

describe('no un-measured state ever says a number', () => {
  it.each(EVERY_STATE.map((s) => [`${s.kind}/${'reason' in s ? s.reason : '—'}`, s] as const))(
    '%s states no metric value',
    (_name, state) => {
      const copy = metricCopy(state, 'instagram')
      const text = `${copy.headline} ${copy.detail ?? ''}`.toLowerCase()

      // A bare "0" or the word "zero" is the fabrication itself. (Digits inside a
      // DATE are fine and expected — "expected after 10 Aug" states when to look
      // again, which is the opposite of claiming a reading.)
      expect(text).not.toMatch(/(^|\s)0(\s|$|[.,])/)
      expect(text).not.toContain('zero')

      // Nor may it pair a metric name with any figure.
      expect(text).not.toMatch(/(impressions|reach|engagement|followers)\D{0,4}\d/)
    },
  )

  it('never claims a metric is zero for an orphaned post', () => {
    const copy = metricCopy({ kind: 'unresolved', message: null }, 'instagram')
    expect(copy.headline).toBe('Can’t be resolved')
    expect(copy.detail).toContain('can’t tie this post back')
    expect(copy.tone).toBe('blocked')
  })
})

describe('the three waits read as one situation', () => {
  it.each(['lag', 'processing', 'never-measured'] as const)(
    '%s says "Not available yet"',
    (reason) => {
      const state = {
        kind: 'pending',
        reason,
        availableAfter: null,
      } as MetricAvailability
      const copy = metricCopy(state, 'instagram')
      expect(copy.headline).toBe('Not available yet')
      expect(copy.tone).toBe('waiting')
    },
  )

  it('blames the platform, not Sahoda, and names it', () => {
    const copy = metricCopy(
      { kind: 'pending', reason: 'lag', availableAfter: '2026-08-10T06:00:00.000Z' },
      'instagram',
    )
    expect(copy.detail).toContain('Instagram')
    expect(copy.detail).toMatch(/delay/i)
  })

  it('gives no expected time when it cannot compute one', () => {
    const copy = metricCopy({ kind: 'pending', reason: 'lag', availableAfter: null }, 'instagram')
    expect(copy.detail).not.toMatch(/expected/i)
  })
})

describe('connection states ask for the right thing', () => {
  it('says connect when there is no connection', () => {
    expect(metricCopy({ kind: 'unavailable', reason: 'not-connected' }, 'gbp').detail).toBe(
      'Connect Google Business Profile to see metrics.',
    )
  })

  it('says reconnect when one exists but is dead', () => {
    // Telling someone to "connect" an account they already connected is useless.
    expect(metricCopy({ kind: 'unavailable', reason: 'reconnect' }, 'gbp').detail).toBe(
      'Reconnect Google Business Profile to see metrics.',
    )
  })
})

describe('the capped-list state does not advise a pointless retry', () => {
  it('points at the post rather than telling anyone to refresh', () => {
    const copy = metricCopy({ kind: 'unavailable', reason: 'not-loaded' }, 'instagram')
    expect(copy.detail).toBe('Open the post to see its metrics.')
    // Refreshing the list hits the same cap, so "try again" would be false advice.
    expect(copy.detail?.toLowerCase()).not.toMatch(/try again|refresh/)
    // Nothing failed, so it must not wear the blocked treatment.
    expect(copy.tone).toBe('none')
  })

  it('reads differently from a genuine failure', () => {
    const failed = metricCopy({ kind: 'unavailable', reason: 'unreadable' }, 'instagram')
    const capped = metricCopy({ kind: 'unavailable', reason: 'not-loaded' }, 'instagram')
    expect(failed.headline).not.toBe(capped.headline)
  })
})

describe('accountLagCopy', () => {
  it.each([
    [48, 'about two days'],
    [72, 'about two days'],
    [24, 'about a day'],
    [36, 'about a day'],
    [6, 'about 6 hours'],
  ])('phrases %i hours as "%s"', (hours, phrase) => {
    expect(accountLagCopy(hours)).toContain(phrase)
  })

  it('always names the platform whose delay it is', () => {
    expect(accountLagCopy(48)).toContain('Instagram')
  })

  it('never rounds a sub-hour delay down to zero hours', () => {
    expect(accountLagCopy(0.2)).toContain('about 1 hours')
  })
})

describe('metricValue', () => {
  it('renders a missing metric as a dash, never a 0', () => {
    expect(metricValue(null)).toBe('—')
  })

  it('renders a real zero as 0', () => {
    expect(metricValue(0)).toBe('0')
  })

  it('groups digits so a big number stays readable', () => {
    expect(metricValue(1234567)).toMatch(/[\d,]+/)
  })
})
