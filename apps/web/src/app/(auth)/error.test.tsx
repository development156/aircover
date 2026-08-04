import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import AuthError from './error'

// Before this boundary existed, a crash on /sign-in fell through to
// global-error.tsx: the whole document replaced, ClerkProvider and the fonts
// gone, and deliberately no retry button. A hydration blip on the first screen a
// visitor ever sees became "reload the page".

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  lastEventId: vi.fn(),
}))

const EVENT_ID = 'b71c4e0a92d5476fa8e3105c6d29b4f7'
const STALE_EVENT_ID = 'ffffffffffffffffffffffffffffffff'

const captureException = vi.mocked(Sentry.captureException)
const lastEventId = vi.mocked(Sentry.lastEventId)

beforeEach(() => {
  vi.clearAllMocks()
  // Models the SDK contract: lastEventId() reports the most recent capture, so
  // it only yields the new id once captureException has actually run.
  let latest: string | undefined = STALE_EVENT_ID
  captureException.mockImplementation(() => {
    latest = EVENT_ID
    return EVENT_ID
  })
  lastEventId.mockImplementation(() => latest)
})

describe('(auth) error boundary', () => {
  test('captures a client-side crash and shows the user its event id', () => {
    const error = new Error('Clerk widget failed to mount')

    render(<AuthError error={error} reset={vi.fn()} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('reads the event id only after capturing, never before', () => {
    render(<AuthError error={new Error('boom')} reset={vi.fn()} />)

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

  test('leaves a server-origin error to onRequestError and shows no stale reference', () => {
    // Each boundary carries its own copy of this gate, so each copy is pinned:
    // a drifting duplicate is the whole risk of duplicating logic.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '9910324487',
    })

    render(<AuthError error={error} reset={vi.fn()} />)

    expect(captureException).not.toHaveBeenCalled()
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })

  test('offers a retry, which is the whole reason this boundary exists', async () => {
    // The difference between this file and the global fallback. A sign-in crash
    // is usually transient, so reset() re-rendering the segment can genuinely
    // recover — where global-error.tsx can only tell the user to reload.
    const reset = vi.fn()
    render(<AuthError error={new Error('boom')} reset={reset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('never renders the digest or the raw message to the user', () => {
    const error = Object.assign(new Error('CLERK_SECRET_KEY=sk_live_hunter2 rejected'), {
      digest: '9910324487',
    })

    const { container } = render(<AuthError error={error} reset={vi.fn()} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('9910324487')
  })
})
