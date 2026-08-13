import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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
