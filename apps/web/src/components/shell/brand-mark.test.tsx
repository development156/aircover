import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { BrandMark } from './brand-mark'
import { SKIN_ATTR, SKIN_KEY } from '@/lib/brand/skin-preference'

/**
 * The switch between the customer's colours and ours, in the topbar.
 *
 * ── WHAT THESE ARE FOR ──────────────────────────────────────────────────────
 * Founder's ruling, 2026-08-29: two switches that must not touch each other.
 * The moon and sun own light and dark; this owns Brand Skin. Brand Skin exists
 * as a switch at all because an automatic colour read is a guess about somebody
 * else's brand, and when the guess is wrong the interface stops being readable.
 * The way out has to be one press.
 *
 * The panel's own behaviour is `brand-panel.test.tsx`. These are the things the
 * TOPBAR CONTROL must get right, plus the reason it stays cheap.
 */

vi.mock('next/dynamic', () => ({
  default: () =>
    function Stub() {
      return <div role="dialog" aria-label="Your brand colour" />
    },
}))

const BLUE = 'oklch(0.5 0.18 250)'

beforeEach(() => {
  document.documentElement.removeAttribute(SKIN_ATTR)
  localStorage.clear()
})

describe('the brand mark', () => {
  it('shows the workspace logo when there is one', () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={BLUE} hasTheme />)

    expect(document.querySelector('img')).not.toBeNull()
  })

  /** No logo is not a blank space: the chip shows the colour in use. */
  it('shows a colour chip when there is no logo', () => {
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    expect(document.querySelector('img')).toBeNull()
  })

  /**
   * ── THE RULING, EXECUTED ──────────────────────────────────────────────────
   * One press paints the product in the customer's colours. The attribute is
   * the mechanism: `(app)/layout.tsx` always emits the brand rule scoped to it,
   * so writing it here is the whole switch.
   */
  it('turns the brand colours on with one press', async () => {
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    await userEvent.click(screen.getByRole('button', { name: /your brand colours/i }))

    expect(document.documentElement.getAttribute(SKIN_ATTR)).toBe('on')
    expect(localStorage.getItem(SKIN_KEY)).toBe('on')
  })

  /**
   * AND BACK AGAIN, which is the half that matters when a brand colour has made
   * something unreadable. A switch that only goes one way is a trap.
   */
  it('switches back to Sahoda colours with another press', async () => {
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)
    const button = screen.getByRole('button', { name: /your brand colours/i })

    await userEvent.click(button)
    await userEvent.click(screen.getByRole('button', { name: /sahoda colours/i }))

    expect(document.documentElement.hasAttribute(SKIN_ATTR)).toBe(false)
    expect(localStorage.getItem(SKIN_KEY)).toBe('off')
  })

  /** It reports its state, so a screen reader user knows which way it is set. */
  it('reports whether the brand is on', async () => {
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    const off = screen.getByRole('button', { name: /your brand colours/i })
    expect(off).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(off)
    expect(screen.getByRole('button', { name: /sahoda colours/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /** The pre-paint script has already decided, so the control agrees with it. */
  it('starts from the state the document is already in', () => {
    document.documentElement.setAttribute(SKIN_ATTR, 'on')
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    expect(screen.getByRole('button', { name: /sahoda colours/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /**
   * ── IT NEVER TOUCHES LIGHT AND DARK ───────────────────────────────────────
   * The separation, asserted at the only place the two could get crossed. A
   * press that also wrote `data-theme` would make the two switches fight, which
   * is the tangle the ruling ends.
   */
  it('leaves the platform theme exactly where it found it', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    await userEvent.click(screen.getByRole('button', { name: /your brand colours/i }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('sahoda-theme')).toBeNull()
  })

  /**
   * A WORKSPACE WITH NO BRAND HAS NOTHING TO SWITCH TO. Reporting a state change
   * that did not happen is worse than offering no switch, so the press opens the
   * panel, which is where "Add a logo" lives.
   */
  it('opens the panel instead of pretending to switch when there is no brand', async () => {
    render(<BrandMark logoUrl={null} primary={null} hasTheme={false} />)

    const button = screen.getByRole('button', { name: 'Your brand' })
    expect(button).not.toHaveAttribute('aria-pressed')

    await userEvent.click(button)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.documentElement.hasAttribute(SKIN_ATTR)).toBe(false)
  })

  /** The rarer half stays reachable: which colour is primary, and the file. */
  it('opens the panel from its own control', async () => {
    render(<BrandMark logoUrl={null} primary={BLUE} hasTheme />)

    await userEvent.click(screen.getByRole('button', { name: /open brand options/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  /**
   * NOTHING OF THE PANEL IS ON SCREEN UNTIL IT IS ASKED FOR. Rendering it closed
   * would put its markup in every page for a control most visits never touch,
   * which is the defect that failed the production build.
   */
  it('renders no panel until it is opened', () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={BLUE} hasTheme />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
