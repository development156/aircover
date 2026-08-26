import { describe, expect, it } from 'vitest'

import { marketingObservationSchema } from '@sahoda/shared'

import { formatEffect, MIN_POSTS_PER_ARM, type FeaturedPost } from './format-effect'
import { featuresOf, hashtagCount, opensWithQuestion } from './post-features'

/**
 * WHAT THESE CANNOT SEE.
 *
 * The store collapses a cross-published post to ONE caption before this
 * computer runs. That `distinct on (p.id)` lives in SQL these tests do not
 * execute, so nothing here proves a post published to three channels is
 * counted once. `store.pglite.test.ts` covers that against a real Postgres;
 * these tests still cannot see it.
 *
 * They also say nothing about whether length CAUSES the difference. The claim
 * this computer writes is a correlation stated as one, and a customer who
 * reads it as advice is drawing a conclusion the arithmetic does not carry.
 */

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** `n` posts of `chars` characters, each earning `engagement` of `reach`. */
function arm(
  offset: number,
  n: number,
  chars: number,
  engagement: number,
  reach: number,
  spanDays = 30,
): FeaturedPost[] {
  return Array.from({ length: n }, (_, i) => ({
    postId: UUID(offset + i),
    body: 'x'.repeat(chars),
    engagement,
    reach,
    measuredOn: new Date(Date.UTC(2026, 0, 1 + Math.round((i * spanDays) / Math.max(n - 1, 1))))
      .toISOString()
      .slice(0, 10),
  }))
}

describe('post features', () => {
  it('counts the characters that are actually there', () => {
    expect(featuresOf('  hello  ').length).toBe(5)
  })

  it('sees a question only when the caption OPENS with one', () => {
    expect(opensWithQuestion('Fancy a coffee? We open at eight.')).toBe(true)
    expect(opensWithQuestion('We open at eight. Fancy a coffee?')).toBe(false)
  })

  it('counts each hashtag once, case-insensitively', () => {
    expect(hashtagCount('#bakery #Bakery #fresh')).toBe(2)
  })

  it('ignores a hash that is not starting a tag, but counts one that looks odd', () => {
    // `c#` has no word after the hash and `# ` is bare, so neither is a tag.
    expect(hashtagCount('we use c# and # here')).toBe(0)
    // A tag carrying digits is still a tag. Deliberately NOT using a
    // three-letter hex-shaped example here: the repo's design lint reads any
    // `#abc` in this package as a raw colour and fails the build, which is the
    // guard working correctly on a string that only looks like a colour.
    expect(hashtagCount('open today #bakery2026')).toBe(1)
  })
})

describe('formatEffect', () => {
  it('names which half of the writing earns more, with both figures', () => {
    const posts = [...arm(0, 5, 50, 20, 100), ...arm(50, 5, 500, 2, 100)]
    const result = formatEffect(posts, '2026-02-01')
    expect(result.observation?.claim).toBe(
      'Your shorter posts earn more attention per reader: 20% across your 5 shortest, ' +
        'against 2% across your 5 longest.',
    )
  })

  it('says it the other way round when the long captions win', () => {
    const posts = [...arm(0, 5, 50, 2, 100), ...arm(50, 5, 500, 20, 100)]
    const result = formatEffect(posts, '2026-02-01')
    expect(result.observation?.claim).toContain('Your longer posts earn more')
  })

  it('emits a row the stored contract accepts', () => {
    const posts = [...arm(0, 5, 50, 20, 100), ...arm(50, 5, 500, 2, 100)]
    const result = formatEffect(posts, '2026-02-01')
    expect(marketingObservationSchema.safeParse(result.observation).success).toBe(true)
    expect(result.observation?.kind).toBe('format_effect')
  })

  it('carries every post it counted, so the claim has a receipt', () => {
    const posts = [...arm(0, 5, 50, 20, 100), ...arm(50, 5, 500, 2, 100)]
    expect(formatEffect(posts, '2026-02-01').observation?.evidence.postIds).toHaveLength(10)
  })

  it('declines when nothing has been measured', () => {
    expect(formatEffect([], '2026-02-01').reason).toBe('no_metrics')
  })

  it('declines when every post reached nobody', () => {
    const blind = [...arm(0, 5, 50, 20, 0), ...arm(50, 5, 500, 2, 0)]
    expect(formatEffect(blind, '2026-02-01').reason).toBe('no_metrics')
  })

  it('declines when the measurements are packed into too short a stretch', () => {
    const short = [...arm(0, 5, 50, 20, 100, 3), ...arm(50, 5, 500, 2, 100, 3)]
    expect(formatEffect(short, '2026-02-01').reason).toBe('window_too_short')
  })

  it('declines when an arm is thin, and accepts it one post later', () => {
    const thin = [...arm(0, 4, 50, 20, 100), ...arm(50, 4, 500, 2, 100)]
    expect(formatEffect(thin, '2026-02-01').reason).toBe('too_few_posts')

    const enough = [
      ...arm(0, MIN_POSTS_PER_ARM, 50, 20, 100),
      ...arm(50, MIN_POSTS_PER_ARM, 500, 2, 100),
    ]
    expect(formatEffect(enough, '2026-02-01').observation).not.toBeNull()
  })

  it('refuses to call one half shorter when every caption is the same size', () => {
    const uniform = [...arm(0, 5, 300, 20, 100), ...arm(50, 5, 305, 2, 100)]
    expect(formatEffect(uniform, '2026-02-01').reason).toBe('lengths_too_similar')
  })

  it('declines to crown a winner when nothing is earning anything', () => {
    const flat = [...arm(0, 5, 50, 1, 100), ...arm(50, 5, 500, 0, 100)]
    expect(formatEffect(flat, '2026-02-01').reason).toBe('no_engagement')
  })

  it('declines when the two halves are close enough that the gap is noise', () => {
    const close = [...arm(0, 5, 50, 12, 100), ...arm(50, 5, 500, 10, 100)]
    expect(formatEffect(close, '2026-02-01').reason).toBe('too_close_to_call')
  })

  it('drops the middle post on an odd count rather than lending it to both arms', () => {
    const odd = [...arm(0, 5, 50, 20, 100), ...arm(50, 1, 250, 9, 100), ...arm(60, 5, 500, 2, 100)]
    const result = formatEffect(odd, '2026-02-01')
    expect(result.observation?.evidence.postIds).toHaveLength(10)
  })
})
