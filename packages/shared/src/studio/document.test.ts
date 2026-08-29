import { describe, expect, it, test } from 'vitest'

import {
  DesignDocumentSchema,
  MAX_CAROUSEL_PAGES,
  addPage,
  assetIdsOf,
  blankDocument,
  imageIdOf,
  isCarousel,
  movePage,
  removePage,
  slotOf,
  textOf,
  type DesignDocument,
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

/**
 * ── SLIDES ──────────────────────────────────────────────────────────────────
 * The two limits are different KINDS of limit and the tests say which: 10 is
 * what a platform will publish, 1 is what a document is. A guard that only
 * checked "the number did not change" would pass for either reason.
 */
describe('addPage and removePage', () => {
  const keys = ['headline', 'detail'] as const
  const doc = (pages: number): DesignDocument => {
    let out = blankDocument('photo-bottom', keys)
    for (let i = 1; i < pages; i += 1) out = addPage(out, keys)
    return out
  }

  test('a new slide carries every declared slot, empty', () => {
    const two = addPage(doc(1), keys)
    expect(two.pages).toHaveLength(2)
    expect(two.pages[1]!.slots).toEqual({
      headline: { kind: 'empty' },
      detail: { kind: 'empty' },
    })
  })

  test('adding a slide leaves the earlier ones alone', () => {
    const one = blankDocument('photo-bottom', keys)
    const filled: DesignDocument = {
      ...one,
      pages: [
        { slots: { ...one.pages[0]!.slots, headline: { kind: 'text', text: 'Open today' } } },
      ],
    }
    const two = addPage(filled, keys)
    expect(textOf(two.pages[0]!, 'headline')).toBe('Open today')
  })

  test('the tenth slide is allowed and the eleventh is refused', () => {
    const ten = doc(MAX_CAROUSEL_PAGES)
    expect(ten.pages).toHaveLength(MAX_CAROUSEL_PAGES)
    const refused = addPage(ten, keys)
    expect(refused.pages).toHaveLength(MAX_CAROUSEL_PAGES)
    // Refused by returning the SAME document, so a caller that ignores the
    // answer cannot corrupt one.
    expect(refused).toBe(ten)
  })

  test('a slide in the middle can go, and the rest keep their order', () => {
    const three = doc(3)
    const marked: DesignDocument = {
      ...three,
      pages: three.pages.map((page, index) => ({
        slots: { ...page.slots, headline: { kind: 'text', text: `page ${index}` } },
      })),
    }
    const left = removePage(marked, 1)
    expect(left.pages).toHaveLength(2)
    expect(left.pages.map((page) => textOf(page, 'headline'))).toEqual(['page 0', 'page 2'])
  })

  test('the last slide cannot be removed, because a design with no pages is not a design', () => {
    const one = doc(1)
    expect(removePage(one, 0)).toBe(one)
  })

  test('an index that is not a slide changes nothing', () => {
    const two = doc(2)
    expect(removePage(two, 5)).toBe(two)
    expect(removePage(two, -1)).toBe(two)
    expect(removePage(two, 1.5)).toBe(two)
  })

  test('every document these produce still parses', () => {
    const ten = doc(MAX_CAROUSEL_PAGES)
    expect(DesignDocumentSchema.safeParse(ten).success).toBe(true)
    expect(DesignDocumentSchema.safeParse(removePage(ten, 0)).success).toBe(true)
  })

  test('two slides are a carousel and one is a post', () => {
    expect(isCarousel(doc(1))).toBe(false)
    expect(isCarousel(doc(2))).toBe(true)
  })
})

/**
 * ── MOVING A SLIDE ──────────────────────────────────────────────────────────
 * Order is the carousel's meaning: slide one is the hook and the last one is
 * the offer. The tests below are about WHERE each slide ends up, checked by the
 * words on it, because a test that only counted pages would pass for a move
 * that landed a slide one place off.
 */
describe('movePage', () => {
  const keys = ['headline', 'detail'] as const

  /** Four slides, each labelled with its starting position. */
  const labelled = (): DesignDocument => {
    let out = blankDocument('photo-bottom', keys)
    for (let i = 1; i < 4; i += 1) out = addPage(out, keys)
    return {
      ...out,
      pages: out.pages.map((page, index) => ({
        slots: { ...page.slots, headline: { kind: 'text' as const, text: `page ${index}` } },
      })),
    }
  }

  const order = (doc: DesignDocument) => doc.pages.map((page) => textOf(page, 'headline'))

  test('a slide moved right lands exactly where it was sent, not one short of it', () => {
    // The trap this exists to catch: splicing into the ORIGINAL indices instead
    // of the shortened array puts a right-moving slide one place too far left,
    // and the page count is identical either way.
    expect(order(movePage(labelled(), 0, 2))).toEqual(['page 1', 'page 2', 'page 0', 'page 3'])
  })

  test('a slide moved left lands where it was sent', () => {
    expect(order(movePage(labelled(), 3, 1))).toEqual(['page 0', 'page 3', 'page 1', 'page 2'])
  })

  test('moving one step swaps a neighbouring pair and touches nothing else', () => {
    expect(order(movePage(labelled(), 1, 2))).toEqual(['page 0', 'page 2', 'page 1', 'page 3'])
  })

  test('the slide keeps everything on it, not just its position', () => {
    const four = labelled()
    const withPicture: DesignDocument = {
      ...four,
      pages: four.pages.map((page, index) =>
        index === 0 ? { slots: { ...page.slots, detail: { kind: 'image', assetId: 'a1' } } } : page,
      ),
    }
    const moved = movePage(withPicture, 0, 3)
    expect(imageIdOf(moved.pages[3]!, 'detail')).toBe('a1')
  })

  /**
   * A target past either end is REFUSED, not clamped. Clamping reads as success
   * and would make "move right" on the last slide change nothing while looking
   * like it worked.
   */
  test('a target past either end changes nothing', () => {
    const four = labelled()
    expect(movePage(four, 0, 4)).toBe(four)
    expect(movePage(four, 0, -1)).toBe(four)
    expect(movePage(four, 4, 0)).toBe(four)
    expect(movePage(four, -1, 0)).toBe(four)
  })

  test('a fractional index changes nothing', () => {
    const four = labelled()
    expect(movePage(four, 1.5, 0)).toBe(four)
    expect(movePage(four, 0, 1.5)).toBe(four)
  })

  test('moving a slide onto itself changes nothing, so a drag cannot spend a save', () => {
    const four = labelled()
    expect(movePage(four, 2, 2)).toBe(four)
  })

  test('a single-slide design has nowhere to move to', () => {
    const one = blankDocument('photo-bottom', keys)
    expect(movePage(one, 0, 0)).toBe(one)
  })

  test('the document still parses, and still has every slide', () => {
    const moved = movePage(labelled(), 0, 3)
    expect(DesignDocumentSchema.safeParse(moved).success).toBe(true)
    expect(moved.pages).toHaveLength(4)
    expect(new Set(order(moved)).size).toBe(4)
  })
})
