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

  it('instagram is not publishable and caps hashtags at 30', () => {
    expect(CONSTRAINTS.instagram.publishable).toBe(false)
    const many = Array(31).fill('#x')
    expect(
      validateVariant(CONSTRAINTS.instagram, { body: 'hi', hashtags: many }).violations.some(
        (v) => v.code === 'MAX_HASHTAGS',
      ),
    ).toBe(true)
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
