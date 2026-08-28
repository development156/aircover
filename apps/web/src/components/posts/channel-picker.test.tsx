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

describe('the channels the picker offers', () => {
  test('does not offer a channel the product will not let you connect', () => {
    render(<ChannelPicker selected={toChannelSet([])} onChange={() => {}} />)

    // `/connections` stopped offering Telegram, and this picker kept listing it.
    // A writer could pick it, have a version generated, and then find nowhere in
    // the product to link a Telegram account — an invitation to an action that
    // cannot be completed, which is the shape `no-impossible-remedy` forbids.
    expect(screen.queryByRole('button', { name: /Telegram/ })).not.toBeInTheDocument()

    // And the rest are untouched. Asserted so "hide Telegram" cannot quietly
    // become "hide everything the connections screen is fussy about".
    expect(screen.getByRole('button', { name: /^X$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /LinkedIn/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Instagram/ })).toBeVisible()
  })

  test('still shows a withdrawn channel that the post ALREADY targets', () => {
    render(<ChannelPicker selected={toChannelSet(['telegram'])} onChange={() => {}} />)

    // Filtering blindly would make an existing post's Telegram version invisible
    // and un-deselectable: three chips on screen, four channels still being
    // saved, and nothing explaining the difference. The OFFER is withdrawn; a
    // choice already made stays visible and removable.
    const chip = screen.getByRole('button', { name: /Telegram/ })
    expect(chip).toBeVisible()
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  test('never withholds a channel this workspace has actually connected', () => {
    render(
      <ChannelPicker
        selected={toChannelSet([])}
        onChange={() => {}}
        connected={new Set(['telegram'] as const)}
      />,
    )

    // ── THE DEFECT AN ADVERSARIAL PASS CAUGHT ───────────────────────────────
    // The offer set withholds an ADVERTISEMENT, not a capability — `groups.ts`
    // says so in as many words: it "does NOT gate `linked`". Filtering on it
    // alone meant a workspace that had already linked a Telegram account could
    // still publish there, still saw its tile under "Your channels", and could
    // not choose it when writing a post. A capability they hold, withheld by a
    // rule about what to advertise.
    expect(screen.getByRole('button', { name: /Telegram/ })).toBeVisible()
  })

  test('lets a withdrawn channel be un-ticked and ticked again', async () => {
    const user = userEvent.setup()
    render(<Harness initial={toChannelSet(['telegram'])} />)

    // Reading the live selection made deselection a ONE-WAY DOOR: untick and the
    // chip vanishes on the next render, so a mis-click could not be undone
    // without reloading. An audit found it; nothing here toggled the chip off.
    const chip = screen.getByRole('button', { name: /Telegram/ })
    await user.click(chip)
    expect(screen.getByRole('button', { name: /Telegram/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await user.click(screen.getByRole('button', { name: /Telegram/ }))
    expect(screen.getByRole('button', { name: /Telegram/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('does not bring a withdrawn channel back when some OTHER channel is picked', () => {
    render(<ChannelPicker selected={toChannelSet(['x'])} onChange={() => {}} />)

    // An audit mutation changed `selected.includes(channel)` to
    // `selected.length > 0` and all eight tests stayed green, because no test
    // ever rendered a NON-EMPTY selection that excluded Telegram. Picking X
    // brought Telegram back onto the screen.
    expect(screen.getByRole('button', { name: /^X$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Telegram/ })).not.toBeInTheDocument()
  })

  test('gives every channel its own logo, never a shared placeholder', () => {
    render(<ChannelPicker selected={toChannelSet([])} onChange={() => {}} />)

    // ── THE DEFECT THIS PINS ────────────────────────────────────────────────
    // `channel-mark.tsx` carried its own map of three logos and fell through to
    // a grey MAP PIN for the rest, so Google Business Profile and Facebook Pages
    // rendered as the same anonymous glyph on a row whose whole job is telling
    // channels apart — while /connections showed their real logos. `ChannelLogo`
    // marks its fallback with `data-placeholder`, so this asserts the absence of
    // the admission rather than the presence of any particular picture.
    for (const el of document.querySelectorAll('[data-channel]')) {
      expect(el.getAttribute('data-placeholder')).toBeNull()
    }
    // And that the marks are actually there, so the loop above cannot pass by
    // finding nothing at all.
    const marks = [...document.querySelectorAll('[data-channel]')]
    expect(marks.length).toBeGreaterThan(0)

    // ── AND THAT THEY ARE DIFFERENT FROM ONE ANOTHER ────────────────────────
    // The absence check alone was not enough: an audit mutation hard-coded the
    // logo to Instagram for every channel and all eight tests stayed green,
    // restoring the exact "one shared glyph" defect this change exists to fix.
    // Distinct sources is the property that was actually wanted.
    const sources = marks.map((el) => el.getAttribute('src') ?? el.getAttribute('data-channel'))
    expect(new Set(sources).size).toBe(marks.length)
  })

  test('renders each mark at the size its caller asked for', () => {
    render(<ChannelPicker selected={toChannelSet([])} onChange={() => {}} />)

    // Dropping the `size` pass-through left every test green while every mark
    // jumped to the shared default of 22px — the timeline asks for 13, the send
    // outcomes for 15, the readout for 16. Silently wrong in four places.
    for (const el of document.querySelectorAll('img[data-channel]')) {
      expect(el.getAttribute('width')).toBe('18')
    }
  })
})
