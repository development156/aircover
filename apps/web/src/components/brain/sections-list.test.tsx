import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { BRAIN_SECTIONS } from '@/lib/brand/fields'
import { provenanceOf } from '@/lib/brand/provenance'
import { SectionsList } from './sections-list'

/**
 * THE SECTIONS LIST IS FOR CHOOSING, NOT FOR READING.
 *
 * Founder's ruling, 2026-09-03: replace descriptions with short labels, and let
 * numbers, bars and icons carry the information. Each row used to carry
 * `section.blurb` under its title — a sentence explaining what "Voice" or "Red
 * lines" means — which made every row three lines tall and turned five links
 * into a page of prose.
 *
 * ── WHY THE ABSENCE IS WORTH A TEST ─────────────────────────────────────────
 * A deleted sentence has no defender. `fields.ts` still holds every blurb,
 * `section-card.tsx` still renders them, and the prop is one autocomplete away,
 * so the likeliest regression is somebody adding it back believing the row is
 * bare. This says it is bare on purpose.
 *
 * The blurb is NOT gone from the product, and that is the reason this ruling
 * costs nothing: it still renders on the tab that owns each section, which is
 * where somebody is reading ABOUT a section rather than choosing between five.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · DENSITY, which is the whole point of the change. Nothing here measures a
 *    row's height; a blurb re-added as a `title` attribute, an icon swapped for
 *    a 64px illustration, or a row given 40px of padding all pass.
 *  · THE ICONS. It asserts the row has a graphic, not that the graphic suits
 *    the section — `Ban` on "Voice" would pass. A glyph is a judgement.
 *  · THE COLLISION THIS PASS ALSO FIXED, in `derived-card.tsx`, where two
 *    eyebrows overlapped in the 340px aside. That was found by rendering at
 *    1280px in a browser and no assertion in jsdom, which has no layout, could
 *    have found it.
 */
const EMPTY = provenanceOf({})

describe('the sections list', () => {
  test('is five links, one per section, each named by its section', () => {
    render(<SectionsList provenance={EMPTY} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(BRAIN_SECTIONS.length)
    for (const section of BRAIN_SECTIONS) {
      expect(screen.getByText(section.title)).toBeVisible()
    }
  })

  test('carries no section description — the row is a choice, not a lesson', () => {
    // THE REGRESSION THIS PINS. Every blurb, checked by name, so re-adding any
    // one of them fails rather than only the first.
    render(<SectionsList provenance={EMPTY} />)

    for (const section of BRAIN_SECTIONS) {
      expect(
        screen.queryByText(section.blurb),
        `${section.title} put its description back on the row`,
      ).toBeNull()
    }
  })

  test('says each row‘s progress in words, not only as a bar', () => {
    // The bar is `role="img"` with a label because a hatched strip announces
    // nothing on its own, and the `0/4` beside it is a bare ratio. Without the
    // label a screen reader hears the section title and a number and never
    // learns what the number counts.
    render(<SectionsList provenance={EMPTY} />)

    for (const section of BRAIN_SECTIONS) {
      const row = screen.getByText(section.title).closest('a')
      expect(row).not.toBeNull()
      expect(within(row!).getByRole('img')).toHaveAccessibleName(/of \d+ confirmed$/)
    }
  })
})
