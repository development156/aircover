import { createElement } from 'react'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { BRAIN_SECTIONS, type BrainSectionKey } from '@/lib/brand/fields'
import { SECTION_ICON, SECTION_ICON_TILE } from './section-icon'

/**
 * ONE SECTION, ONE GLYPH, IN BOTH PLACES IT APPEARS.
 *
 * A section shows up twice: as a row in the Overview's list, and as the card on
 * the Identity or Voice tab that row links to. The glyph is how somebody
 * recognises the two as the same thing, so the two must not be able to disagree.
 * They used to: the map was written out inside `sections-list.tsx`, and the card
 * had no icon at all, so adding one meant copying five entries and hoping.
 *
 * ── WHY THE DARK SURFACE SWAP IS ASSERTED ───────────────────────────────────
 * `apps/web/CLAUDE.md` records the trap by name: in dark, `--t50` stays
 * warm-light while `--acc` flips to Orange300 and the pair measures ~1.7:1. The
 * tile is `bg-brand-wash text-accent`, which is exactly that pair, so it carries
 * `dark:bg-s2`. Dropping it makes the glyph nearly invisible in dark and
 * nothing else in the gate would notice — no contrast guard renders this tile.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · WHETHER THE GLYPH SUITS THE SECTION. `Ban` on "Voice" satisfies every
 *    assertion here. Which picture means "hook" is a judgement, not a fact.
 *  · A THIRD CONSUMER. It reads two named files as text; a new screen that
 *    hand-rolls its own icon for a section is simply not looked at.
 *  · The CLASS STRING actually reaching the DOM. It asserts the constant, not a
 *    render, so a call site that takes the tile and then overrides the surface
 *    with its own `dark:` utility passes.
 *  · CONTRAST, in numbers. It asserts the documented fix is present, not that
 *    the result measures above any ratio.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(HERE, rel), 'utf8')

describe('the section glyph', () => {
  test.each(BRAIN_SECTIONS.map((s) => [s.key, s.title]))(
    '%s (%s) has one that actually renders',
    (key) => {
      // RENDERED, not type-checked. `Record<BrainSectionKey, LucideIcon>` already
      // catches a missing key at compile time, so a test that only asserted the
      // entry exists would prove nothing the compiler had not. What a type cannot
      // catch is an entry that is present and not a component — the first draft
      // of this test asserted `typeof === 'function'` and failed on every icon,
      // because a lucide icon in this version is a forwardRef OBJECT. Rendering
      // is the claim that matters and the one that does not care which it is.
      const { container } = render(createElement(SECTION_ICON[key as BrainSectionKey]))
      expect(container.querySelector('svg'), `${key} drew nothing`).not.toBeNull()
    },
  )

  test('the tile keeps its dark surface swap', () => {
    // THE REGRESSION THIS PINS, and it is invisible in light. See the header.
    expect(SECTION_ICON_TILE).toContain('bg-brand-wash')
    expect(SECTION_ICON_TILE).toContain('text-accent')
    expect(SECTION_ICON_TILE).toContain('dark:bg-s2')
  })

  test.each([
    ['sections-list.tsx', 'the Overview row'],
    ['section-card.tsx', 'the section card'],
  ])('%s (%s) takes its glyph from the shared map', (file) => {
    // The drift this prevents: a second map, or a hand-picked icon, so the
    // same section wears two faces on two screens.
    const source = read(file)
    expect(source).toContain("from './section-icon'")
    expect(source, 'declares a second icon map of its own').not.toMatch(/const\s+SECTION_ICON\s*:/)
  })
})
