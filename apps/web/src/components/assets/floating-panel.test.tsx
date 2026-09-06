import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FloatingPanel } from './floating-panel'

/**
 * "File into folder" / "Move to" closed the instant its own folder list was
 * scrolled: the window-capture `scroll` listener that dismisses a panel when
 * the PAGE moves under it could not tell the panel's own scroll from the
 * page's. MEASURED 2026-09-06 on /assets with more folders than fit.
 */
const anchor = { top: 10, left: 10, right: 110, bottom: 30, width: 100, height: 20 }

describe('FloatingPanel and scrolling', () => {
  it('stays open when something INSIDE the panel scrolls', () => {
    const onClose = vi.fn()
    render(
      <FloatingPanel anchor={anchor} onClose={onClose} ariaLabel="File into">
        <div data-testid="list" style={{ overflow: 'auto', maxHeight: 40 }}>
          <button type="button">Campaign</button>
          <button type="button">Menu</button>
        </div>
      </FloatingPanel>,
    )

    screen.getByTestId('list').dispatchEvent(new Event('scroll'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes when the page scrolls under it', () => {
    const onClose = vi.fn()
    render(
      <FloatingPanel anchor={anchor} onClose={onClose} ariaLabel="File into">
        <button type="button">Campaign</button>
      </FloatingPanel>,
    )

    window.dispatchEvent(new Event('scroll'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
