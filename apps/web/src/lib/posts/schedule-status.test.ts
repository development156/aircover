import { describe, expect, test } from 'vitest'

import { autoPublishTruth, AUTO_PUBLISH_COPY } from './schedule-status'

/**
 * Nothing in this product publishes a scheduled post.
 *
 * `apps/jobs` has a `publishPost` task, but nothing dispatches it: the only
 * cron in the package is the expired-hold sweep, and `apps/web` does not even
 * depend on `@sahoda/jobs`. A post's scheduled time arriving is a no-op.
 *
 * Meanwhile the UI renders a "Scheduled" badge next to a date, which is the
 * universal signal for "this will go out on its own". For a past-due post that
 * signal is provably false — the time came, and nothing happened. This module
 * decides which of the two honest things to say, and never says anything a
 * clock cannot back.
 */

const NOW = new Date('2026-07-25T12:00:00.000Z')
const EARLIER = '2026-07-25T11:59:00.000Z'
const LATER = '2026-07-25T12:01:00.000Z'

describe('posts that make no auto-publish promise', () => {
  test.each(['idea', 'draft', 'review', 'approved', 'published', 'failed', 'expired'] as const)(
    '%s says nothing, even with a date on it',
    (status) => {
      // A dated draft promises nothing — the date is a plan, not a commitment.
      // Labelling every one of these would train users to ignore the label,
      // which costs us the past-due case that actually matters.
      expect(autoPublishTruth(status, EARLIER, NOW)).toBe('none')
    },
  )
})

describe('a scheduled post whose time has not come', () => {
  test('is told it will not post itself', () => {
    expect(autoPublishTruth('scheduled', LATER, NOW)).toBe('awaiting')
  })

  test('is told so even without a time — the badge alone makes the promise', () => {
    expect(autoPublishTruth('scheduled', null, NOW)).toBe('awaiting')
  })

  test('is not called overdue on an unparseable timestamp', () => {
    // We cannot assert a time has passed when we cannot read the time. The
    // weaker claim is still true, so it is the one we make.
    expect(autoPublishTruth('scheduled', 'whenever', NOW)).toBe('awaiting')
  })

  test('is not called overdue on an unreadable clock', () => {
    expect(autoPublishTruth('scheduled', EARLIER, new Date(Number.NaN))).toBe('awaiting')
  })

  test('is not called overdue at the exact scheduled instant', () => {
    // Strictly past, matching `staleHoldNote`. A post due this very second has
    // not yet been missed, and claiming otherwise is a race we would lose.
    expect(autoPublishTruth('scheduled', NOW.toISOString(), NOW)).toBe('awaiting')
  })
})

describe('a scheduled post whose time has passed', () => {
  test('gets the stronger claim: it did not happen', () => {
    expect(autoPublishTruth('scheduled', EARLIER, NOW)).toBe('overdue')
  })

  test('still gets it long after the fact', () => {
    expect(autoPublishTruth('scheduled', '2020-01-01T00:00:00.000Z', NOW)).toBe('overdue')
  })
})

describe('the copy itself', () => {
  test('never promises a publish will happen later', () => {
    // "will publish", "will go out", "posting soon" — any future-tense promise
    // here is the same lie in gentler words. Nothing is scheduled to run.
    for (const copy of [AUTO_PUBLISH_COPY.awaiting, AUTO_PUBLISH_COPY.overdue]) {
      expect(copy.note).not.toMatch(/will (publish|post|go out)/i)
      expect(copy.note).toMatch(/auto-publish isn't live yet/i)
    }
  })

  test('says outright that nothing was published, once the time has passed', () => {
    expect(AUTO_PUBLISH_COPY.overdue.note).toMatch(/nothing was published/i)
  })

  test('carries a short form for tight surfaces that still reads as a warning', () => {
    // The week grid has ~14 characters of room. It may abbreviate, but it may
    // not soften into something a user reads as "on track".
    expect(AUTO_PUBLISH_COPY.awaiting.short.length).toBeLessThanOrEqual(20)
    expect(AUTO_PUBLISH_COPY.overdue.short.length).toBeLessThanOrEqual(20)
    expect(AUTO_PUBLISH_COPY.overdue.short).toMatch(/not posted/i)
  })
})
