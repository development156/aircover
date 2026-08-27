import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The button now opens a popup and calls `useRouter().refresh()` when it ends, so
// it sits inside the app-router context. Mocked rather than wrapped: the refresh
// is `use-connect-flow`'s behaviour and belongs to that module's own tests.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ConnectButton } from './connect-button'

/**
 * The executed half of the `connections.connect_x` anchor claim.
 *
 * `anchor-integrity.test.ts` scans source for `data-guide="…"` literals. This
 * component composes the value — `` `connections.connect_${platform}` `` — so
 * the scan cannot see it, and for a long time the anchor was filed in
 * PENDING_ANCHORS as a control that did not exist. It does exist; the registry
 * was describing a screen that had since been built, and the static check had
 * no way to notice.
 *
 * `DYNAMIC_ANCHORS` records the claim. This renders the component and reads the
 * attribute off the DOM, which is the only way to prove the composed string is
 * the one the seeded tour actually targets. A typo in the template would pass
 * every other test in this repo and silently auto-skip the tour step forever.
 */
describe('ConnectButton guide anchor', () => {
  it('renders the exact anchor the seeded connect tour targets', () => {
    render(<ConnectButton platform="x" label="X" />)

    // The literal, spelled out. Deriving it here from the same template would
    // test the test.
    expect(screen.getByRole('button')).toHaveAttribute('data-guide', 'connections.connect_x')
  })

  it('composes the anchor per platform rather than hard-coding one', () => {
    render(<ConnectButton platform="linkedin" label="LinkedIn" />)
    expect(screen.getByRole('button')).toHaveAttribute('data-guide', 'connections.connect_linkedin')
  })

  it('drops the anchor when the control is disabled, so a tour cannot spotlight a dead button', () => {
    // Deliberate: a spotlight on a button that refuses to act is the fabricated
    // success the anchor rules exist to prevent. A missing anchor auto-skips.
    render(<ConnectButton platform="x" label="X" disabled disabledReason="Plan is full." />)

    expect(screen.getByRole('button')).not.toHaveAttribute('data-guide')
    expect(screen.getByText('Plan is full.')).toBeInTheDocument()
  })
})

/**
 * ── THE PENDING STATE IS ANNOUNCED, NOT JUST DRAWN ───────────────────────────
 *
 * Clicking Connect fires a fetch and then navigates the whole page to the
 * provider. That round trip is not instant, and for its entire length the only
 * feedback this control gave was its label changing to "Opening X…" — a word,
 * with nothing in the accessibility tree to match it. A screen-reader user
 * pressed a button and was told that nothing had happened.
 *
 * The fetch here never settles, on purpose: that is what holds the component in
 * the state under test, and it is also the real-world case that matters most —
 * a slow provider is exactly when a person needs to know the click landed.
 */
describe('ConnectButton pending state', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('is not busy at rest, and says so by omission', () => {
    render(<ConnectButton platform="x" label="X" />)

    const button = screen.getByRole('button')
    // A control that is permanently busy is the same defect wearing the
    // opposite mask; without this the busy assertion below cannot tell them apart.
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Connect X')
  })

  it('announces itself busy and refuses a second click while the request is open', async () => {
    // Never resolves. The component stays in the pending branch.
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch

    render(<ConnectButton platform="x" label="X" />)
    const button = screen.getByRole('button')

    await act(async () => {
      fireEvent.click(button)
    })

    // 1 · The machine-readable half. Without it assistive tech is told nothing.
    expect(button).toHaveAttribute('aria-busy', 'true')
    // 2 · The half that stops a second OAuth window being opened behind the first.
    expect(button).toBeDisabled()
    // 3 · The visible half, kept in step with the other two.
    expect(button).toHaveTextContent('Opening X…')
  })
})
