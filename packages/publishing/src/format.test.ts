import { describe, it, expect } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'

import { acceptsVideo, formatsFor, refuseFormat } from './format'

/**
 * The format rules, and the fact they are DERIVED rather than restated.
 *
 * ── WHAT WOULD MAKE THESE TESTS WORTHLESS ────────────────────────────────────
 * Asserting `refuseFormat(instagram, 'video', 1)` refuses, and stopping there.
 * That passes against a hardcoded "video is impossible" list, which is the wrong
 * implementation: the frozen Constraint Engine is the thing that decides what a
 * channel accepts, and a second list beside it goes stale silently — this repo
 * has a standing rule about exactly that, and a card about three copies of a
 * four-entry list.
 *
 * So the tests below assert the DERIVATION: video is refused BECAUSE no channel
 * declares a `video/*` mime, and the moment one does the refusal must stop.
 */

describe('what the four channels can genuinely publish', () => {
  it('offers text everywhere except Instagram, which has no text-only post', () => {
    expect(formatsFor(CONSTRAINTS.x)).toContain('text')
    expect(formatsFor(CONSTRAINTS.gbp)).toContain('text')
    expect(formatsFor(CONSTRAINTS.linkedin)).toContain('text')
    // `requiresMedia: true` — the engine's own field, not a list kept here.
    expect(formatsFor(CONSTRAINTS.instagram)).not.toContain('text')
  })

  it('offers image everywhere', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(formatsFor(spec)).toContain('image')
    }
  })

  it('offers a set only where more than one image fits', () => {
    // GBP takes one. X 4, LinkedIn 9, Instagram 10.
    expect(formatsFor(CONSTRAINTS.gbp)).not.toContain('carousel')
    expect(formatsFor(CONSTRAINTS.x)).toContain('carousel')
  })

  it('offers video NOWHERE, because no channel declares a video mime', () => {
    // The measurement behind P4's answer, asserted rather than described: every
    // channel's `mediaTypes` is image-only, so video cannot be enforced and is
    // therefore not offered.
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(acceptsVideo(spec)).toBe(false)
      expect(formatsFor(spec)).not.toContain('video')
    }
  })

  it('would offer video the moment the contract admitted one — this is derived', () => {
    // THE TEST THAT PROVES IT IS NOT A HARDCODED LIST. A copy of the spec with a
    // video mime must stop being refused, with no change here.
    const withVideo = { ...CONSTRAINTS.instagram, mediaTypes: ['image/jpeg', 'video/mp4'] }

    expect(acceptsVideo(withVideo)).toBe(true)
    expect(formatsFor(withVideo)).toContain('video')
    expect(refuseFormat(withVideo, 'video', 1)).toBeNull()
  })
})

describe('refusing a post that is not what it says it is', () => {
  it('lets every variant written before the column existed through untouched', () => {
    // The entire compatibility story. A variant with no format states no intent,
    // so there is nothing to hold it to and nothing changes for it.
    expect(refuseFormat(CONSTRAINTS.x, null, 0)).toBeNull()
    expect(refuseFormat(CONSTRAINTS.x, undefined, 3)).toBeNull()
    expect(refuseFormat(CONSTRAINTS.instagram, null, 0)).toBeNull()
  })

  it('refuses video on every channel today', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(refuseFormat(spec, 'video', 1)?.code).toBe('FORMAT_UNSUPPORTED')
    }
  })

  it('refuses text where the channel has no text-only post', () => {
    expect(refuseFormat(CONSTRAINTS.instagram, 'text', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.x, 'text', 0)).toBeNull()
  })

  it('refuses a set on a channel that takes one image', () => {
    expect(refuseFormat(CONSTRAINTS.gbp, 'carousel', 2)?.code).toBe('FORMAT_UNSUPPORTED')
  })

  it('catches a text-only post that has an image attached', () => {
    // NOTHING ELSE IN THE PIPELINE CAN SEE THIS. The engine checks media against
    // the channel and finds an image perfectly legal on X; only the declared
    // format knows the writer did not mean to send one.
    const refusal = refuseFormat(CONSTRAINTS.x, 'text', 1)
    expect(refusal?.code).toBe('FORMAT_CONTRADICTED')
    expect(refusal?.message).toContain('an image')
  })

  it('catches a photo post with no photo', () => {
    // The mirror image, and the one that matters more: on x, gbp and linkedin this
    // publishes today as a bare text post and reports success.
    expect(refuseFormat(CONSTRAINTS.x, 'image', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.linkedin, 'image', 0)?.code).toBe('FORMAT_NEEDS_MEDIA')
  })

  it('catches a set with only one image', () => {
    expect(refuseFormat(CONSTRAINTS.x, 'carousel', 1)?.code).toBe('FORMAT_NEEDS_MEDIA')
    expect(refuseFormat(CONSTRAINTS.x, 'carousel', 2)).toBeNull()
  })

  it('passes the posts that are what they say they are', () => {
    expect(refuseFormat(CONSTRAINTS.x, 'text', 0)).toBeNull()
    expect(refuseFormat(CONSTRAINTS.instagram, 'image', 1)).toBeNull()
    expect(refuseFormat(CONSTRAINTS.linkedin, 'carousel', 3)).toBeNull()
  })
})
