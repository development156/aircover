import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { DRAWN_KINDS, KindGlyph, isDrawn } from './kind-glyph'
import { CATALOGUE } from '@/lib/connections/catalogue'
import { ALL_KINDS } from '@/lib/connections/kinds'

/**
 * THE GUARD THAT MAKES A NEW CATEGORY A RED TEST RATHER THAN A SILENT ONE.
 *
 * The category rail is derived from the catalogue, so adding a channel with a new
 * `kind` puts a new row on the screen with nobody's involvement. That is the
 * design, and the fallback below is what keeps that row whole. What must not
 * happen quietly is that row wearing the generic tag for months because nobody
 * noticed it had no drawing of its own.
 *
 * So the two answers are split on purpose: at RUNTIME the fallback keeps the row
 * intact, and at REVIEW TIME this file goes red and names the kind.
 */
describe('the category glyph', () => {
  it('draws every category the catalogue actually carries', () => {
    const kinds = [...new Set(CATALOGUE.map((entry) => entry.kind))]
    const undrawn = kinds.filter((kind) => !DRAWN_KINDS.includes(kind))
    // Names the missing kind rather than asserting a count, so the failure tells
    // whoever added the channel which glyph to draw.
    expect(undrawn).toEqual([])
  })

  it('draws the All facet, which is not a catalogue kind', () => {
    expect(isDrawn(ALL_KINDS)).toBe(true)
  })

  it('still renders a mark for a category nobody has drawn', () => {
    // The point of the fallback: a category that does not exist yet still gets a
    // real mark, so the row survives its own novelty rather than opening a gap
    // where every other row has a glyph.
    expect(isDrawn('Carrier pigeon')).toBe(false)

    const { container } = render(<KindGlyph id="Carrier pigeon" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.querySelectorAll('path')).toHaveLength(1)
  })

  it('is silent to a screen reader, on every kind including the fallback', () => {
    // The rail's row already carries an `aria-label` naming the category and its
    // count. A glyph that announced itself would make every row say its category
    // twice, which is why there is no prop to turn this off.
    for (const id of [...DRAWN_KINDS, 'Carrier pigeon']) {
      const { container } = render(<KindGlyph id={id} />)
      expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('draws something for every catalogue kind, not merely a listed one', () => {
    for (const entry of CATALOGUE) {
      const { container } = render(<KindGlyph id={entry.kind} />)
      expect(container.querySelector('svg path')).not.toBeNull()
    }
  })
})
