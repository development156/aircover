import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'
import { toChannelSet, type ChannelSet } from '@sahoda/shared'

import { ChannelPicker } from './channel-picker'

/**
 * THE SELECTED CHIP IS READABLE WITHOUT COLOUR.
 *
 * docs/37 §9: state is carried by fill weight, glyph and label, never by hue
 * alone. The chip used to be solid INK when on, which is a fill-weight signal so
 * strong that nothing else was needed. It is now a 6% orange wash with a `--t300`
 * ring, and a wash survives desaturation far less well, so the glyph channel had
 * to become load-bearing rather than decorative.
 *
 * ⚠ WHAT AN ADVERSARIAL PASS GOT THROUGH THE FIRST VERSION OF THIS FILE, AND WHY
 * THE ASSERTIONS BELOW ARE SHAPED THE WAY THEY ARE.
 *
 * The first version asserted only that the dot EXISTS. Three mutations walked
 * straight past it, each of which destroys the property this file is named for:
 *
 *   1. the dot repainted `bg-tint-50 text-accent` — present, and now the same
 *      colour as the ground it sits on, so the glyph channel is gone;
 *   2. the selected ring changed from `1.5px var(--t300)` to `1px var(--line)` —
 *      identical to the unselected ring, so the fill-weight channel is gone;
 *   3. the chip body given `dark:bg-primary` or `bg-[var(--brand)]` — a solid
 *      brand fill on up to four chips at once, which the no-solid-fill test was
 *      written to stop and whose regex only matched the bare spelling.
 *
 * With 1 and 2 applied together the selected chip differs from the unselected one
 * by nothing a greyscale reader can see, and eleven tests stayed green.
 *
 * ── WHAT THESE ASSERTIONS CAN AND CANNOT DO ──────────────────────────────────
 * PRESENCE is checked structurally and is strong. COLOUR is checked by class
 * SPELLING and is weak, because jsdom loads no stylesheet: nothing here resolves
 * a token to a value, so a rename of `--p` itself would pass. That is a real
 * limit, stated rather than papered over. The rendered check belongs in a
 * Playwright spec against `#main`; this sandbox cannot run one (CLAUDE.md,
 * REQUESTS §25), so what is here is the source-level half.
 */

function Harness({ initial }: { initial: ChannelSet }) {
  const [selected, setSelected] = useState<ChannelSet>(initial)
  return <ChannelPicker selected={selected} onChange={setSelected} />
}

describe('ChannelPicker selected state', () => {
  test('a selected chip carries a mark that an unselected chip does not', async () => {
    render(<Harness initial={toChannelSet(['x'])} />)

    const on = screen.getByRole('button', { pressed: true })
    const off = screen.getAllByRole('button', { pressed: false })

    expect(on.querySelector('[data-state-mark="selected"]')).not.toBeNull()
    expect(off).not.toHaveLength(0)
    for (const chip of off) {
      expect(chip.querySelector('[data-state-mark="selected"]')).toBeNull()
    }
  })

  test('the mark follows the toggle in both directions', async () => {
    render(<Harness initial={toChannelSet(['x'])} />)

    const linkedin = screen.getByRole('button', { name: /linkedin/i })
    expect(linkedin.querySelector('[data-state-mark="selected"]')).toBeNull()

    await userEvent.click(linkedin)
    expect(linkedin).toHaveAttribute('aria-pressed', 'true')
    expect(linkedin.querySelector('[data-state-mark="selected"]')).not.toBeNull()

    await userEvent.click(linkedin)
    expect(linkedin).toHaveAttribute('aria-pressed', 'false')
    expect(linkedin.querySelector('[data-state-mark="selected"]')).toBeNull()
  })

  test('the mark is painted in the brand, not in the ground it sits on', () => {
    render(<Harness initial={toChannelSet(['x'])} />)

    const mark = screen
      .getByRole('button', { pressed: true })
      .querySelector('[data-state-mark="selected"]')

    // A dot in `bg-tint-50 text-accent` is present, invisible against the chip,
    // and passed every assertion in the first version of this file.
    expect(mark?.className).toMatch(/(^|\s)bg-primary(\s|$)/)
    expect(mark?.className).toMatch(/(^|\s)text-primary-foreground(\s|$)/)
  })

  test('the selected ring is not the unselected ring', () => {
    render(<Harness initial={toChannelSet(['x'])} />)

    // RESTING rings only. The first attempt matched every `shadow-[...]`
    // including the unselected chip's `hover:` one, so the two strings differed
    // for a reason unrelated to the resting state: collapsing the selected ring
    // onto `1px var(--line)` left both chips identical at rest and this test
    // stayed green. MEASURED, then fixed.
    const ring = (el: Element) =>
      el.className
        .split(/\s+/)
        .filter((c) => c.startsWith('shadow-['))
        .join(' ')

    const on = ring(screen.getByRole('button', { pressed: true }))
    const off = ring(screen.getAllByRole('button', { pressed: false })[0]!)

    expect(on).not.toBe('')
    expect(off).not.toBe('')
    // Fill weight is the second greyscale channel. Collapsing the two rings to
    // one value leaves the 6% wash carrying the whole state, and the wash
    // measures 1.068:1 against the card.
    expect(on).not.toBe(off)
  })

  test('the row spends NO solid brand fill on a chip BODY — only on the 16px mark', () => {
    // docs/37 §16: exactly one element per view carries the solid brand fill, and
    // on /planner that element is the "Plan my week" button. Four chips sit in
    // this row at once, so a solid brand chip would put up to four competing
    // primaries on one screen. The wash is what makes the selected state legible
    // without spending that budget.
    render(<Harness initial={toChannelSet(['x', 'gbp'])} />)

    for (const chip of screen.getAllByRole('button')) {
      // Deliberately NOT anchored to the bare spelling. The first version was,
      // and `dark:bg-primary`, `bg-[var(--brand)]` and `bg-brand-lift` all
      // walked past it. `chip.className` is the BUTTON's own class string, so
      // the mark's own `bg-primary` (a child span) is correctly not caught.
      expect(chip.className).not.toMatch(/bg-(primary|brand)\b/)
      expect(chip.className).not.toMatch(/bg-\[var\(--(p|brand)\)\]/)
    }
  })
})
