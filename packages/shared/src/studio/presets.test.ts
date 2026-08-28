import { describe, expect, it } from 'vitest'

import { ChannelSchema, type Channel } from '../enums'
import {
  STUDIO_PRESETS,
  summariseChannelFit,
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

  /**
   * ── THIS TEST'S NAME USED TO STATE A FALSE MEASUREMENT ────────────────────
   * It read "accepts 1200x627, which is the same card one pixel shorter" while
   * asserting on 1200x629. Both halves were wrong: 629 is one pixel TALLER, and
   * 1200/627 is 1.9139, which is ABOVE the 1.91 ceiling and REFUSED. Caught by
   * an adversarial review. The card has to get taller to come inside the band,
   * not shorter, and that is the whole point of the boundary.
   */
  it('accepts 1200x629, one pixel TALLER, which brings it inside the band', () => {
    expect(1200 / 629).toBeLessThan(1.91)
    const [fit] = fitDesignToChannels({ width: 1200, height: 629, ...SMALL_PNG }, ['instagram'])
    expect(fit?.violations).toEqual([])
  })

  it('and still refuses 1200x627, which is one pixel SHORTER and further out', () => {
    expect(1200 / 627).toBeGreaterThan(1.91)
    const [fit] = fitDesignToChannels({ width: 1200, height: 627, ...SMALL_PNG }, ['instagram'])
    expect(fit?.violations.map((v) => v.code)).toContain('MEDIA_ASPECT')
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

describe('summariseChannelFit', () => {
  it('says nobody was asked, and that is not an all-clear', () => {
    expect(summariseChannelFit([])).toEqual({ kind: 'nothing-checked' })
  })

  it('says all-accepted only when every channel accepted', () => {
    const fits = fitDesignToChannels({ width: 1080, height: 1080, ...SMALL_PNG }, [
      'instagram',
      'x',
    ])
    expect(summariseChannelFit(fits)).toEqual({ kind: 'all-accepted' })
  })

  it('never reports nothing-checked and all-accepted as the same thing', () => {
    expect(summariseChannelFit([]).kind).not.toBe(
      summariseChannelFit([{ channel: 'x', violations: [] }]).kind,
    )
  })

  /**
   * THE DEFECT THIS SHAPE EXISTS TO PREVENT.
   *
   * The first version returned one sentence naming every refusing channel and
   * appended only the FIRST channel's reason. Here x refuses on bytes and
   * instagram refuses on aspect, so a single shared reason is false about one
   * of them and hands the reader a remedy that cannot work.
   */
  it('gives every refusing channel its OWN reasons, never the first one for all', () => {
    const heavyAndWide = {
      width: 1200,
      height: 628,
      mime: 'image/png',
      bytes: 6 * 1024 * 1024,
    }
    const summary = summariseChannelFit(fitDesignToChannels(heavyAndWide, ['x', 'instagram']))
    expect(summary.kind).toBe('refused')
    if (summary.kind !== 'refused') return

    const forX = summary.refusals.find((r) => r.channel === 'x')
    const forInstagram = summary.refusals.find((r) => r.channel === 'instagram')
    expect(forX).toBeDefined()
    expect(forInstagram).toBeDefined()

    // x is over its 5 MB cap and has NO aspect rule at all.
    expect(forX!.reasons.join(' ')).toMatch(/MB/)
    expect(forX!.reasons.join(' ')).not.toMatch(/1\.91/)
    // instagram is inside 8 MB but outside the aspect band.
    expect(forInstagram!.reasons.join(' ')).toMatch(/1\.91/)
  })

  it('carries every violation for a channel, not just its first', () => {
    // A gif that is also too heavy for x: wrong type AND over the cap.
    const summary = summariseChannelFit(
      fitDesignToChannels(
        { width: 1080, height: 1080, mime: 'image/gif', bytes: 9 * 1024 * 1024 },
        ['instagram'],
      ),
    )
    expect(summary.kind).toBe('refused')
    if (summary.kind !== 'refused') return
    expect(summary.refusals[0]!.reasons.length).toBeGreaterThan(1)
  })

  it('puts no raw channel key into anything it returns as prose', () => {
    // It returns DATA, so the only channel values are typed enum fields the
    // screen renders through CHANNEL_LABELS. Nothing here is a sentence.
    const summary = summariseChannelFit(
      fitDesignToChannels({ width: 1200, height: 628, ...SMALL_PNG }, ['instagram']),
    )
    expect(typeof summary).toBe('object')
    expect(JSON.stringify(summary)).not.toMatch(/does not take|do not take/)
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
