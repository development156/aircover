import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { BrandMark } from './brand-mark'

/**
 * The trigger in the topbar. Small on purpose: it renders on every route, so
 * every byte it imports is downloaded on every route, and the panel it opens
 * lives in its own chunk for that reason.
 *
 * The panel's own behaviour is `brand-panel.test.tsx`. These are the two things
 * the BUTTON must get right, plus the reason it stays cheap.
 */

vi.mock('next/dynamic', () => ({
  default: () =>
    function Stub() {
      return <div role="dialog" aria-label="Your brand colour" />
    },
}))

const BLUE = 'oklch(0.5 0.18 250)'

describe('the brand mark', () => {
  it('shows the workspace logo when there is one', () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={BLUE} />)

    expect(screen.getByRole('button', { name: /your brand/i })).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeNull()
  })

  /** No logo is not a blank space: the chip shows the colour in use. */
  it('shows a colour chip when there is no logo', () => {
    render(<BrandMark logoUrl={null} primary={BLUE} />)

    expect(screen.getByRole('button', { name: /your brand/i })).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  /**
   * THE OTHER HALF OF THE SCOPE RULING. `(app)/layout.tsx` emits the workspace's
   * brand tokens scoped to `[data-brand-skin]`; if no element carries that
   * attribute the rule matches nothing and the logo mark silently loses the
   * brand, with no error anywhere. The selector is asserted in
   * `skin-css.test.ts`; this is the element it has to find.
   */
  it('carries the scope the brand tokens are emitted for', () => {
    render(<BrandMark logoUrl={null} primary={BLUE} />)

    const button = screen.getByRole('button', { name: /your brand/i })
    expect(button.closest('[data-brand-skin]')).not.toBeNull()
  })

  /**
   * NOTHING OF THE PANEL IS ON SCREEN UNTIL IT IS ASKED FOR. Rendering it
   * closed would put its markup in every page for a control most visits never
   * touch, which is the defect that failed the production build.
   */
  it('renders no panel until it is opened', () => {
    render(<BrandMark logoUrl="https://example.test/logo.png" primary={BLUE} />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
