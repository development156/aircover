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
      height: 1920, // 0.56 — outside the 0.8–1.91 feed range
    })
    expect(res[0]!.violations.some((v) => v.code === 'MEDIA_ASPECT')).toBe(true)
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
      summary: 'Hello',
    })
    expect(formatForPlatform(CONSTRAINTS.x, { body: 'Hi' })).toEqual({ channel: 'x', text: 'Hi' })
  })
})
