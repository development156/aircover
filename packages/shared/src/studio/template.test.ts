import { describe, expect, it } from 'vitest'

import { DesignDocumentSchema, type DesignPage } from './document'
import { paintOf } from './paint'
import {
  charBudgetFor,
  composeScene,
  describeComposeFailure,
  textBlockFits,
  type Palette,
  type StudioTemplate,
} from './template'
import { presetById } from './presets'
import { STUDIO_TEMPLATES, slotKeysOf, slotLabelOf, templateById } from './templates'
import { renderSvg } from './svg'

const PALETTE: Palette = {
  paper: paintOf(255, 255, 255)!,
  ink: paintOf(23, 23, 23)!,
  muted: paintOf(87, 87, 90)!,
  accent: paintOf(255, 102, 0)!,
  accentInk: paintOf(255, 255, 255)!,
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const ASSET = '3f1c9a2e-0000-4000-8000-111111111111'

function pageOf(slots: Record<string, unknown>): DesignPage {
  return DesignDocumentSchema.parse({ v: 1, templateId: 't', pages: [{ slots }] }).pages[0]!
}

const SIZE = { width: 1080, height: 1350 }

describe('every shipped template', () => {
  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s declares a slot for every block that reads one',
    (_id, template) => {
      const declared = new Set(slotKeysOf(template))
      for (const block of template.blocks) {
        if (block.kind === 'band') continue
        expect(
          declared,
          `${template.id} draws slot "${block.slot}" but does not declare it`,
        ).toContain(block.slot)
      }
    },
  )

  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s draws every slot it declares, so no box is offered that goes nowhere',
    (_id, template) => {
      const drawn = new Set(
        template.blocks.filter((b) => b.kind !== 'band').map((b) => (b as { slot: string }).slot),
      )
      for (const slot of template.slots) {
        expect(drawn, `${template.id} offers "${slot.key}" and never draws it`).toContain(slot.key)
      }
    },
  )

  /**
   * Fractions, not pixels. A pixel authored at 1080 and rendered at 1600 puts
   * everything in the left two thirds and produces valid SVG while doing it.
   */
  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s keeps every frame inside the canvas',
    (_id, template) => {
      for (const block of template.blocks) {
        const f = block.frame
        expect(f.x, `${template.id}`).toBeGreaterThanOrEqual(0)
        expect(f.y, `${template.id}`).toBeGreaterThanOrEqual(0)
        expect(f.x + f.w, `${template.id} runs off the right`).toBeLessThanOrEqual(1.0001)
        expect(f.y + f.h, `${template.id} runs off the bottom`).toBeLessThanOrEqual(1.0001)
      }
    },
  )

  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s names a preset that exists',
    (_id, template) => {
      expect(templateById(template.id)).not.toBeNull()
      expect(
        presetById(template.presetId),
        `${template.id} names a preset nobody has`,
      ).not.toBeNull()
    },
  )

  /**
   * THE GUARD THE PICTURES BOUGHT.
   *
   * Rendering `photo-bottom` and LOOKING at it showed the caption sitting on top
   * of the line beneath it, while every number in the template still looked
   * right. The reason is descenders: the last baseline is not the bottom of the
   * text, and the tail of a `g` hangs about 0.22 of the font size below it.
   *
   * This is the assertion that catches it from the data alone, so the next
   * template does not need a person to look at a PNG to find the same thing.
   */
  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s gives every text block room for its own lines, descenders included',
    (_id, template) => {
      for (const block of template.blocks) {
        if (block.kind !== 'text') continue
        expect(
          textBlockFits(block),
          `${template.id}.${block.slot}: ${block.maxLines} lines at size ${block.size} / step ${block.lineHeight} do not fit a box of ${block.frame.h}`,
        ).toBe(true)
      }
    },
  )

  /**
   * AND THE OTHER ONE. `statement` offered 80 characters for a box that holds
   * about 38, because the limit was DECLARED beside the geometry instead of
   * derived from it. Now it is derived, so this asserts the budget is a usable
   * number rather than that two numbers agree.
   */
  it.each(STUDIO_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s leaves every text slot room for a real sentence',
    (_id, template) => {
      const preset = presetById(template.presetId)!
      for (const block of template.blocks) {
        if (block.kind !== 'text') continue
        const budget = charBudgetFor(block, preset.width, preset.height)
        // Twelve characters is "Closed today". A slot narrower than that is a
        // slot nobody can say anything in.
        expect(
          budget.perLine,
          `${template.id}.${block.slot} fits only ${budget.perLine} characters a line`,
        ).toBeGreaterThanOrEqual(12)
      }
    },
  )

  it('has unique ids', () => {
    const ids = STUDIO_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * `textBlockFits` AT ITS OWN BOUNDARY.
 *
 * The template-wide fit test above cannot prove the descender term: once the
 * shipped frames were given slack, zeroing the constant left all of them green.
 * MEASURED by mutation — a guard that passes for two different values of a
 * constant is not testing that constant.
 *
 * So the constant is pinned here instead, against a block built for the purpose.
 * These numbers move only if the descender allowance is deliberately changed.
 */
describe('textBlockFits pins the descender allowance', () => {
  const block = (h: number, maxLines = 1) => ({
    kind: 'text' as const,
    slot: 'x',
    frame: { x: 0, y: 0, w: 1, h },
    size: 0.1,
    lineHeight: 0.12,
    weight: 400,
    fill: 'ink' as const,
    align: 'start' as const,
    maxLines,
  })

  it('one line of size 0.1 needs 0.122, not 0.1', () => {
    expect(textBlockFits(block(0.122))).toBe(true)
    expect(textBlockFits(block(0.121))).toBe(false)
    // The line that fails if descenders stop being counted: a box of exactly
    // the font size is NOT enough room for the font.
    expect(textBlockFits(block(0.1))).toBe(false)
  })

  it('each extra line costs a full line height', () => {
    expect(textBlockFits(block(0.242, 2))).toBe(true)
    expect(textBlockFits(block(0.241, 2))).toBe(false)
  })
})

describe('composeScene turns a template and a page into something renderable', () => {
  const template = templateById('statement')!

  it('produces a scene the renderer accepts', () => {
    const composed = composeScene(
      template,
      pageOf({ headline: { kind: 'text', text: 'Closed Monday' } }),
      { ...SIZE, palette: PALETTE },
    )
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    const svg = renderSvg(composed.scene)
    expect(svg).not.toBeNull()
    expect(svg).toContain('Closed Monday')
  })

  it('scales with the canvas, so one template is every preset', () => {
    const page = pageOf({ headline: { kind: 'text', text: 'Hi' } })
    const small = composeScene(template, page, { width: 1080, height: 1080, palette: PALETTE })
    const large = composeScene(template, page, { width: 1600, height: 1600, palette: PALETTE })
    expect(small.ok && large.ok).toBe(true)
    if (!small.ok || !large.ok) return
    const smallText = small.scene.nodes.find((n) => n.kind === 'text')!
    const largeText = large.scene.nodes.find((n) => n.kind === 'text')!
    // Same share of the canvas at both sizes.
    //
    // TO TWO PLACES, NOT THREE, AND THE LOOSER BOUND IS THE HONEST ONE.
    // Every number is rounded to a whole pixel on purpose, so the share can be
    // out by up to half a pixel — which at 1080 is 0.0005 of the canvas, exactly
    // the tolerance three places allows. Asserting three places would be
    // asserting that rounding does not happen, and it failed on the first run
    // for that reason: 0.08375 against 0.084259.
    expect(largeText.kind === 'text' && smallText.kind === 'text').toBe(true)
    if (largeText.kind !== 'text' || smallText.kind !== 'text') return
    expect(largeText.fontSize / 1600).toBeCloseTo(smallText.fontSize / 1080, 2)
    expect(largeText.x / 1600).toBeCloseTo(smallText.x / 1080, 2)
    // And the drift really is sub-pixel rather than merely small.
    expect(Math.abs(largeText.fontSize - (smallText.fontSize / 1080) * 1600)).toBeLessThan(1)
  })

  it('emits whole pixels only, so nothing lands on a half pixel', () => {
    const composed = composeScene(template, pageOf({ headline: { kind: 'text', text: 'A' } }), {
      width: 1079,
      height: 1351,
      palette: PALETTE,
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    for (const node of composed.scene.nodes) {
      expect(Number.isInteger(node.x), JSON.stringify(node)).toBe(true)
      expect(Number.isInteger(node.y), JSON.stringify(node)).toBe(true)
    }
  })

  it('skips a slot nobody filled rather than drawing a blank line', () => {
    const filled = composeScene(
      template,
      pageOf({
        eyebrow: { kind: 'text', text: 'Today' },
        headline: { kind: 'text', text: 'Open' },
      }),
      { ...SIZE, palette: PALETTE },
    )
    const bare = composeScene(template, pageOf({ headline: { kind: 'text', text: 'Open' } }), {
      ...SIZE,
      palette: PALETTE,
    })
    expect(filled.ok && bare.ok).toBe(true)
    if (!filled.ok || !bare.ok) return
    const textCount = (s: typeof filled.scene) => s.nodes.filter((n) => n.kind === 'text').length
    expect(textCount(filled.scene)).toBe(2)
    expect(textCount(bare.scene)).toBe(1)
  })

  it('treats a slot of only spaces as empty, because it looks empty', () => {
    const composed = composeScene(template, pageOf({ headline: { kind: 'text', text: '   ' } }), {
      ...SIZE,
      palette: PALETTE,
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    expect(composed.scene.nodes.filter((n) => n.kind === 'text')).toHaveLength(0)
  })

  it('puts each typed line on its own baseline, and never wraps one itself', () => {
    const composed = composeScene(
      template,
      pageOf({ headline: { kind: 'text', text: 'Open today\nuntil eight' } }),
      { ...SIZE, palette: PALETTE },
    )
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    const texts = composed.scene.nodes.filter((n) => n.kind === 'text')
    expect(texts).toHaveLength(2)
    if (texts[0]!.kind !== 'text' || texts[1]!.kind !== 'text') return
    expect(texts[0]!.text).toBe('Open today')
    expect(texts[1]!.text).toBe('until eight')
    expect(texts[1]!.y).toBeGreaterThan(texts[0]!.y)
  })
})

/**
 * A REFUSAL RATHER THAN A TRUNCATION.
 *
 * Cutting the customer's sentence with an ellipsis hides their own words from
 * them and exports anyway. Refusing names the slot so the screen can point at
 * the box they need to fix.
 */
describe('composeScene refuses rather than quietly losing something', () => {
  const template = templateById('statement')!

  it('refuses more lines than the layout has room for, and says which slot', () => {
    const composed = composeScene(
      template,
      pageOf({ headline: { kind: 'text', text: 'a\nb\nc\nd' } }),
      { ...SIZE, palette: PALETTE },
    )
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.failure).toEqual({
      reason: 'too-many-lines',
      slot: 'headline',
      lines: 4,
      maxLines: 3,
    })
  })

  it('refuses when a design points at a picture whose bytes were not supplied', () => {
    const photo = templateById('photo-bottom')!
    const composed = composeScene(photo, pageOf({ photo: { kind: 'image', assetId: ASSET } }), {
      ...SIZE,
      palette: PALETTE,
    })
    expect(composed.ok).toBe(false)
    if (composed.ok) return
    expect(composed.failure).toEqual({ reason: 'missing-image', slot: 'photo' })
  })

  it('does NOT refuse an image slot the person simply left empty', () => {
    const photo = templateById('photo-bottom')!
    const composed = composeScene(photo, pageOf({ headline: { kind: 'text', text: 'Hi' } }), {
      ...SIZE,
      palette: PALETTE,
    })
    expect(composed.ok).toBe(true)
  })

  it('draws the picture when the bytes are supplied', () => {
    const photo = templateById('photo-bottom')!
    const composed = composeScene(photo, pageOf({ photo: { kind: 'image', assetId: ASSET } }), {
      ...SIZE,
      palette: PALETTE,
      images: { photo: PIXEL },
    })
    expect(composed.ok).toBe(true)
    if (!composed.ok) return
    expect(composed.scene.nodes.some((n) => n.kind === 'image')).toBe(true)
  })

  it('refuses a canvas size that is not whole pixels', () => {
    for (const size of [
      { width: 0, height: 100 },
      { width: 100.5, height: 100 },
    ]) {
      const composed = composeScene(template, pageOf({}), { ...size, palette: PALETTE })
      expect(composed.ok, JSON.stringify(size)).toBe(false)
    }
  })
})

describe('describeComposeFailure', () => {
  const label = (key: string) => slotLabelOf(templateById('statement')!, key)

  it('names the box a person has to find, not the key', () => {
    const said = describeComposeFailure(
      { reason: 'too-many-lines', slot: 'headline', lines: 4, maxLines: 3 },
      label,
    )
    expect(said).toContain('The big line')
    expect(said).not.toContain('headline')
    expect(said).toContain('4')
    expect(said).toContain('3 lines')
  })

  it('uses the singular for a one-line slot', () => {
    const said = describeComposeFailure(
      { reason: 'too-many-lines', slot: 'eyebrow', lines: 2, maxLines: 1 },
      label,
    )
    expect(said).toContain('1 line')
    expect(said).not.toContain('1 lines')
  })

  it('says a picture failed to load, not that the design is broken', () => {
    const said = describeComposeFailure({ reason: 'missing-image', slot: 'photo' }, (k) => k)
    expect(said).toMatch(/picture/i)
    expect(said).not.toMatch(/error|failed to render|invalid/i)
  })
})

describe('slot helpers', () => {
  it('falls back to the key rather than an empty label', () => {
    const stale = { ...templateById('statement')!, slots: [] } as StudioTemplate
    expect(slotLabelOf(stale, 'headline')).toBe('headline')
  })

  it('returns null for a template id nobody defined', () => {
    expect(templateById('nope')).toBeNull()
  })
})
