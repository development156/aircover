import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, validateVariant, validateMedia, formatForPlatform } from './constraints'

describe('constraint engine v0', () => {
  it('covers all four channels', () => {
    expect(Object.keys(CONSTRAINTS).sort()).toEqual(['gbp', 'instagram', 'linkedin', 'x'])
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
  ])(
    'instagram aspect %ix%i → refused=%s (%s)',
    (width, height, refused) => {
      const res = validateMedia([CONSTRAINTS.instagram], {
        mime: 'image/jpeg',
        bytes: 1_000_000,
        width,
        height,
      })
      expect(res[0]!.violations.some((v) => v.code === 'MEDIA_ASPECT')).toBe(refused)
    },
  )

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
