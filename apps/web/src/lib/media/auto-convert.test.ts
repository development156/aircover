import { describe, expect, it } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'

import { autoConvertNote, planAutoConvert } from './auto-convert'
import type { MediaTarget } from './targets'

/**
 * The targets are built FROM THE ENGINE, not typed out. A test that hard-coded
 * "instagram takes jpeg and png" would keep passing on the day the spec widened,
 * and the whole point of this module is that it follows the spec.
 */
function target(channel: 'x' | 'instagram' | 'gbp' | 'linkedin'): MediaTarget {
  return withMimes(channel, CONSTRAINTS[channel].mediaTypes)
}

/**
 * A complete `MediaTarget`. Built in full rather than cast, so a field added to
 * the type reaches this file as a compile error instead of being silently absent
 * — the geometry fields are `null` because `planAutoConvert` is told about
 * geometry through `hasNonFormatObjection`, never by measuring it itself.
 */
function withMimes(
  channel: 'x' | 'instagram' | 'gbp' | 'linkedin',
  mimes: readonly string[],
): MediaTarget {
  return {
    channel,
    format: null,
    aspect: null,
    minW: null,
    minH: null,
    mimes,
    maxBytes: CONSTRAINTS[channel].maxMediaMB * 1024 * 1024,
  }
}

describe('planAutoConvert', () => {
  it('leaves a file alone when every channel already accepts it', () => {
    expect(
      planAutoConvert({
        originalMime: 'image/jpeg',
        targets: [target('instagram'), target('x')],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'none' })
  })

  it('converts a WebP bound for Instagram, which is the case it exists for', () => {
    // Instagram lists jpeg and png. Today this refuses and sends the owner away to
    // convert a file with a tool we already ship.
    expect(
      planAutoConvert({
        originalMime: 'image/webp',
        targets: [target('instagram')],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'transcode', mime: 'image/jpeg' })
  })

  it('sends a GIF to PNG, not JPEG, because line art is not a photograph', () => {
    // A lossy re-encode of flat colour and hard edges is visibly worse. PNG is
    // lossless, and `outputMimeFor` picks by what the original IS.
    expect(
      planAutoConvert({
        originalMime: 'image/gif',
        targets: [target('linkedin')],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'transcode', mime: 'image/png' })
  })

  it('does NOT convert when the geometry is also wrong', () => {
    // The worst outcome available: re-encode the file, then have it refused anyway
    // for a dimension the container never affected. The crop is the owner's call.
    expect(
      planAutoConvert({
        originalMime: 'image/webp',
        targets: [target('instagram')],
        hasNonFormatObjection: true,
      }),
    ).toEqual({ kind: 'refuse', reason: 'needs_crop' })
  })

  it('refuses rather than guessing when no container suits every channel', () => {
    expect(
      planAutoConvert({
        originalMime: 'image/png',
        targets: [withMimes('x', ['image/webp']), target('gbp')],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'refuse', reason: 'no_common_container' })
  })

  it('refuses a post with no channels rather than inventing a target', () => {
    expect(
      planAutoConvert({
        originalMime: 'image/webp',
        targets: [],
        hasNonFormatObjection: false,
      }),
    ).toEqual({ kind: 'refuse', reason: 'no_common_container' })
  })

  it('never plans a container the channels do not all accept', () => {
    // The property behind every case above, asserted across the whole matrix. A
    // conversion that produces a file the publish gate then refuses is worse than
    // no conversion: the work happened and the refusal is unchanged.
    const channels = ['x', 'instagram', 'gbp', 'linkedin'] as const
    const sources = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    for (const a of channels) {
      for (const b of channels) {
        for (const mime of sources) {
          const targets = [target(a), target(b)]
          const plan = planAutoConvert({
            originalMime: mime,
            targets,
            hasNonFormatObjection: false,
          })
          if (plan.kind !== 'transcode') continue
          for (const t of targets) {
            expect(t.mimes, `${mime} → ${plan.mime} for ${a}+${b}`).toContain(plan.mime)
          }
        }
      }
    }
  })

  it('never plans AVIF, which nothing in the product can publish or even read', () => {
    const plans = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].map((mime) =>
      planAutoConvert({
        originalMime: mime,
        targets: [target('x')],
        hasNonFormatObjection: false,
      }),
    )

    for (const plan of plans) {
      if (plan.kind === 'transcode') expect(plan.mime).not.toBe('image/avif')
    }
  })
})

describe('autoConvertNote', () => {
  it('says what happened, in the customer’s words, and that the original survives', () => {
    const note = autoConvertNote('image/webp', 'image/jpeg')

    expect(note).toContain('WebP')
    expect(note).toContain('JPEG')
    // The reassurance is load-bearing: a person who thinks we replaced their file
    // will go looking for the original, and it is exactly where they left it.
    expect(note).toContain('original is untouched')
  })

  it('names formats the way a person writes them, never as mime types', () => {
    expect(autoConvertNote('image/gif', 'image/png')).not.toContain('image/')
  })
})
