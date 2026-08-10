import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ConnectOutcomeNotice } from './connect-outcome-notice'

/**
 * The notice is the ONLY thing that makes a partial connect visible to the person
 * it happened to. The return route's 5xx makes it visible to a log reader; this is
 * the other half.
 *
 * Its second job is to render nothing it was handed. Every value here arrived
 * through the user's browser, so an unknown status must produce no output rather
 * than being echoed — the same rule `describePublishError` applies to adapter codes.
 */
describe('ConnectOutcomeNotice', () => {
  it('says a partial connect did not finish, and never calls it connected', () => {
    render(<ConnectOutcomeNotice status="partial" />)

    expect(screen.getByRole('status')).toHaveAttribute('data-outcome', 'partial')
    expect(screen.getByText(/didn’t finish connecting/i)).toBeInTheDocument()
    // The word that must never appear as the headline of a half-failure.
    expect(screen.queryByText(/^Connected$/)).not.toBeInTheDocument()
  })

  it.each(['connected', 'error', 'nothing'] as const)('renders the %s outcome', (status) => {
    render(<ConnectOutcomeNotice status={status} />)
    expect(screen.getByRole('status')).toHaveAttribute('data-outcome', status)
  })

  it('renders nothing when the page was reached normally', () => {
    const { container } = render(<ConnectOutcomeNotice status={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('never echoes a status it does not recognise', () => {
    // The value is attacker-influenceable: it is a query parameter on a URL anyone
    // can hand a signed-in user. An allowlist is the whole defence.
    const { container } = render(<ConnectOutcomeNotice status="<script>alert(1)</script>" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores a repeated parameter rather than interpreting the array', () => {
    // `?zernio=connected&zernio=error` is not a shape our own redirect produces.
    const { container } = render(<ConnectOutcomeNotice status={['connected', 'error']} />)
    expect(container).toBeEmptyDOMElement()
  })
})
