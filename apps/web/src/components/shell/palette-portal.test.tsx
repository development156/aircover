import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { CommandPalette } from './command-palette'

/**
 * THE PALETTE OVERLAY ESCAPES THE TOPBAR, WHICH IS A CONTAINING BLOCK.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * `<CommandPalette />` is rendered inside `<header className="glass">`, and
 * `glass` sets `backdrop-filter`. An element with a `backdrop-filter` other than
 * `none` becomes a CONTAINING BLOCK for every descendant, including
 * `position: fixed` ones — so the overlay's `fixed inset-0` resolved against the
 * TOPBAR rather than the viewport.
 *
 * MEASURED in Chromium against the shipped stylesheet, viewport 1879x1007, a
 * 60px header carrying `blur(20px) saturate(1.6)`:
 *
 *     palette inside the header    overlay box  1834 x 137  at (45, 0)
 *     palette at <body>            overlay box  1879 x 1007 at (0, 0)
 *
 * The scrim covered a strip across the top and the page was never dimmed. It was
 * reported as three separate defects — a "black background bug", "no difference
 * contrast in background and foreground", and a panel that would not line up —
 * and every one of them is this.
 *
 * ── WHY THIS TEST IS DOM POSITION AND NOT GEOMETRY ──────────────────────────
 * jsdom computes no layout and knows nothing about `backdrop-filter`, so it can
 * never reproduce the trap itself. What it CAN assert is the property that makes
 * the trap impossible: the overlay is not a descendant of the thing that would
 * trap it. That is the fix, stated directly, and it fails the moment somebody
 * removes the portal — which is the regression worth catching, because the
 * symptom is invisible in a diff and three passes of careful measurement missed
 * it in a browser.
 *
 * `palette-legibility.spec.ts` carries the geometric form of the same claim.
 */

/** The topbar, reduced to the one property that caused this. */
function GlassTopbar() {
  return (
    <header className="glass" data-testid="topbar">
      <CommandPalette />
    </header>
  )
}

function openPalette() {
  fireEvent.click(screen.getByRole('button', { name: /Search Sahoda/ }))
}

describe('the overlay is portalled out of the topbar', () => {
  test('it is not rendered inside the glass header', () => {
    const { getByTestId } = render(<GlassTopbar />)
    openPalette()

    const overlay = document.querySelector('[data-palette-overlay]')
    expect(overlay, 'the palette should render an overlay when open').not.toBeNull()
    // `contains` rather than a parent check: a portal to any node outside the
    // header satisfies the requirement, and pinning the exact parent would fail
    // on a perfectly good change of portal target.
    expect(
      getByTestId('topbar').contains(overlay),
      'the overlay is inside the glass header, so `fixed` resolves against the ' +
        'topbar rather than the viewport and the scrim covers only a strip',
    ).toBe(false)
  })

  test('and the TRIGGER stays inside it, because that is chrome', () => {
    // The trigger belongs in the header — only the overlay leaves. A portal that
    // took the whole component with it would move the search box out of the
    // topbar's layout entirely.
    const { getByTestId } = render(<GlassTopbar />)
    expect(
      getByTestId('topbar').contains(screen.getByRole('button', { name: /Search Sahoda/ })),
    ).toBe(true)
  })

  test('the overlay is removed again on close, not merely hidden', () => {
    render(<GlassTopbar />)
    openPalette()
    expect(document.querySelector('[data-palette-overlay]')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    // A portal that mounts and never unmounts leaves a full-viewport fixed layer
    // over the app, swallowing every click on the page beneath it.
    expect(document.querySelector('[data-palette-overlay]')).toBeNull()
  })
})
