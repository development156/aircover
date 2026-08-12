import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import OnboardingError from './error'

// Onboarding is the most write-heavy stretch of a new workspace's life, so a
// crash here is both likelier and costlier than elsewhere — and until this file
// existed it fell straight through to the no-retry global boundary.

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  lastEventId: vi.fn(),
}))

const EVENT_ID = 'c02da7be1f394c8ab5670e3d24915fa8'
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

describe('(onboarding) error boundary', () => {
  test('captures a client-side crash and shows the user its event id', () => {
    const error = new Error('classifier crashed while reading the intake sentence')

    render(<OnboardingError error={error} reset={vi.fn()} />)

    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).toHaveTextContent(EVENT_ID)
  })

  test('reads the event id only after capturing, never before', () => {
    render(<OnboardingError error={new Error('boom')} reset={vi.fn()} />)

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
    const error = Object.assign(new Error('An error occurred in the Server Components render'), {
      digest: '4471902238',
    })

    render(<OnboardingError error={error} reset={vi.fn()} />)

    expect(captureException).not.toHaveBeenCalled()
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument()
  })

  test('tells the user retrying restarts setup, because that is what it does', () => {
    // HONESTY. OnboardingFlow holds every in-flight answer in useState — the
    // three picks, the door text, the refusal, the resolved brain — and writes
    // nothing until resolve_brand_memory at Approve. reset() re-renders the
    // segment, so a brain already SAVED is read back by page.tsx and survives;
    // everything answered since does not. Copy promising that progress survives
    // would be false for the half that matters. If this assertion ever needs
    // relaxing, the flow gained persistence for the UNSAVED half and the copy
    // should change with it, not the other way round.
    render(<OnboardingError error={new Error('boom')} reset={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Try again to restart setup')
  })

  test('supplies its own full-height canvas, having replaced the onboarding layout', () => {
    // The (onboarding) group has no layout.tsx of its own — the layout lives one
    // segment deeper, at (onboarding)/onboarding/layout.tsx — so this boundary
    // sits ABOVE it and renders in its place. Nothing else is left to paint the
    // bg-s1 canvas, and without it the fallback lands as a bare card on the
    // default background.
    const { container } = render(<OnboardingError error={new Error('boom')} reset={vi.fn()} />)

    expect(container.firstElementChild).toHaveClass('min-h-dvh', 'bg-s1')
  })

  test('wires the retry button to the segment reset', async () => {
    const reset = vi.fn()
    render(<OnboardingError error={new Error('boom')} reset={reset} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  test('never renders the digest or the raw message to the user', () => {
    const error = Object.assign(new Error('supabase://service_role:hunter2@db/prod refused'), {
      digest: '4471902238',
    })

    const { container } = render(<OnboardingError error={error} reset={vi.fn()} />)

    expect(container).not.toHaveTextContent('hunter2')
    expect(container).not.toHaveTextContent('4471902238')
  })
})
