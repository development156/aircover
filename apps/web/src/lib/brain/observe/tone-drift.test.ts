import { describe, expect, it } from 'vitest'

import { marketingObservationSchema } from '@sahoda/shared'

import {
  countExclamations,
  MIN_BASELINE_RATE,
  MIN_POSTS_PER_WINDOW,
  MIN_RATE_CHANGE,
  MIN_WINDOW_DAYS,
  TONE_DRIFT_SUBJECT,
  toneDrift,
  type PublishedPost,
} from './tone-drift'

/**
 * Every gate here is tested BY BREAKING IT — a case that clears the floor and
 * the same case moved one step under it. A floor only ever tested from the
 * passing side is a floor nobody has seen hold, which is the defect the root
 * CLAUDE.md's one rule exists to catch.
 */

/** Posts on consecutive days from a fixed start, with the bodies given. */
function posts(bodies: readonly string[], startDay = 1, month = '01'): PublishedPost[] {
  return bodies.map((body, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    body,
    publishedOn: `2026-${month}-${String(startDay + i).padStart(2, '0')}`,
  }))
}

/** Five loud then five quiet, spread over enough days to clear the span gate. */
function loudThenQuiet(): PublishedPost[] {
  const loud = posts(['Open now!', 'So good!', 'Come by!', 'Fresh!', 'Today!'], 1, '01')
  const quiet = posts(['Open now.', 'So good.', 'Come by.', 'Fresh bread.', 'Today only.'], 1, '03')
  return [...loud, ...quiet]
}

describe('countExclamations', () => {
  it('counts every mark, not every post that has one', () => {
    expect(countExclamations('Wow!!! Really!')).toBe(4)
  })

  it('is zero for text with none', () => {
    expect(countExclamations('A plain sentence.')).toBe(0)
  })
})

describe('toneDrift', () => {
  it('states the stronger claim when the habit fell to nothing', () => {
    const result = toneDrift(loudThenQuiet(), '2026-03-08')

    expect(result.reason).toBeNull()
    expect(result.observation?.claim).toBe(
      'You have stopped using exclamation marks. 1 per post across your 5 earlier posts, none in the 5 since.',
    )
  })

  it('emits a row the stored contract accepts', () => {
    const result = toneDrift(loudThenQuiet(), '2026-03-08')
    expect(() => marketingObservationSchema.parse(result.observation)).not.toThrow()
    expect(result.observation?.subject).toBe(TONE_DRIFT_SUBJECT)
  })

  it('carries the posts the numbers came from, so the claim has a receipt', () => {
    const result = toneDrift(loudThenQuiet(), '2026-03-08')
    expect(result.observation?.evidence.postIds).toHaveLength(10)
    expect(result.observation?.evidence.data).toHaveLength(3)
  })

  it('notices the rise as readily as the fall', () => {
    const quietFirst = [
      ...posts(['Open now.', 'So good.', 'Come by.', 'Fresh.', 'Today.'], 1, '01'),
      ...posts(['Open now!', 'So good!', 'Come by!', 'Fresh!', 'Today!'], 1, '03'),
    ]
    const result = toneDrift(quietFirst, '2026-03-08')
    expect(result.observation?.claim).toContain('You have started using exclamation marks')
  })

  it('says fewer, not none, when the habit only eased', () => {
    const eased = [
      ...posts(['A!!!', 'B!!!', 'C!!!', 'D!!!', 'E!!!'], 1, '01'),
      ...posts(['A!', 'B.', 'C.', 'D.', 'E.'], 1, '03'),
    ]
    const result = toneDrift(eased, '2026-03-08')
    expect(result.observation?.claim).toMatch(/^You use fewer exclamation marks than you did: 3 /)
  })

  // ── THE GATES, EACH BROKEN ─────────────────────────────────────────────────

  it('declines when nothing has been published', () => {
    expect(toneDrift([], '2026-03-08')).toEqual({ observation: null, reason: 'no_posts' })
  })

  it('declines when the whole span is shorter than a habit', () => {
    // Same ten posts, same fall, written inside a fortnight.
    const cramped = [
      ...posts(['A!', 'B!', 'C!', 'D!', 'E!'], 1, '01'),
      ...posts(['A.', 'B.', 'C.', 'D.', 'E.'], 6, '01'),
    ]
    expect(toneDrift(cramped, '2026-01-11').reason).toBe('window_too_short')

    // One day past the floor and the same data is a finding. This pair is the
    // proof the gate is load-bearing rather than decorative.
    const spanned = [
      ...posts(['A!', 'B!', 'C!', 'D!', 'E!'], 1, '01'),
      ...posts(['A.', 'B.', 'C.', 'D.', 'E.'], 17, '01'),
    ]
    expect(spanned[spanned.length - 1]?.publishedOn).toBe('2026-01-21')
    expect(toneDrift(spanned, '2026-01-22').reason).toBeNull()
  })

  it('declines when an arm is one post short, and accepts it one post later', () => {
    const four = [
      ...posts(['A!', 'B!', 'C!', 'D!'], 1, '01'),
      ...posts(['A.', 'B.', 'C.', 'D.'], 1, '03'),
    ]
    expect(four).toHaveLength(2 * (MIN_POSTS_PER_WINDOW - 1))
    expect(toneDrift(four, '2026-03-08').reason).toBe('too_few_posts')
    expect(toneDrift(loudThenQuiet(), '2026-03-08').reason).toBeNull()
  })

  it('declines to tell a restrained writer they have become restrained', () => {
    // Two marks across ten posts. A real fall to zero, and worth nothing.
    const barely = [
      ...posts(['A!', 'B.', 'C.', 'D.', 'E!'], 1, '01'),
      ...posts(['A.', 'B.', 'C.', 'D.', 'E.'], 1, '03'),
    ]
    const before = 2 / MIN_POSTS_PER_WINDOW
    expect(before).toBeLessThan(MIN_BASELINE_RATE)
    expect(toneDrift(barely, '2026-03-08').reason).toBe('no_baseline')
  })

  it('declines when the rate moved less than writing naturally wobbles', () => {
    // 2.0 per post to 1.0 is a fall of 0.5, under the 0.6 floor.
    const wobble = [
      ...posts(['A!!', 'B!!', 'C!!', 'D!!', 'E!!'], 1, '01'),
      ...posts(['A!', 'B!', 'C!', 'D!', 'E!'], 1, '03'),
    ]
    expect(0.5).toBeLessThan(MIN_RATE_CHANGE)
    expect(toneDrift(wobble, '2026-03-08').reason).toBe('change_too_small')
  })

  it('never lends the middle post to both arms', () => {
    const odd = [
      ...posts(['A!', 'B!', 'C!', 'D!', 'E!'], 1, '01'),
      ...posts(['M!'], 15, '01'),
      ...posts(['A.', 'B.', 'C.', 'D.', 'E.'], 1, '03'),
    ]
    const result = toneDrift(odd, '2026-03-08')
    expect(result.observation?.evidence.postIds).toHaveLength(10)
    expect(result.observation?.evidence.data[2]?.value).toBe(10)
  })

  it('spans the window end to end, not arm to arm', () => {
    const result = toneDrift(loudThenQuiet(), '2026-03-08')
    // 1 Jan to 5 Mar inclusive.
    expect(result.observation?.evidence.windowDays).toBe(64)
    expect(result.observation?.evidence.windowDays).toBeGreaterThanOrEqual(MIN_WINDOW_DAYS)
  })
})
