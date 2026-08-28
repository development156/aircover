import { describe, expect, it } from 'vitest'

import { ChannelSchema, type Channel } from '../enums'
import {
  STUDIO_PRESETS,
  describeChannelFit,
  fitDesignToChannels,
  presetById,
  presetsForChannel,
} from './presets'

const ALL_CHANNELS = ChannelSchema.options as readonly Channel[]

/** A rendered PNG small enough that no channel's byte cap is in play. */
const SMALL_PNG = { mime: 'image/png', bytes: 400_000 }

/**
 * The channels a preset leaves off for a PRODUCT reason rather than a legal one.
 *
 * Every other omission has to be a refusal the engine actually returns. This
 * table is the only escape hatch and it is deliberately tiny: each row is a
 * decision somebody made, written down where the test can see it, so that
 * "which channels is this size for?" can never quietly become a matter of
 * whoever last edited the array.
 */
const OFFERED_NARROWER_THAN_LEGAL: Record<string, readonly Channel[]> = {
  // A full-height phone story in a LinkedIn feed or on a Google Business
  // listing is legal and wrong. LinkedIn declares no image dimensions at all
  // and Google Business only declares a 250px floor, so the engine has nothing
  // to refuse either with.
  story: ['linkedin', 'gbp'],
  // Google Business renders a post as a wide-ish card and crops a tall picture
  // to fit it. 1080x1350 is accepted and then cut, which is worse than not
  // being offered: the person approves one picture and the listing shows
  // another. `business-update` is the 4:3 size for that surface.
  //
  // THIS ROW WAS WRITTEN BECAUSE THE TEST BELOW DEMANDED IT. gbp was left off
  // `portrait` on the first draft of this file with no reason at all, and the
  // omission survived exactly one test run.
  portrait: ['gbp'],
  // A link card is the picture a shared link unfurls into. A Google Business
  // post does not unfurl a link: it carries a CTA button instead, which is why
  // `gbp.ctaTypes` exists on the spec and no other channel has one. So the size
  // is accepted there and means nothing there.
  'link-card': ['gbp'],
}

/**
 * Google Business accepts EVERY size in this table, because its only image rule
 * is a 250 pixel floor. That is why it appears in this escape hatch three times
 * and why each row had to be argued rather than assumed: a channel the engine
 * can never refuse is a channel where the product choice is the ONLY choice,
 * and the test above is what forces that choice to be written down.
 */

describe('STUDIO_PRESETS', () => {
  it('has a unique id and a positive size for every preset', () => {
    const ids = STUDIO_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of STUDIO_PRESETS) {
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(Number.isInteger(preset.width)).toBe(true)
      expect(Number.isInteger(preset.height)).toBe(true)
    }
  })

  it('names only channels that exist', () => {
    for (const preset of STUDIO_PRESETS) {
      for (const channel of preset.channels) {
        expect(ALL_CHANNELS).toContain(channel)
      }
    }
  })

  /**
   * HALF ONE: every channel a preset claims must actually accept it.
   *
   * This is the assertion that would catch a size typed in from a blog post.
   */
  it('every channel a preset is offered for accepts that size', () => {
    for (const preset of STUDIO_PRESETS) {
      const fits = fitDesignToChannels(
        { width: preset.width, height: preset.height, ...SMALL_PNG },
        preset.channels,
      )
      for (const fit of fits) {
        expect(
          fit.violations,
          `${preset.id} (${preset.width}x${preset.height}) claims ${fit.channel}, which refused it: ${fit.violations.map((v) => v.message).join(' ')}`,
        ).toEqual([])
      }
    }
  })

  /**
   * HALF TWO: every channel a preset does NOT claim must have a reason.
   *
   * Either the Constraint Engine refuses it, or it is named in
   * `OFFERED_NARROWER_THAN_LEGAL` above. Silence is not a third option. Without
   * this half the table is a list of opinions and a channel could be dropped by
   * a careless edit with nothing to notice.
   */
  it('every channel a preset omits is either refused by the engine or named as a product choice', () => {
    for (const preset of STUDIO_PRESETS) {
      const omitted = ALL_CHANNELS.filter((channel) => !preset.channels.includes(channel))
      const excused = OFFERED_NARROWER_THAN_LEGAL[preset.id] ?? []
      const fits = fitDesignToChannels(
        { width: preset.width, height: preset.height, ...SMALL_PNG },
        omitted,
      )
      for (const fit of fits) {
        if (excused.includes(fit.channel)) continue
        expect(
          fit.violations.length,
          `${preset.id} leaves out ${fit.channel}, but ${fit.channel} accepts ${preset.width}x${preset.height}. Offer it, or name it in OFFERED_NARROWER_THAN_LEGAL with a reason.`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('does not excuse a channel that the engine already refuses', () => {
    for (const [presetId, excused] of Object.entries(OFFERED_NARROWER_THAN_LEGAL)) {
      const preset = presetById(presetId)
      expect(
        preset,
        `OFFERED_NARROWER_THAN_LEGAL names a preset that does not exist: ${presetId}`,
      ).not.toBeNull()
      const fits = fitDesignToChannels(
        { width: preset!.width, height: preset!.height, ...SMALL_PNG },
        excused,
      )
      for (const fit of fits) {
        expect(
          fit.violations,
          `${presetId} excuses ${fit.channel} as a product choice, but the engine refuses it anyway. The excuse is hiding a real limit.`,
        ).toEqual([])
      }
    }
  })
})

/**
 * THE BOUNDARY ROW.
 *
 * 1200/628 is 1.910828, and Instagram's ceiling is 1.91. If the aspect check
 * ever stops running, or the range widens, this is the test that says so. It
 * asserts the CODE, not the sentence, so the message can be rewritten freely.
 */
describe('the link card and Instagram', () => {
  it('Instagram refuses 1200x628 by less than a thousandth of a ratio', () => {
    const [fit] = fitDesignToChannels({ width: 1200, height: 628, ...SMALL_PNG }, ['instagram'])
    expect(fit?.violations.map((v) => v.code)).toContain('MEDIA_ASPECT')
    expect(1200 / 628).toBeGreaterThan(1.91)
  })

  it('and accepts 1200x627, which is the same card one pixel shorter', () => {
    const [fit] = fitDesignToChannels({ width: 1200, height: 629, ...SMALL_PNG }, ['instagram'])
    expect(fit?.violations).toEqual([])
  })

  it('so the link card is not offered for Instagram', () => {
    expect(presetById('link-card')?.channels).not.toContain('instagram')
  })
})

describe('fitDesignToChannels', () => {
  it('reads the byte cap per channel rather than applying one number to all', () => {
    // 6 MB: over the 5 MB cap on x, gbp and linkedin; under the 8 MB cap on
    // facebook, telegram and instagram.
    const heavy = { width: 1080, height: 1080, mime: 'image/png', bytes: 6 * 1024 * 1024 }
    const fits = fitDesignToChannels(heavy, ALL_CHANNELS)
    const refused = fits.filter((f) => f.violations.some((v) => v.code === 'MEDIA_SIZE'))
    expect(refused.map((f) => f.channel).sort()).toEqual(['gbp', 'linkedin', 'x'])
  })

  it('refuses a format a channel does not accept', () => {
    // x takes gif; nobody else does.
    const gif = { width: 1080, height: 1080, mime: 'image/gif', bytes: 400_000 }
    const fits = fitDesignToChannels(gif, ['x', 'instagram'])
    expect(fits.find((f) => f.channel === 'x')?.violations).toEqual([])
    expect(fits.find((f) => f.channel === 'instagram')?.violations.map((v) => v.code)).toContain(
      'MEDIA_TYPE',
    )
  })

  it('asks nothing when given no channels', () => {
    expect(fitDesignToChannels({ width: 1080, height: 1080, ...SMALL_PNG }, [])).toEqual([])
  })
})

describe('describeChannelFit', () => {
  it('says nobody was asked, and never calls that an all-clear', () => {
    const said = describeChannelFit([])
    expect(said).toBe('No channel was checked for this size.')
    expect(said).not.toMatch(/every channel|all channels|accepted|ready/i)
  })

  it('says nothing at all when every channel accepts', () => {
    const fits = fitDesignToChannels({ width: 1080, height: 1080, ...SMALL_PNG }, [
      'instagram',
      'x',
    ])
    expect(describeChannelFit(fits)).toBeNull()
  })

  it('names the channels that refused, and carries the reason through', () => {
    const fits = fitDesignToChannels({ width: 1200, height: 628, ...SMALL_PNG }, [
      'instagram',
      'facebook',
    ])
    const said = describeChannelFit(fits)
    expect(said).toContain('instagram')
    expect(said).not.toContain('facebook')
    expect(said).toMatch(/1\.91/)
  })

  it('joins two refusals with "and" rather than a bare list', () => {
    const heavy = { width: 1080, height: 1080, mime: 'image/png', bytes: 6 * 1024 * 1024 }
    const said = describeChannelFit(fitDesignToChannels(heavy, ['x', 'gbp']))
    expect(said).toContain('x and gbp')
    expect(said).toContain('do not take')
  })

  it('uses the singular verb for one channel', () => {
    const said = describeChannelFit(
      fitDesignToChannels({ width: 1200, height: 628, ...SMALL_PNG }, ['instagram']),
    )
    expect(said).toContain('does not take')
  })
})

describe('presetsForChannel', () => {
  it('gives every channel at least one size to work with', () => {
    for (const channel of ALL_CHANNELS) {
      expect(presetsForChannel(channel).length, `${channel} has no preset`).toBeGreaterThan(0)
    }
  })

  it('returns nothing for an id nobody defined', () => {
    expect(presetById('polaroid')).toBeNull()
  })
})
