import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import GlobalError from './global-error'

// The last boundary — it renders when the ROOT LAYOUT throws, replacing the
// document rather than rendering inside it.

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  lastEventId: vi.fn(),
}))

// The component emits <html> and <body>, which it must: there is no other
// component left to emit them. React warns about the nesting when RTL renders it
// into a div, and the warning is noise here rather than signal — the DOM shape is
// correct in the only place it ever runs.
vi.spyOn(console, 'error').mockImplementation(() => {})

const EVENT_ID = 'd48e6b1039fa42c7913b8e5720ac6d3f'
const STALE_EVENT_ID = 'ffffffffffffffffffffffffffffffff'

const captureException = vi.mocked(Sentry.captureException)
const lastEventId = vi.mocked(Sentry.lastEventId)

beforeEach(() => {
  vi.clearAllMocks()
  let latest: string | undefined = STALE_EVENT_ID
  captureException.mockImplementation(() => {
    latest = EVENT_ID
    return EVENT_ID
  })
  lastEventId.mockImplementation(() => latest)
})

describe('global error boundary', () => {
  test('captures a root layout crash that happened during client render', () => {
    // No digest means nothing crossed the server boundary — a provider blowing
    // up on hydration, say. onRequestError never fired, so this capture is the
    // only report that will ever exist for it.
    const error = new Error('ClerkProvider threw during hydration')

    render(<GlobalError error={error} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('reads the event id only after capturing, never before', () => {
    render(<GlobalError error={new Error('boom')} />)

    expect(screen.getByRole('alert')).not.toHaveTextContent(STALE_EVENT_ID)
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(lastEventId).toHaveBeenCalledTimes(1)
    // Each ran exactly once, so the min IS that single call's sequence number.
    // Spread-min rather than [0] because the index signature is `| undefined`
    // under noUncheckedIndexedAccess, and a cast here would hide the very case
    // (a mock that never ran) the assertion above exists to rule out.
    expect(Math.min(...captureException.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...lastEventId.mock.invocationCallOrder),
    )
  })

  test('does not duplicate a server-origin root layout crash', () => {
    // A root layout can throw on the server too, and then onRequestError already
    // holds the real message and stack. The copy that reaches this component has
    // neither, so capturing it would file a contentless second event under a
    // message shared by every server crash in the app.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '7712004583',
    })

    render(<GlobalError error={error} />)

    expect(captureException).not.toHaveBeenCalled()
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })

  test('offers no retry, because reset would re-run the layout that just threw', () => {
    // Deliberate absence. Root-layout failures are deterministic almost by
    // definition — a bad provider is bad on every attempt — so a button that
    // reliably reproduces the crash reads as a second failure and costs more
    // trust than showing no button at all.
    render(<GlobalError error={new Error('boom')} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent("This page didn't load")
  })

  test('never renders the digest or the raw message to the user', () => {
    const error = Object.assign(new Error('DATABASE_URL=postgres://admin:hunter2@10.0.0.4/prod'), {
      digest: '7712004583',
    })

    const { container } = render(<GlobalError error={error} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('7712004583')
  })
})
