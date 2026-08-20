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

const x = (text = 'hello'): FormattedContent => ({ channel: 'x', text, media: [] })
const li = (): FormattedContent => ({ channel: 'linkedin', text: 'hello', media: [] })

describe('polls reach the wire, and the combinations Zernio refuses are refused here', () => {
  it('sends an X poll in the shape Zernio names', () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'text',
      content: x(),
      options: { poll: { options: ['Chai', 'Coffee'], durationMinutes: 1440 } },
    })
    // snake_case `duration_minutes`, unlike everything around it. MEASURED from
    // their own error text, not inferred from the rest of the schema.
    expect(r).toEqual({
      ok: true,
      data: { poll: { options: ['Chai', 'Coffee'], duration_minutes: 1440 } },
    })
  })

  it('sends a LinkedIn poll with its question and duration code', () => {
    const r = buildPlatformData({
      channel: 'linkedin',
      format: 'text',
      content: li(),
      options: {
        poll: { question: 'Chai or coffee?', options: ['Chai', 'Coffee'], durationCode: 'ONE_DAY' },
      },
    })
    expect(r).toEqual({
      ok: true,
      data: {
        poll: { question: 'Chai or coffee?', options: ['Chai', 'Coffee'], duration: 'ONE_DAY' },
      },
    })
  })

  it('drops blank answers rather than sending them', () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'text',
      content: x(),
      options: { poll: { options: ['Chai', 'Coffee', '', '  '], durationMinutes: 60 } },
    })
    expect(r.ok && (r.data as { poll: { options: string[] } }).poll.options).toEqual([
      'Chai',
      'Coffee',
    ])
  })

  /**
   * *"Cannot create a poll with media attachments. X/Twitter polls are mutually
   * exclusive with images and videos."* — Zernio, MEASURED. Refused here so the
   * writer meets it in the composer rather than at publish time.
   */
  it('refuses a poll with a photo attached', () => {
    for (const channel of ['x', 'linkedin'] as const) {
      const r = buildPlatformData({
        channel,
        format: 'image',
        content: channel === 'x' ? x() : li(),
        options: {
          poll:
            channel === 'x'
              ? { options: ['a', 'b'], durationMinutes: 60 }
              : { question: 'Q?', options: ['a', 'b'], durationCode: 'ONE_DAY' },
        },
        mediaCount: 1,
      })
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.refusal.code).toBe('POLL_WITH_MEDIA')
    }
  })

  /** *"Polls cannot be added to threads"* — Zernio, MEASURED. */
  it('refuses a poll on a thread', () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'thread',
      content: x(),
      thread: { segments: ['one', 'two'] },
      options: { poll: { options: ['a', 'b'], durationMinutes: 60 } },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.refusal.code).toBe('POLL_WITH_THREAD')
  })

  it('refuses an invalid poll before it can reach the wire', () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'text',
      content: x(),
      options: { poll: { options: ['only one'], durationMinutes: 60 } },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.refusal.code).toBe('POLL_OPTION_COUNT')
  })
})

describe('the Google topic on the wire', () => {
  it("sends an event with Google's own date shape, which is not ISO 8601", () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: gbp(),
      options: {
        gbpTopic: 'EVENT',
        gbpEvent: { title: 'Diwali sale', startDate: '2026-11-01', endDate: '2026-11-05' },
      },
    })
    expect(r).toEqual({
      ok: true,
      data: {
        topicType: 'EVENT',
        event: {
          title: 'Diwali sale',
          schedule: {
            // Numbers in a {year, month, day} object. A string here returns 200
            // and produces an event with no date.
            startDate: { year: 2026, month: 11, day: 1 },
            endDate: { year: 2026, month: 11, day: 5 },
          },
        },
      },
    })
  })

  it('omits endDate entirely rather than sending an empty one', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: gbp(),
      options: { gbpTopic: 'EVENT', gbpEvent: { title: 'Sale', startDate: '2026-11-01' } },
    })
    if (!r.ok) throw new Error('expected a payload')
    const event = (r.data as { event: { schedule: Record<string, unknown> } }).event
    expect(event.schedule).toEqual({ startDate: { year: 2026, month: 11, day: 1 } })
    expect('endDate' in event.schedule).toBe(false)
  })

  it('carries the button AND the topic together, not one or the other', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: gbp({ ctaType: 'ORDER', ctaUrl: 'https://chai.example/order' }),
      options: { gbpTopic: 'OFFER', gbpOffer: { couponCode: 'SAVE10' } },
    })
    expect(r).toEqual({
      ok: true,
      data: {
        callToAction: { type: 'ORDER', url: 'https://chai.example/order' },
        topicType: 'OFFER',
        offer: { couponCode: 'SAVE10' },
      },
    })
  })

  it('sends only the offer fields that were filled in', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: gbp(),
      options: {
        gbpTopic: 'OFFER',
        gbpOffer: { couponCode: 'SAVE10', redeemUrl: '  ', terms: '' },
      },
    })
    expect(r).toEqual({ ok: true, data: { topicType: 'OFFER', offer: { couponCode: 'SAVE10' } } })
  })

  it('refuses an event with no date, which Google would 400 on', () => {
    const r = buildPlatformData({
      channel: 'gbp',
      format: 'text',
      content: gbp(),
      options: { gbpTopic: 'EVENT', gbpEvent: { title: 'Sale', startDate: '' } },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.refusal.code).toBe('GBP_EVENT_NEEDS_DATE')
  })
})

describe('the Instagram and X extras', () => {
  it('sends a first comment, collaborators and the AI label together', () => {
    const r = buildPlatformData({
      channel: 'instagram',
      format: 'image',
      content: ig(),
      options: {
        firstComment: '#chai #pune',
        collaborators: ['@friend', 'other  '],
        aiGenerated: true,
      },
    })
    expect(r).toEqual({
      ok: true,
      data: {
        firstComment: '#chai #pune',
        // The leading @ is stripped: Instagram wants the username.
        collaborators: ['friend', 'other'],
        isAiGenerated: true,
      },
    })
  })

  it('keeps a story a story while carrying its first comment', () => {
    const r = buildPlatformData({
      channel: 'instagram',
      format: 'story',
      content: ig(),
      options: { firstComment: '#chai' },
    })
    expect(r).toEqual({ ok: true, data: { contentType: 'story', firstComment: '#chai' } })
  })

  it('refuses collaborators on a story, which has no co-author', () => {
    const r = buildPlatformData({
      channel: 'instagram',
      format: 'story',
      content: ig(),
      options: { collaborators: ['friend'] },
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.refusal.code).toBe('IG_COLLAB_NOT_ON_STORY')
  })

  it("sends X's own AI-disclosure flag, which is named differently", () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'text',
      content: x(),
      options: { aiGenerated: true },
    })
    // madeWithAi on X, isAiGenerated on Instagram. Two platforms, two spellings.
    expect(r).toEqual({ ok: true, data: { madeWithAi: true } })
  })

  it('carries the AI label onto a thread as well', () => {
    const r = buildPlatformData({
      channel: 'x',
      format: 'thread',
      content: x(),
      thread: { segments: ['one', 'two'] },
      options: { aiGenerated: true },
    })
    expect(r).toEqual({
      ok: true,
      data: { madeWithAi: true, threadItems: [{ content: 'one' }, { content: 'two' }] },
    })
  })

  it('sends nothing at all when no option is set', () => {
    expect(buildPlatformData({ channel: 'x', format: 'text', content: x() })).toEqual({
      ok: true,
      data: undefined,
    })
    expect(buildPlatformData({ channel: 'linkedin', format: 'text', content: li() })).toEqual({
      ok: true,
      data: undefined,
    })
  })
})
