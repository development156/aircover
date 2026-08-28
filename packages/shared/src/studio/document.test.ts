import { describe, expect, it } from 'vitest'

import {
  DesignDocumentSchema,
  MAX_CAROUSEL_PAGES,
  assetIdsOf,
  blankDocument,
  imageIdOf,
  isCarousel,
  slotOf,
  textOf,
} from './document'

const ASSET = '3f1c9a2e-0000-4000-8000-111111111111'

function doc(pages: unknown) {
  return { v: 1, templateId: 'offer-bold', pages }
}

describe('DesignDocumentSchema holds slots, and structurally cannot hold a layout', () => {
  it('accepts a one-page design', () => {
    const parsed = DesignDocumentSchema.parse(
      doc([{ slots: { headline: { kind: 'text', text: 'Fresh samosas' } } }]),
    )
    expect(parsed.pages).toHaveLength(1)
  })

  /**
   * THE PRODUCT RULING, ASSERTED AS A SHAPE.
   *
   * FSD 3.4 forbids a free canvas in v1. That is enforced here by there being
   * nowhere to put a position: zod strips unknown keys, so a document carrying
   * coordinates parses into one that does not. If a later ruling opens the
   * canvas, this test is the one that has to be changed on purpose, which is the
   * point of writing it.
   */
  it('drops any position, size, colour or font a caller tries to store', () => {
    const parsed = DesignDocumentSchema.parse(
      doc([
        {
          slots: { headline: { kind: 'text', text: 'hi', x: 10, y: 20, fontSize: 48 } },
          x: 0,
          y: 0,
          background: '#ff0000',
        },
      ]),
    )
    const page = parsed.pages[0]!
    expect(page).not.toHaveProperty('x')
    expect(page).not.toHaveProperty('background')
    expect(page.slots.headline).toEqual({ kind: 'text', text: 'hi' })
  })

  it('refuses a document written to a shape this parser does not know', () => {
    expect(DesignDocumentSchema.safeParse({ ...doc([{ slots: {} }]), v: 2 }).success).toBe(false)
    expect(DesignDocumentSchema.safeParse({ pages: [{ slots: {} }] }).success).toBe(false)
  })

  it('refuses zero pages and more than ten', () => {
    expect(DesignDocumentSchema.safeParse(doc([])).success).toBe(false)
    const eleven = Array.from({ length: MAX_CAROUSEL_PAGES + 1 }, () => ({ slots: {} }))
    expect(DesignDocumentSchema.safeParse(doc(eleven)).success).toBe(false)
    const ten = Array.from({ length: MAX_CAROUSEL_PAGES }, () => ({ slots: {} }))
    expect(DesignDocumentSchema.safeParse(doc(ten)).success).toBe(true)
  })

  it('caps a page count at the number a platform will actually publish', () => {
    // Instagram and Facebook both stop a carousel at 10 (maxMediaCount in the
    // Constraint Engine). An eleventh page could be made and never published.
    expect(MAX_CAROUSEL_PAGES).toBe(10)
  })

  it('refuses a slot key that is not a code identifier', () => {
    for (const key of ['Headline', 'head line', '1st', 'head_line', '']) {
      expect(
        DesignDocumentSchema.safeParse(doc([{ slots: { [key]: { kind: 'text', text: 'x' } } }]))
          .success,
        key,
      ).toBe(false)
    }
    expect(
      DesignDocumentSchema.safeParse(doc([{ slots: { 'call-to-action': { kind: 'empty' } } }]))
        .success,
    ).toBe(true)
  })

  it('refuses a slot kind it does not have', () => {
    expect(
      DesignDocumentSchema.safeParse(doc([{ slots: { a: { kind: 'video', src: 'x' } } }])).success,
    ).toBe(false)
  })

  /**
   * An image slot stores an ID, never an address. A stored URL would outlive the
   * file, expire on its own, and could point outside the workspace.
   */
  it('refuses a URL in an image slot, and requires a real id', () => {
    expect(
      DesignDocumentSchema.safeParse(
        doc([{ slots: { photo: { kind: 'image', assetId: 'https://example.com/a.png' } } }]),
      ).success,
    ).toBe(false)
    expect(
      DesignDocumentSchema.safeParse(doc([{ slots: { photo: { kind: 'image', assetId: ASSET } } }]))
        .success,
    ).toBe(true)
  })
})

describe('reading a slot gives three answers, never a fabricated empty string', () => {
  const page = DesignDocumentSchema.parse(
    doc([
      {
        slots: {
          headline: { kind: 'text', text: 'Fresh samosas' },
          subhead: { kind: 'text', text: '' },
          photo: { kind: 'image', assetId: ASSET },
          badge: { kind: 'empty' },
        },
      },
    ]),
  ).pages[0]!

  it('tells an unfilled slot apart from one filled with nothing', () => {
    expect(slotOf(page, 'badge')).toEqual({ kind: 'empty' })
    expect(textOf(page, 'badge')).toBeNull()
    // Typed and left blank. A real, deliberate empty string.
    expect(textOf(page, 'subhead')).toBe('')
  })

  it('tells both apart from a slot the template does not have', () => {
    expect(slotOf(page, 'nonexistent')).toBeNull()
    expect(textOf(page, 'nonexistent')).toBeNull()
  })

  it('does not read an image slot as words, or a text slot as a picture', () => {
    expect(textOf(page, 'photo')).toBeNull()
    expect(imageIdOf(page, 'headline')).toBeNull()
    expect(imageIdOf(page, 'photo')).toBe(ASSET)
  })
})

describe('assetIdsOf', () => {
  it('collects every picture a design uses, once each, in page order', () => {
    const second = '4a2b8c1d-0000-4000-8000-222222222222'
    const parsed = DesignDocumentSchema.parse(
      doc([
        { slots: { a: { kind: 'image', assetId: ASSET } } },
        { slots: { a: { kind: 'image', assetId: second }, b: { kind: 'image', assetId: ASSET } } },
      ]),
    )
    expect(assetIdsOf(parsed)).toEqual([ASSET, second])
  })

  it('is empty for a design with no pictures, rather than undefined', () => {
    const parsed = DesignDocumentSchema.parse(doc([{ slots: { a: { kind: 'text', text: 'x' } } }]))
    expect(assetIdsOf(parsed)).toEqual([])
  })
})

describe('isCarousel', () => {
  it('one page is a post and two is a carousel', () => {
    const one = DesignDocumentSchema.parse(doc([{ slots: {} }]))
    const two = DesignDocumentSchema.parse(doc([{ slots: {} }, { slots: {} }]))
    expect(isCarousel(one)).toBe(false)
    expect(isCarousel(two)).toBe(true)
  })
})

describe('blankDocument', () => {
  it('gives every declared slot a place to type, rather than leaving it out', () => {
    const blank = blankDocument('offer-bold', ['headline', 'photo'])
    expect(Object.keys(blank.pages[0]!.slots).sort()).toEqual(['headline', 'photo'])
    expect(blank.pages[0]!.slots.headline).toEqual({ kind: 'empty' })
  })

  it('produces a document that parses', () => {
    expect(DesignDocumentSchema.safeParse(blankDocument('t', ['a'])).success).toBe(true)
  })

  it('produces a single-page design, because a new design is not a carousel', () => {
    expect(isCarousel(blankDocument('t', ['a']))).toBe(false)
  })
})
