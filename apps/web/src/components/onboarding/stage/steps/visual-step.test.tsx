import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { DEFAULT_DATA } from '../store'
import { VisualStep } from './visual-step'

/**
 * ONE QUESTION ON THIS SCREEN, AND IT IS "WHAT IS YOUR LOGO".
 *
 * Founder's ruling, 2026-09-05, against a screenshot: the second upload — a
 * variant for dark backgrounds — leaves onboarding. It asked a shop owner in
 * their first five minutes for a file most of them do not have, to solve a
 * problem they have not met yet, and explained plating in order to ask.
 *
 * ── WHY AN ABSENCE IS WORTH A TEST ──────────────────────────────────────────
 * A deleted control has no defender, and this screen had NO test of any kind
 * before this file: the dark upload could have been re-added, or the primary
 * one lost, and nothing in eight thousand checks would have said so. The
 * plumbing behind the dark variant is still live in `shell/brand-panel.tsx` and
 * `app/actions/brand-logo.ts`, so re-adding a second button here is one
 * autocomplete away and would look correct in a diff.
 *
 * The FEATURE is not gone, which is what makes this safe: the brand panel in
 * the topbar still offers the dark variant with the same sentence, and a
 * workspace that never adds one keeps getting the plate — exactly what the
 * removed copy promised would happen.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · THE COLOUR EXTRACTION. `extractPalette` needs a decoded image and a real
 *    canvas, neither of which jsdom has, so nothing here chooses a file. What
 *    a chosen logo DOES is asserted nowhere in this repository.
 *  · THE BRAND PANEL. It asserts this screen no longer asks. That the other
 *    screen still does is checked by nothing — grep is the only guard, and a
 *    pass that deleted both would leave this file green.
 *  · LAYOUT. jsdom has none. A control pushed off the screen still passes.
 */
const render_ = () =>
  render(<VisualStep data={{ ...DEFAULT_DATA, palette: [], logoName: '' }} patch={() => {}} />)

describe('the visual step', () => {
  test('asks for one file, and it is the logo', () => {
    const { container } = render_()

    // THE REGRESSION THIS PINS. Two inputs means the second upload came back.
    const files = container.querySelectorAll('input[type="file"]')
    expect(files, 'this screen asks for exactly one file').toHaveLength(1)

    expect(screen.getByRole('button', { name: /choose your logo/i })).toBeTruthy()
  })

  test('says nothing about dark backgrounds, or about plating a logo', () => {
    // The claim, checked through the words a reader would actually meet, so a
    // control re-added under a different label still fails on its own copy.
    render_()
    const said = document.body.textContent ?? ''
    expect(said).not.toMatch(/dark background/i)
    expect(said).not.toMatch(/plate/i)
    expect(screen.queryByRole('button', { name: /dark/i })).toBeNull()
  })
})
