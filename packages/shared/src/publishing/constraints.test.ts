import { describe, it, expect } from 'vitest'
import { ChannelSchema } from '../enums'
import {
  CHANNEL_LABELS,
  CONSTRAINTS,
  validateVariant,
  validateMedia,
  formatForPlatform,
} from './constraints'

describe('constraint engine v0', () => {
  it('covers every channel in the schema, and invents none', () => {
    // DERIVED, not restated. This asserted the literal
    // `['gbp','instagram','linkedin','x']`, so it was a test of a hardcoded list
    // against a hardcoded list — it went red the moment two channels were added
    // and said nothing about whether the new ones had specs, which is the
    // guarantee anyone reading the name wants.
    //
    // Both directions matter and the second is the sharper one: a spec for a
    // channel the schema does not have is a limit nothing can ever enforce,
    // sitting in the file that is supposed to be the single source of them.
    expect(Object.keys(CONSTRAINTS).sort()).toEqual([...ChannelSchema.options].sort())
  })

  it('x rejects over-280 and weights a link at 23', () => {
    const long = 'a'.repeat(281)
    expect(
      validateVariant(CONSTRAINTS.x, { body: long }).violations.some((v) => v.code === 'MAX_CHARS'),
    ).toBe(true)
    const withLink = validateVariant(CONSTRAINTS.x, { body: 'a'.repeat(260), hasLink: true })
    expect(withLink.charCount).toBe(283)
    expect(withLink.violations.some((v) => v.code === 'MAX_CHARS')).toBe(true)
  })

  // CONTRACT CHANGE 2026-08-04: instagram is publishable via the Zernio rail. Our app
  // holds no Meta credential and filed no Meta app review — Zernio owns both, confirmed
  // [LIVE] from the authUrl's client_id (doc 13 §7).
  it('instagram is publishable via Zernio and caps hashtags at 30', () => {
    expect(CONSTRAINTS.instagram.publishable).toBe(true)
    const many = Array(31).fill('#x')
    expect(
      validateVariant(CONSTRAINTS.instagram, {
        body: 'hi',
        hashtags: many,
        mediaCount: 1,
      }).violations.some((v) => v.code === 'MAX_HASHTAGS'),
    ).toBe(true)
  })

  it('instagram refuses a caption-only variant — there is no text-only post', () => {
    const { violations } = validateVariant(CONSTRAINTS.instagram, { body: 'hi' })
    expect(violations.some((v) => v.code === 'MEDIA_REQUIRED')).toBe(true)
  })

  it('instagram refuses a portrait phone photo on aspect ratio', () => {
    const res = validateMedia([CONSTRAINTS.instagram], {
      mime: 'image/jpeg',
      bytes: 1_000_000,
      width: 1080,
      height: 1920, // 0.56 — outside the 0.75–1.91 feed range
    })
    expect(res[0]!.violations.some((v) => v.code === 'MEDIA_ASPECT')).toBe(true)
  })

  /**
   * ── THE FEED RANGE, AT ITS EDGES, ON THE VENDOR'S OWN AUTHORITY ────────────
   * These four numbers are not chosen to be comfortably inside and outside. They
   * are the exact pixel dimensions put to `POST /v1/tools/validate/post` on
   * 2026-08-20, and the pass/fail below is the answer it gave (docs/32 §2,
   * reproduce with `node scripts/zernio/validate-probe.mjs`).
   *
   * A test that asserted 0.9 passes and 0.5 fails would have gone green against
   * the OLD floor of 0.8 and against the new one, which is to say it would have
   * been checking nothing about the bound it appears to be about. 749 vs 750 is
   * the smallest step that can tell the two apart, and it is the whole point.
   */
  it.each([
    [750, 1000, false, '0.7500 — the floor itself, accepted by Instagram'],
    [749, 1000, true, '0.7490 — one pixel narrower, refused'],
    [1910, 1000, false, '1.9100 — the ceiling itself, accepted'],
    [1911, 1000, true, '1.9110 — one pixel wider, refused'],
  ])('instagram aspect %ix%i → refused=%s (%s)', (width, height, refused) => {
    const res = validateMedia([CONSTRAINTS.instagram], {
      mime: 'image/jpeg',
      bytes: 1_000_000,
      width,
      height,
    })
    expect(res[0]!.violations.some((v) => v.code === 'MEDIA_ASPECT')).toBe(refused)
  })

  it('instagram refuses a non-JPEG/PNG at compose time', () => {
    const res = validateMedia([CONSTRAINTS.instagram], {
      mime: 'image/webp',
      bytes: 1000,
      width: 1080,
      height: 1080,
    })
    expect(res[0]!.violations.some((v) => v.code === 'MEDIA_TYPE')).toBe(true)
  })

  it('formatForPlatform carries media into the instagram payload', () => {
    const out = formatForPlatform(CONSTRAINTS.instagram, { body: 'caption', mediaCount: 1 }, [
      { url: 'https://media.zernio.com/x.jpg', mime: 'image/jpeg' },
    ])
    expect(out).toMatchObject({ channel: 'instagram', caption: 'caption' })
    expect(out.channel === 'instagram' && out.media).toHaveLength(1)
  })

  it('validateMedia flags wrong type + too-small dims per channel', () => {
    const res = validateMedia([CONSTRAINTS.gbp], {
      mime: 'image/gif',
      bytes: 99,
      width: 100,
      height: 100,
    })
    const codes = res[0]!.violations.map((v) => v.code)
    expect(codes).toContain('MEDIA_TYPE')
    expect(codes).toContain('MEDIA_DIMS')
  })

  it('formatForPlatform emits channel-tagged payloads', () => {
    expect(formatForPlatform(CONSTRAINTS.gbp, { body: 'Hello' })).toEqual({
      channel: 'gbp',
      media: [],
      summary: 'Hello',
    })
    expect(formatForPlatform(CONSTRAINTS.x, { body: 'Hi' })).toEqual({
      channel: 'x',
      text: 'Hi',
      media: [],
    })
  })
})

/**
 * ── IMAGE FLOORS THE PLATFORMS ACTUALLY ENFORCE ──────────────────────────────
 * docs/31 §6.3: gbp's floor was 250×250 where Google's is 400×300, and linkedin
 * had no floor at all where the vendor's is 552×276. Both showed green on files
 * the platform refuses at 9am with nobody watching.
 */
describe('image dimension floors (docs/31 §2.2, §2.4, §6.3)', () => {
  const png = (width: number, height: number) => ({ mime: 'image/png', bytes: 1000, width, height })
  const codesFor = (channel: 'gbp' | 'linkedin', width: number, height: number) =>
    validateMedia([CONSTRAINTS[channel]], png(width, height))[0]!.violations.map((v) => v.code)

  it('gbp refuses a 300×300 image, which Google refuses at publish', () => {
    expect(codesFor('gbp', 300, 300)).toContain('MEDIA_DIMS')
  })

  it('gbp accepts exactly 400×300', () => {
    expect(codesFor('gbp', 400, 300)).not.toContain('MEDIA_DIMS')
  })

  it('gbp refuses 400×299 and 399×300 (both edges are floors)', () => {
    expect(codesFor('gbp', 400, 299)).toContain('MEDIA_DIMS')
    expect(codesFor('gbp', 399, 300)).toContain('MEDIA_DIMS')
  })

  it('linkedin refuses a 100×100 image, which used to pass every check', () => {
    expect(codesFor('linkedin', 100, 100)).toContain('MEDIA_DIMS')
  })

  it('linkedin accepts exactly 552×276 and refuses one pixel under on either edge', () => {
    expect(codesFor('linkedin', 552, 276)).not.toContain('MEDIA_DIMS')
    expect(codesFor('linkedin', 551, 276)).toContain('MEDIA_DIMS')
    expect(codesFor('linkedin', 552, 275)).toContain('MEDIA_DIMS')
  })

  it('neither floor is applied when the file has no measured dimensions', () => {
    const res = validateMedia([CONSTRAINTS.gbp, CONSTRAINTS.linkedin], {
      mime: 'image/png',
      bytes: 1000,
    })
    for (const r of res) expect(r.violations.map((v) => v.code)).not.toContain('MEDIA_DIMS')
  })
})

describe('CHANNEL_LABELS', () => {
  it('names every channel in the schema with a display name that is not the key', () => {
    for (const channel of ChannelSchema.options) {
      const label = CHANNEL_LABELS[channel]
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(channel)
    }
  })

  it('spells the Google channel out in full', () => {
    expect(CHANNEL_LABELS.gbp).toBe('Google Business Profile')
  })
})
