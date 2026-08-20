import { CONSTRAINTS, charCountFor, type VariantDraft } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { refuseFormat } from '@sahoda/publishing'
import { blockingChannels, meterFor, metersFor, withFormat } from './counters'

const draft = (over: Partial<VariantDraft> = {}): VariantDraft => ({ body: '', ...over })

describe('meterFor — delegation to the frozen engine', () => {
  test('reports exactly the character count the engine computes', () => {
    const d = draft({ body: 'Fresh chai, fresh chapters.', hasLink: true })
    expect(meterFor('x', d).charCount).toBe(charCountFor(CONSTRAINTS.x, d))
    expect(meterFor('linkedin', d).charCount).toBe(charCountFor(CONSTRAINTS.linkedin, d))
  })

  test('surfaces the maxChars from the spec rather than a local copy', () => {
    expect(meterFor('x', draft()).maxChars).toBe(CONSTRAINTS.x.maxChars)
    expect(meterFor('gbp', draft()).maxChars).toBe(CONSTRAINTS.gbp.maxChars)
    expect(meterFor('linkedin', draft()).maxChars).toBe(CONSTRAINTS.linkedin.maxChars)
    expect(meterFor('instagram', draft()).maxChars).toBe(CONSTRAINTS.instagram.maxChars)
  })

  test('echoes back the channel it was asked about', () => {
    expect(meterFor('gbp', draft()).channel).toBe('gbp')
  })
})

describe('meterFor — code point counting', () => {
  test('counts an emoji as one character, disagreeing with String.length', () => {
    const body = '🎉'.repeat(10)
    // The whole point: UTF-16 units would say 20, the engine says 10.
    expect(body.length).toBe(20)
    expect(meterFor('x', draft({ body })).charCount).toBe(10)
  })

  test('leaves an emoji-heavy X draft under the limit that String.length would call over', () => {
    const body = '🎉'.repeat(200)
    expect(body.length).toBeGreaterThan(CONSTRAINTS.x.maxChars)
    const meter = meterFor('x', draft({ body }))
    expect(meter.charCount).toBe(200)
    expect(meter.over).toBe(false)
    expect(meter.violations).toEqual([])
  })

  test('counts an empty body as zero with the full allowance remaining', () => {
    const meter = meterFor('x', draft({ body: '' }))
    expect(meter.charCount).toBe(0)
    expect(meter.remaining).toBe(CONSTRAINTS.x.maxChars)
    expect(meter.over).toBe(false)
    expect(meter.violations).toEqual([])
  })
})

describe('meterFor — link weighting', () => {
  test('weights a link on X at a fixed 23 characters, not the raw URL length', () => {
    const body = 'Read this: '
    const withoutLink = meterFor('x', draft({ body }))
    const withLink = meterFor('x', draft({ body, hasLink: true }))
    expect(withLink.charCount - withoutLink.charCount).toBe(23)
  })

  test('lets an X draft sit exactly at the limit once the link costs its 23', () => {
    const body = 'a'.repeat(CONSTRAINTS.x.maxChars - 23)
    const meter = meterFor('x', draft({ body, hasLink: true }))
    expect(meter.charCount).toBe(CONSTRAINTS.x.maxChars)
    expect(meter.remaining).toBe(0)
    expect(meter.over).toBe(false)
  })

  test('tips an X draft over when one character joins the link', () => {
    const body = 'a'.repeat(CONSTRAINTS.x.maxChars - 22)
    const meter = meterFor('x', draft({ body, hasLink: true }))
    expect(meter.charCount).toBe(CONSTRAINTS.x.maxChars + 1)
    expect(meter.remaining).toBe(-1)
    expect(meter.over).toBe(true)
  })

  test('adds nothing for a link on a plain-link channel like linkedin', () => {
    const body = 'Read this: '
    expect(meterFor('linkedin', draft({ body, hasLink: true })).charCount).toBe(
      meterFor('linkedin', draft({ body })).charCount,
    )
  })
})

describe('meterFor — limit boundaries', () => {
  test('does not call a draft sitting exactly on the limit over', () => {
    const meter = meterFor('x', draft({ body: 'a'.repeat(CONSTRAINTS.x.maxChars) }))
    expect(meter.charCount).toBe(280)
    expect(meter.remaining).toBe(0)
    expect(meter.over).toBe(false)
    expect(meter.violations).toEqual([])
  })

  test('calls a draft one character past the limit over with a negative remaining', () => {
    const meter = meterFor('x', draft({ body: 'a'.repeat(CONSTRAINTS.x.maxChars + 1) }))
    expect(meter.remaining).toBe(-1)
    expect(meter.over).toBe(true)
    expect(meter.violations.map((v) => v.code)).toEqual(['MAX_CHARS'])
  })
})

describe('meterFor — per-channel constraints', () => {
  test('flags instagram past its 30-hashtag cap', () => {
    const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`)
    // mediaCount: 1 because instagram now REQUIRES media — without it this draft
    // would also carry MEDIA_REQUIRED and the assertion below would be about two
    // rules at once instead of the hashtag cap.
    const meter = meterFor('instagram', draft({ body: 'Chai o clock', hashtags, mediaCount: 1 }))
    expect(meter.violations.map((v) => v.code)).toEqual(['MAX_HASHTAGS'])
    expect(meter.violations[0]?.field).toBe('hashtags')
    expect(meter.over).toBe(false)
  })

  test('leaves instagram alone at exactly 30 hashtags', () => {
    const hashtags = Array.from({ length: 30 }, (_, i) => `#tag${i}`)
    expect(
      meterFor('instagram', draft({ body: 'Chai', hashtags, mediaCount: 1 })).violations,
    ).toEqual([])
  })

  test('flags instagram with no media — there is no text-only post', () => {
    const meter = meterFor('instagram', draft({ body: 'Chai' }))
    expect(meter.violations.map((v) => v.code)).toEqual(['MEDIA_REQUIRED'])
    expect(meter.violations[0]?.field).toBe('media')
  })

  test('flags gbp for a second media item', () => {
    const meter = meterFor('gbp', draft({ body: 'Chai', mediaCount: 2 }))
    expect(meter.violations.map((v) => v.code)).toEqual(['MAX_MEDIA_COUNT'])
    expect(meter.violations[0]?.field).toBe('media')
  })

  test('accepts gbp with its single allowed media item', () => {
    expect(meterFor('gbp', draft({ body: 'Chai', mediaCount: 1 })).violations).toEqual([])
  })

  test('does not apply a hashtag cap to channels that declare none', () => {
    // 50 tags, which is well past instagram's 30 and past anything x or linkedin
    // would sanction if they had a limit. Neither declares one, so neither may
    // raise MAX_HASHTAGS however many are supplied.
    const hashtags = Array.from({ length: 50 }, (_, i) => `#tag${i}`)
    for (const channel of ['x', 'linkedin'] as const) {
      const codes = meterFor(channel, draft({ body: 'Chai', hashtags })).violations.map(
        (v) => v.code,
      )
      expect(codes).not.toContain('MAX_HASHTAGS')
    }
  })

  test('counts published hashtags against the character limit', () => {
    // The absence of a hashtag CAP is not permission to ignore the characters.
    // Fifty tags is ~350 characters of caption, which no longer fits in x's 280 —
    // and that is the honest answer now they are actually published. While
    // formatForPlatform silently dropped them, this draft read as green.
    const hashtags = Array.from({ length: 50 }, (_, i) => `#tag${i}`)
    const meter = meterFor('x', draft({ body: 'Chai', hashtags }))
    expect(meter.violations.map((v) => v.code)).toContain('MAX_CHARS')
    expect(meter.charCount).toBeGreaterThan(CONSTRAINTS.x.maxChars)
  })

  test('a handful of hashtags still fits, and is counted', () => {
    const bare = meterFor('x', draft({ body: 'Chai' }))
    const tagged = meterFor('x', draft({ body: 'Chai', hashtags: ['chai', '#pune'] }))
    expect(tagged.violations).toEqual([])
    // '\n\n#chai #pune' — the exact tail that will be published.
    expect(tagged.charCount).toBe(bare.charCount + '\n\n#chai #pune'.length)
  })

  test('reports several violations at once when a draft breaks more than one rule', () => {
    const meter = meterFor(
      'instagram',
      draft({
        body: 'a'.repeat(CONSTRAINTS.instagram.maxChars + 1),
        hashtags: Array.from({ length: 31 }, (_, i) => `#tag${i}`),
        mediaCount: 11,
      }),
    )
    expect(meter.violations.map((v) => v.code).sort()).toEqual([
      'MAX_CHARS',
      'MAX_HASHTAGS',
      'MAX_MEDIA_COUNT',
    ])
    expect(meter.over).toBe(true)
  })
})

describe('meterFor — publishability', () => {
  // CONTRACT CHANGE 2026-08-04: instagram publishes via the Zernio rail. It was
  // preview-only because we had no Meta credential; Zernio holds that credential and
  // filed the app review, so the flag flips.
  test('surfaces every channel as publishable, instagram included', () => {
    expect(meterFor('x', draft()).publishable).toBe(true)
    expect(meterFor('gbp', draft()).publishable).toBe(true)
    expect(meterFor('linkedin', draft()).publishable).toBe(true)
    expect(meterFor('instagram', draft({ mediaCount: 1 })).publishable).toBe(true)
  })

  test('an instagram draft with a photo is publishable and blocks nothing', () => {
    const meter = meterFor('instagram', draft({ body: 'Chai', mediaCount: 1 }))
    expect(meter.violations).toEqual([])
    expect(blockingChannels([meter])).toEqual([])
  })

  test('an instagram draft WITHOUT a photo blocks — the flag flip made this real', () => {
    // Previously unpublishability was "not itself a violation" and never blocked.
    // Now the block comes from the media rule instead, which is the honest place
    // for it: the post is impossible, not the channel.
    const meter = meterFor('instagram', draft({ body: 'Chai' }))
    expect(meter.violations.map((v) => v.code)).toEqual(['MEDIA_REQUIRED'])
    expect(blockingChannels([meter])).toEqual(['instagram'])
  })
})

describe('metersFor', () => {
  test('returns one meter per requested channel in the order given', () => {
    const meters = metersFor(['linkedin', 'x', 'gbp'], draft({ body: 'Chai' }))
    expect(meters.map((m) => m.channel)).toEqual(['linkedin', 'x', 'gbp'])
  })

  test('returns an empty list when no channels are selected', () => {
    expect(metersFor([], draft({ body: 'Chai' }))).toEqual([])
  })

  test('scores the same draft differently per channel', () => {
    const body = 'a'.repeat(500)
    const meters = metersFor(['x', 'linkedin'], draft({ body }))
    expect(meters[0]?.over).toBe(true)
    expect(meters[1]?.over).toBe(false)
  })

  test('does not mutate the draft or the channel list it is handed', () => {
    const channels = ['x', 'linkedin'] as const
    const d = draft({ body: 'Chai', hashtags: ['#chai'], mediaCount: 1 })
    const snapshot = JSON.stringify(d)
    metersFor(channels, d)
    expect(JSON.stringify(d)).toBe(snapshot)
    expect(channels).toEqual(['x', 'linkedin'])
  })
})

describe('blockingChannels', () => {
  test('names only the channel that is actually over, leaving the roomier one alone', () => {
    const meters = metersFor(['x', 'linkedin'], draft({ body: 'a'.repeat(500) }))
    expect(blockingChannels(meters)).toEqual(['x'])
  })

  test('returns nothing when every channel is clean', () => {
    expect(blockingChannels(metersFor(['x', 'gbp', 'linkedin'], draft({ body: 'Chai' })))).toEqual(
      [],
    )
  })

  test('names every channel with at least one violation, in meter order', () => {
    const meters = metersFor(
      ['x', 'linkedin', 'gbp'],
      draft({ body: 'a'.repeat(500), mediaCount: 2 }),
    )
    expect(blockingChannels(meters)).toEqual(['x', 'gbp'])
  })

  test('blocks on a non-character violation, not just on being over', () => {
    const meters = metersFor(['gbp'], draft({ body: 'Chai', mediaCount: 2 }))
    expect(meters[0]?.over).toBe(false)
    expect(blockingChannels(meters)).toEqual(['gbp'])
  })

  test('returns nothing for an empty meter list', () => {
    expect(blockingChannels([])).toEqual([])
  })
})

describe('never leaks internals', () => {
  const violatingMeters = [
    meterFor('x', draft({ body: 'a'.repeat(400) })),
    meterFor('gbp', draft({ body: 'a'.repeat(2000), mediaCount: 3 })),
    meterFor('linkedin', draft({ body: 'a'.repeat(4000) })),
    meterFor(
      'instagram',
      draft({
        body: 'a'.repeat(3000),
        hashtags: Array.from({ length: 40 }, (_, i) => `#t${i}`),
        mediaCount: 12,
      }),
    ),
  ]

  test('every violation carries readable copy naming a real limit', () => {
    const messages = violatingMeters.flatMap((m) => m.violations.map((v) => v.message))
    expect(messages.length).toBeGreaterThan(0)
    for (const message of messages) {
      expect(message).toMatch(/allows/i)
      expect(message.trim().length).toBeGreaterThan(0)
    }
  })

  test('no violation message exposes database text, SQL, keys or stack traces', () => {
    const messages = violatingMeters.flatMap((m) => m.violations.map((v) => v.message))
    for (const message of messages) {
      expect(message).not.toMatch(/select |insert |update |from [a-z_]+ where|workspace_id/i)
      expect(message).not.toMatch(/idempotency|supabase|postgres|pgrst/i)
      expect(message).not.toMatch(/undefined|\[object |NaN/)
      expect(message).not.toMatch(/\bat .+:\d+:\d+|Error:|stack/i)
    }
  })

  test('violation codes stay within the engine vocabulary the UI knows how to render', () => {
    const codes = new Set(violatingMeters.flatMap((m) => m.violations.map((v) => v.code)))
    for (const code of codes) {
      expect(['MAX_CHARS', 'MAX_HASHTAGS', 'MAX_MEDIA_COUNT']).toContain(code)
    }
  })
})

describe('withFormat — the second verdict, from the second source', () => {
  test('adds nothing when the version states no intent', () => {
    const meter = meterFor('x', draft({ body: 'Chai' }))
    expect(withFormat(meter, null)).toBe(meter)
  })

  test('appends the refusal AFTER the channel’s own rules', () => {
    // Both wrong at once: over the character limit AND a text post with photos.
    // The channel's rule is the more fundamental problem and reads first.
    const meter = meterFor('x', draft({ body: 'a'.repeat(400), mediaCount: 1 }))
    const merged = withFormat(meter, refuseFormat(CONSTRAINTS.x, 'text', 1))
    expect(merged.violations.map((v) => v.code)).toEqual(['MAX_CHARS', 'FORMAT_CONTRADICTED'])
  })

  test('does not mutate the meter it was given', () => {
    const meter = meterFor('x', draft({ body: 'Chai' }))
    const before = meter.violations.length
    withFormat(meter, refuseFormat(CONSTRAINTS.x, 'image', 0))
    expect(meter.violations.length).toBe(before)
  })

  test('makes a photo post with no photo BLOCK, which the engine alone never does', () => {
    // The engine finds a text-only X post entirely legal — it is. This is the
    // whole reason the format dimension exists.
    const engineOnly = meterFor('x', draft({ body: 'Chai', mediaCount: 0 }))
    expect(blockingChannels([engineOnly])).toEqual([])

    const withIntent = withFormat(engineOnly, refuseFormat(CONSTRAINTS.x, 'image', 0))
    expect(blockingChannels([withIntent])).toEqual(['x'])
  })
})
