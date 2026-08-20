import { describe, it, expect } from 'vitest'

import {
  LINKEDIN_POLL_DURATIONS,
  parseIsoDate,
  refuseGbpTopic,
  refusePoll,
} from './variant-options'

/**
 * ── EVERY BOUND HERE WAS MEASURED, ONE STEP EITHER SIDE ─────────────────────
 * Polls are the one `platformSpecificData` block Zernio's dry-run validator
 * fully enforces (docs/32 §4.2), and these are its numbers, taken from its own
 * refusals on 2026-08-20. A test that checked 2 options pass and 9 fail would go
 * green against a wrong limit; 4 and 5 is the smallest step that cannot.
 */
describe('poll bounds, at the edges Zernio actually refuses at', () => {
  const xPoll = (over: Record<string, unknown> = {}) => ({
    options: ['Chai', 'Coffee'],
    durationMinutes: 60,
    ...over,
  })

  it.each([
    [1, 'POLL_OPTION_COUNT'],
    [2, null],
    [4, null],
    [5, 'POLL_OPTION_COUNT'],
  ])('x: %i options → %s', (count, code) => {
    const options = Array.from({ length: count }, (_, i) => `Answer ${i}`)
    expect(refusePoll('x', xPoll({ options }))?.code ?? null).toBe(code)
  })

  it.each([
    [25, null],
    [26, 'POLL_OPTION_TOO_LONG'],
  ])('x: an option of %i characters → %s', (length, code) => {
    const options = ['z'.repeat(length), 'other']
    expect(refusePoll('x', xPoll({ options }))?.code ?? null).toBe(code)
  })

  it.each([
    [4, 'POLL_DURATION'],
    [5, null],
    [10080, null],
    [10081, 'POLL_DURATION'],
  ])('x: %i minutes → %s', (durationMinutes, code) => {
    expect(refusePoll('x', xPoll({ durationMinutes }))?.code ?? null).toBe(code)
  })

  it('x: refuses a duration that is not a whole number of minutes', () => {
    // Zernio's own words: "must be an INTEGER between 5 and 10080".
    expect(refusePoll('x', xPoll({ durationMinutes: 60.5 }))?.code).toBe('POLL_DURATION')
  })

  it('x: refuses a poll with no duration rather than picking one', () => {
    expect(refusePoll('x', { options: ['a', 'b'] })?.code).toBe('POLL_DURATION')
  })

  const liPoll = (over: Record<string, unknown> = {}) => ({
    question: 'Chai or coffee?',
    options: ['Chai', 'Coffee'],
    durationCode: 'THREE_DAYS',
    ...over,
  })

  it.each([
    [140, null],
    [141, 'POLL_QUESTION_TOO_LONG'],
  ])('linkedin: a question of %i characters → %s', (length, code) => {
    expect(refusePoll('linkedin', liPoll({ question: 'q'.repeat(length) }))?.code ?? null).toBe(code)
  })

  it('linkedin: needs a question of its own, unlike X', () => {
    expect(refusePoll('linkedin', liPoll({ question: '  ' }))?.code).toBe('POLL_NEEDS_QUESTION')
    expect(refusePoll('x', { options: ['a', 'b'], durationMinutes: 60 })).toBeNull()
  })

  it('linkedin: takes exactly the four durations Zernio names', () => {
    for (const durationCode of LINKEDIN_POLL_DURATIONS) {
      expect(refusePoll('linkedin', liPoll({ durationCode }))).toBeNull()
    }
    expect(refusePoll('linkedin', liPoll({ durationCode: 'TWO_YEARS' }))?.code).toBe('POLL_DURATION')
    expect(refusePoll('linkedin', liPoll({ durationCode: 'ONE_HOUR' }))?.code).toBe('POLL_DURATION')
  })

  it('counts empty answers as absent rather than as answers', () => {
    // A writer who typed two answers and left two boxes blank has a valid poll,
    // not a four-option one. The builder sends the same trimmed list.
    expect(refusePoll('x', xPoll({ options: ['Chai', 'Coffee', '', '  '] }))).toBeNull()
    expect(refusePoll('x', xPoll({ options: ['Chai', '  '] }))?.code).toBe('POLL_OPTION_COUNT')
  })

  it('refuses a poll on a channel that has none', () => {
    expect(refusePoll('gbp', xPoll())?.code).toBe('POLL_UNSUPPORTED')
    expect(refusePoll('instagram', xPoll())?.code).toBe('POLL_UNSUPPORTED')
  })
})

describe('parseIsoDate', () => {
  it('reads a real date', () => {
    expect(parseIsoDate('2026-09-01')).toEqual({ year: 2026, month: 9, day: 1 })
  })

  it('refuses a date that looks right and is not a day', () => {
    // The case a range check per field would pass: 30 is inside 1–31.
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('2025-02-29')).toBeNull()
  })

  it('accepts a real leap day', () => {
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 })
  })

  it('refuses anything that is not exactly YYYY-MM-DD', () => {
    for (const bad of ['2026-9-1', '01/09/2026', '2026-09-01T00:00:00Z', '', 'tomorrow']) {
      expect(parseIsoDate(bad)).toBeNull()
    }
  })
})

/**
 * ── THESE RULES ARE OURS, AND THAT IS THE WHOLE POINT ───────────────────────
 * MEASURED: Zernio validates Google's `platformSpecificData` NOT AT ALL —
 * `topicType: 'BANANA'` passes their dry run, and so does an EVENT with no event
 * object (docs/32 §4.3). Google itself returns 400 for a missing startDate, which
 * is a refusal arriving after the credit is spent.
 */
describe('the Google topic, checked by us because nobody else does', () => {
  it('lets an ordinary post through untouched', () => {
    expect(refuseGbpTopic({})).toBeNull()
  })

  it('refuses an event with no name', () => {
    expect(refuseGbpTopic({ gbpTopic: 'EVENT' })?.code).toBe('GBP_EVENT_NEEDS_TITLE')
    expect(
      refuseGbpTopic({ gbpTopic: 'EVENT', gbpEvent: { title: '  ', startDate: '2026-09-01' } })
        ?.code,
    ).toBe('GBP_EVENT_NEEDS_TITLE')
  })

  it('refuses an event with no start date — the one Google 400s on', () => {
    expect(
      refuseGbpTopic({ gbpTopic: 'EVENT', gbpEvent: { title: 'Diwali sale', startDate: '' } })?.code,
    ).toBe('GBP_EVENT_NEEDS_DATE')
  })

  it('accepts an event with a name and a start date', () => {
    expect(
      refuseGbpTopic({ gbpTopic: 'EVENT', gbpEvent: { title: 'Sale', startDate: '2026-09-01' } }),
    ).toBeNull()
  })

  it('refuses an event that ends before it starts', () => {
    expect(
      refuseGbpTopic({
        gbpTopic: 'EVENT',
        gbpEvent: { title: 'Sale', startDate: '2026-09-10', endDate: '2026-09-01' },
      })?.code,
    ).toBe('GBP_EVENT_ENDS_FIRST')
  })

  it('accepts a one-day event whose end is its start', () => {
    expect(
      refuseGbpTopic({
        gbpTopic: 'EVENT',
        gbpEvent: { title: 'Sale', startDate: '2026-09-10', endDate: '2026-09-10' },
      }),
    ).toBeNull()
  })

  it('refuses an offer that offers nothing', () => {
    // Google accepts it and publishes an ordinary update wearing an offer's
    // label — a post that is not what it says it is.
    expect(refuseGbpTopic({ gbpTopic: 'OFFER' })?.code).toBe('GBP_OFFER_EMPTY')
    expect(refuseGbpTopic({ gbpTopic: 'OFFER', gbpOffer: { couponCode: '  ' } })?.code).toBe(
      'GBP_OFFER_EMPTY',
    )
  })

  it.each([
    ['couponCode', { couponCode: 'SAVE10' }],
    ['redeemUrl', { redeemUrl: 'https://example.com' }],
    ['terms', { terms: 'One per customer.' }],
  ])('accepts an offer carrying only %s', (_name, gbpOffer) => {
    expect(refuseGbpTopic({ gbpTopic: 'OFFER', gbpOffer })).toBeNull()
  })
})
