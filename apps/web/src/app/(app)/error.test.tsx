import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import AppError from './error'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  lastEventId: vi.fn(),
}))

const EVENT_ID = 'a3f19c7e4b8d42a1b6c05e7d9f381a2c'
// An id belonging to some earlier, unrelated event still sitting on the SDK's
// global scope. `lastEventId()` is a mutable read off that scope, so this is
// exactly what it returns when the current error was never captured.
const STALE_EVENT_ID = 'ffffffffffffffffffffffffffffffff'

const captureException = vi.mocked(Sentry.captureException)
const lastEventId = vi.mocked(Sentry.lastEventId)

/**
 * The Sentry mock models the SDK's real ORDERING CONTRACT rather than returning
 * a constant: `lastEventId()` reports the id of the most recent capture, so it
 * yields the new id only once `captureException` has run. A component that read
 * it first would see the stale id (or undefined) — which is precisely the bug
 * this shape can catch and a constant-returning mock cannot.
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

describe('(app) error boundary', () => {
  test('captures a client-side crash and shows the user its event id', () => {
    // No digest: nothing crossed the server boundary, so onRequestError never
    // fired and this boundary holds the only report that will ever exist.
    const error = new Error('useLayoutEffect blew up')

    render(<AppError error={error} reset={vi.fn()} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('reads the event id only after capturing, never before', () => {
    render(<AppError error={new Error('boom')} reset={vi.fn()} />)

    // Asserted twice, because each catches a different way of getting it wrong.
    //
    // 1. The USER-VISIBLE consequence. Reading lastEventId() before the capture
    //    would surface STALE_EVENT_ID — a reference that resolves, in Sentry, to
    //    a completely different crash. Support would chase the wrong event and
    //    the user would be told their report says something it does not.
    expect(screen.getByRole('alert')).not.toHaveTextContent(STALE_EVENT_ID)

    // 2. The ORDERING itself, pinned directly so the intent survives a refactor
    //    that happens to keep the output right by accident.
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

  test('does not capture a server-origin error a second time', () => {
    // Next marks anything that crossed the server boundary with a digest, and
    // onRequestError has already reported it with the real message and stack.
    // What arrives here is React's production stand-in — the message replaced by
    // a constant, the stack gone. Capturing it adds an event carrying nothing
    // the first lacks, and since that message is byte-identical for every server
    // crash in the app, Sentry files them all under one untriageable issue.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '2847193045',
    })

    render(<AppError error={error} reset={vi.fn()} />)

    expect(captureException).not.toHaveBeenCalled()
  })

  test('shows no reference at all for a server-origin error, rather than a wrong one', () => {
    // The trap that makes the suppression above dangerous if done carelessly.
    // Skipping the capture but still calling lastEventId() would read the stale
    // id off the global scope and print it as this crash's reference — strictly
    // worse than printing nothing, because it looks authoritative and is false.
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '2847193045',
    })

    render(<AppError error={error} reset={vi.fn()} />)

    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent(STALE_EVENT_ID)
  })

  test('never renders the digest or the raw message to the user', () => {
    // The boundary receives detail that must not cross to the browser. The
    // digest is a server-log join key that means nothing to a customer, and
    // thrown values routinely carry connection strings.
    const error = Object.assign(
      new Error('connect ECONNREFUSED postgres://admin:hunter2@10.0.0.4/prod'),
      { digest: '2847193045' },
    )

    const { container } = render(<AppError error={error} reset={vi.fn()} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('2847193045')
  })

  test('wires the retry button to the segment reset', async () => {
    // reset() re-runs this segment's failed render. A page-level failure is
    // often transient, so the retry can genuinely succeed — which is what earns
    // the button its place here and denies it one in global-error.tsx.
    const reset = vi.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('offers retry even when it has no event id to show', () => {
    // Sentry disabled (or the capture never returned an id) must not cost the
    // user their recovery path — the reference line and the button are
    // independent affordances.
    lastEventId.mockReturnValue(undefined)

    render(<AppError error={new Error('boom')} reset={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })
})
