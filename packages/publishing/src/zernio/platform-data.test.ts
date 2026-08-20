import { describe, it, expect } from 'vitest'
import { CONSTRAINTS, type FormattedContent } from '@sahoda/shared'

import { buildPlatformData, zernioMediaType } from './platform-data'

/**
 * The per-channel half of a Zernio publish.
 *
 * ── WHAT WOULD MAKE THESE TESTS WORTHLESS ────────────────────────────────────
 * Asserting that a CTA produces `{ callToAction: {...} }` and stopping. That
 * passes against an implementation that emits the object and an adapter that
 * never puts it in the request — which is precisely the state this work found:
 * the composer wrote `extras.gbpCta`, and nothing between there and Google read
 * it. `adapters/zernio.test.ts` asserts the other half, on the wire body.
 */

const gbp = (extra: Partial<Extract<FormattedContent, { channel: 'gbp' }>> = {}) =>
  ({
    channel: 'gbp' as const,
    summary: 'Open till 9 today',
    media: [],
    ...extra,
  }) as FormattedContent

const ig = (): FormattedContent => ({ channel: 'instagram', caption: 'chai', media: [] })

describe('the Google button', () => {
  it('is sent when both halves are there', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'image',
      content: gbp({ ctaType: 'ORDER', ctaUrl: 'https://chai.example/order' }),
    })
    expect(r).toEqual({
      ok: true,
      data: { callToAction: { type: 'ORDER', url: 'https://chai.example/order' } },
    })
  })

  it('refuses a button with nowhere to go, rather than dropping it', () => {
    // Zernio's own schema marks callToAction as required:['type','url']. Dropping
    // it silently is what the composer has effectively been doing for weeks.
    for (const ctaUrl of [undefined, '', '   ']) {
      const r = buildPlatformData({
        channel: 'gbp',
        format: 'image',
        content: gbp({ ctaType: 'BOOK', ...(ctaUrl === undefined ? {} : { ctaUrl }) }),
      })
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.refusal.code).toBe('GBP_CTA_NEEDS_URL')
      expect(r.refusal.message).toMatch(/web address/)
    }
  })

  it('refuses a button Google does not have, reading the engine’s own list', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'image',
      content: gbp({ ctaType: 'TELEPORT', ctaUrl: 'https://x.example' }),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusal.code).toBe('GBP_CTA_UNKNOWN')
    // The list is the frozen Constraint Engine's, not a copy kept here.
    expect(CONSTRAINTS.gbp.gbp?.ctaTypes).not.toContain('TELEPORT')
    for (const type of CONSTRAINTS.gbp.gbp?.ctaTypes ?? []) {
      expect(
        buildPlatformData({
          channel: 'gbp',
          format: 'image',
          content: gbp({ ctaType: type, ctaUrl: 'https://x.example' }),
        }).ok,
      ).toBe(true)
    }
  })

  it('sends the six codes Zernio’s own enum lists, exactly', () => {
    // docs/31 §2.4 — read out of GoogleBusinessPlatformData.callToAction.type on
    // 2026-08-20. Recorded as a test so a future edit to the engine's list has to
    // face the vendor's.
    expect([...(CONSTRAINTS.gbp.gbp?.ctaTypes ?? [])].sort()).toEqual(
      ['BOOK', 'CALL', 'LEARN_MORE', 'ORDER', 'SHOP', 'SIGN_UP'].sort(),
    )
  })

  it('says nothing when there is no button, which is the normal post', () => {
    expect(buildPlatformData({ channel: 'gbp', format: 'text', content: gbp() })).toEqual({
      ok: true,
      data: undefined,
    })
    // A URL with no button is a link in the body, not a broken CTA.
    expect(
      buildPlatformData({
        channel: 'gbp',
        format: 'text',
        content: gbp({ ctaUrl: 'https://chai.example' }),
      }),
    ).toEqual({ ok: true, data: undefined })
  })
})

describe('a story is a different kind of post, and says so', () => {
  it('sets contentType only for an Instagram story', () => {
    expect(buildPlatformData({ channel: 'instagram', format: 'story', content: ig() })).toEqual({
      ok: true,
      data: { contentType: 'story' },
    })
    for (const format of ['image', 'carousel', 'text', null] as const) {
      expect(buildPlatformData({ channel: 'instagram', format, content: ig() }).ok).toBe(true)
      expect(
        (buildPlatformData({ channel: 'instagram', format, content: ig() }) as { data: unknown })
          .data,
      ).toBeUndefined()
    }
  })

  it('carries nothing at all for a channel with no per-channel field', () => {
    for (const channel of ['x', 'linkedin'] as const) {
      const content =
        channel === 'x'
          ? ({ channel: 'x', text: 'hi', media: [] } as FormattedContent)
          : ({ channel: 'linkedin', text: 'hi', media: [] } as FormattedContent)
      const r = buildPlatformData({ channel, format: 'image', content })
      expect(r).toEqual({ ok: true, data: undefined })
    }
  })

  it('returns undefined rather than {}, because they mean different things', () => {
    // `{}` would be a claim that we considered the per-channel fields and chose
    // none; undefined is "this entry carries none", which is what goes on the wire.
    const r = buildPlatformData({
      channel: 'linkedin',
      format: 'text',
      content: { channel: 'linkedin', text: 'x', media: [] },
    })
    expect(r.ok && r.data === undefined).toBe(true)
  })
})

describe('the media type comes from the bytes’ own mime', () => {
  it('no longer says image for everything', () => {
    expect(zernioMediaType('image/gif')).toBe('gif')
    expect(zernioMediaType('video/mp4')).toBe('video')
    expect(zernioMediaType('application/pdf')).toBe('document')
    expect(zernioMediaType('image/jpeg')).toBe('image')
    expect(zernioMediaType('image/png')).toBe('image')
  })

  it('is case-insensitive, because a mime column is not normalised', () => {
    expect(zernioMediaType('IMAGE/GIF')).toBe('gif')
    expect(zernioMediaType('Video/MP4')).toBe('video')
  })

  it('falls back to image rather than throwing on a mime it does not know', () => {
    // Anything reaching here has already passed the Constraint Engine's
    // `mediaTypes` check, which is the thing entitled to refuse a file.
    expect(zernioMediaType('image/avif')).toBe('image')
    expect(zernioMediaType('')).toBe('image')
  })

  it('classifies every mime the four channels actually accept', () => {
    for (const spec of Object.values(CONSTRAINTS)) {
      for (const mime of spec.mediaTypes) {
        const type = zernioMediaType(mime)
        expect(type).toBe(mime === 'image/gif' ? 'gif' : 'image')
      }
    }
  })
})
