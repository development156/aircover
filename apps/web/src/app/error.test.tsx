import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import RootError from './error'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  lastEventId: vi.fn(),
}))

const EVENT_ID = 'b7c204e1d95f438ab120c6e83f7d5a91'
// An id belonging to some earlier, unrelated event still sitting on the SDK's
// global scope — what `lastEventId()` returns when this error was never captured.
const STALE_EVENT_ID = 'ffffffffffffffffffffffffffffffff'

const captureException = vi.mocked(Sentry.captureException)
const lastEventId = vi.mocked(Sentry.lastEventId)

/**
 * Models the SDK's real ORDERING CONTRACT rather than returning a constant:
 * `lastEventId()` reports the most recent capture, so it yields the new id only
 * once `captureException` has run. A component that read it first would see the
 * stale id — the bug this shape catches and a constant-returning mock cannot.
 */
function armSentry() {
  let latest: string | undefined = STALE_EVENT_ID
  captureException.mockImplementation(() => {
    latest = EVENT_ID
    return EVENT_ID
  })
  lastEventId.mockImplementation(() => latest)
}

beforeEach(() => {
  vi.clearAllMocks()
  armSentry()
})

describe('root error boundary', () => {
  test('captures a client-side crash and shows the user its event id', () => {
    // No digest: nothing crossed the server boundary, so onRequestError never
    // fired and this boundary holds the only report that will ever exist.
    const error = new Error('provider blew up during hydration')

    render(<RootError error={error} reset={vi.fn()} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('reads the event id only after capturing, never before', () => {
    render(<RootError error={new Error('boom')} reset={vi.fn()} />)

    // The user-visible consequence: reading lastEventId() before the capture
    // surfaces a reference that resolves, in Sentry, to a different crash.
    expect(screen.getByRole('alert')).not.toHaveTextContent(STALE_EVENT_ID)

    // And the ordering itself, so the intent survives a refactor that happens to
    // keep the output right by accident. Spread-min rather than [0] because the
    // index signature is `| undefined` under noUncheckedIndexedAccess.
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(lastEventId).toHaveBeenCalledTimes(1)
    expect(Math.min(...captureException.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...lastEventId.mock.invocationCallOrder),
    )
  })

  test('does not capture a server-origin error a second time', () => {
    // The dominant case for this particular boundary: page.tsx is a server
    // component, so nearly everything it throws arrives here with a digest,
    // already reported by onRequestError with the real message and stack.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '5619284730',
    })

    render(<RootError error={error} reset={vi.fn()} />)

    expect(captureException).not.toHaveBeenCalled()
  })

  test('shows no reference at all for a server-origin error, rather than a wrong one', () => {
    // Skipping the capture but still calling lastEventId() would read the stale
    // id off the global scope and print it as this crash's reference — worse
    // than printing nothing, because it looks authoritative and is false.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '5619284730',
    })

    render(<RootError error={error} reset={vi.fn()} />)

    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent(STALE_EVENT_ID)
  })

  test('never renders the digest or the raw message to the user', () => {
    // The digest is a server-log join key that means nothing to a customer, and
    // thrown values routinely carry connection strings.
    const error = Object.assign(
      new Error('connect ECONNREFUSED postgres://admin:hunter2@10.0.0.4/prod'),
      { digest: '5619284730' },
    )

    const { container } = render(<RootError error={error} reset={vi.fn()} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('5619284730')
  })

  test('offers a retry, which global-error.tsx deliberately does not', () => {
    // THE REASON THIS FILE EXISTS. Without a root error.tsx, a crash on
    // src/app/page.tsx fell through to global-error.tsx, which replaces the
    // whole document and offers no way back except a manual reload. This
    // boundary renders inside the root layout, so reset() can genuinely re-run
    // the failed render.
    const reset = vi.fn()
    render(<RootError error={new Error('boom')} reset={reset} />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  test('wires the retry button to the segment reset', async () => {
    const reset = vi.fn()
    render(<RootError error={new Error('boom')} reset={reset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('offers retry even when it has no event id to show', () => {
    // Sentry disabled (or the capture never returned an id) must not cost the
    // user their recovery path — the reference line and the button are
    // independent affordances.
    lastEventId.mockReturnValue(undefined)

    render(<RootError error={new Error('boom')} reset={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })
})
