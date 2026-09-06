import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ChannelDetails } from './channel-details'

/**
 * Q-08 — MEASURED at 390px: the "Details" button on every one of the twelve
 * tiles on /connections rendered 63×18, well under the product's 44px phone
 * touch floor (docs/workflow/01_CONTEXT.md).
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT: jsdom does not run layout, so nothing
 * here can measure a rendered pixel height the way the audit did. This
 * asserts the FIX IS WRITTEN — the class that raises the floor below the
 * `narrow` breakpoint (700px, `globals.css`) is present on the button — not
 * that it renders at 44px in a real browser. That gap is why `max-narrow:` is
 * exercised live in `e2e/connections-honesty.spec.ts` at a 390px viewport.
 */
describe('the "Details" button meets the phone touch floor', () => {
  it('carries a 44px minimum hit area below the narrow breakpoint', () => {
    render(
      <ChannelDetails
        label="Instagram"
        blurb="What Sahoda posts here."
        rows={[{ term: 'Formats', detail: 'Photo, carousel, Reel' }]}
      />,
    )

    const button = screen.getByRole('button', { name: 'What Sahoda does with Instagram' })
    expect(button.className).toContain('max-narrow:min-h-[44px]')
  })
})
