import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { useConnectFlow } from './use-connect-flow'

/**
 * THE POPUP, AND THE REDIRECT THAT MUST ALWAYS BE BEHIND IT.
 *
 * Connecting used to take the whole tab. A popup keeps the app mounted, and it is
 * possible here because the last hop lands on our own origin. Two things about it
 * are easy to get wrong and invisible when they are:
 *
 *   - `window.open` after an `await` is outside the user-activation stack and
 *     browsers block it. It has to happen synchronously in the click.
 *   - a blocked popup returns null, and there must still be a way through.
 */

function Harness() {
  const { pending, error, start } = useConnectFlow('instagram')
  return (
    <div>
      <button type="button" onClick={start}>
        {pending ? 'Opening' : 'Connect'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  )
}

/** A stand-in for the window `window.open` hands back. */
function fakePopup() {
  return {
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  }
}

/**
 * The JSON body the start request actually carried.
 *
 * A helper rather than an inline cast because the mock's call tuple is typed as
 * empty until it has been called, and `as { body: string }` on `undefined` is a
 * lie the compiler is right to refuse. Reading it through `unknown` with a real
 * check turns "the fetch was never made" into a named failure instead of a
 * cryptic one about tuple indices.
 */
function readSentBody(mock: { mock: { calls: unknown[][] } }): {
  platform?: string
  mode?: string
} {
  const init = mock.mock.calls[0]?.[1] as { body?: string } | undefined
  if (!init?.body) throw new Error('the start request was never sent')
  return JSON.parse(init.body)
}

const START_OK = {
  ok: true,
  json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/connect/xyz' }),
}

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  refresh.mockClear()
  assign = vi.fn()
  // jsdom refuses a real navigation; the whole point of the fallback is that it
  // navigates, so the method is replaced rather than the URL watched.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign, origin: 'https://app.sahodalabs.com' },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the popup is opened in the click, before anything is awaited', () => {
  it('opens the window BEFORE the start request resolves', async () => {
    const popup = fakePopup()
    const open = vi.fn(() => popup)
    vi.stubGlobal('open', open)

    let resolveStart: (value: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (resolveStart = resolve))),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    // THE ASSERTION THAT MATTERS. If this moves after the await, Safari and
    // Firefox block the window unconditionally and the feature silently dies for
    // a large share of customers with nothing failing in CI.
    expect(open).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveStart(START_OK)
    })
    expect(popup.location.replace).toHaveBeenCalledWith('https://zernio.com/connect/xyz')
    // The whole tab must NOT have gone anywhere.
    expect(assign).not.toHaveBeenCalled()
  })

  it('tells the server it is a popup, so the return trip answers one', async () => {
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup()),
    )
    const fetchMock = vi.fn(() => Promise.resolve(START_OK))
    vi.stubGlobal('fetch', fetchMock)

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    const body = readSentBody(fetchMock)
    expect(body).toEqual({ platform: 'instagram', mode: 'popup' })
  })
})

describe('a blocked popup still connects', () => {
  it('falls back to the full-page redirect that always worked', async () => {
    // Extensions block popups, iOS Safari blocks them in some modes, and a
    // customer may simply have turned them off. `window.open` returns null.
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    )
    const fetchMock = vi.fn(() => Promise.resolve(START_OK))
    vi.stubGlobal('fetch', fetchMock)

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    expect(assign).toHaveBeenCalledWith('https://zernio.com/connect/xyz')
    // And it must ask for the REDIRECT shape, or the return trip would serve a
    // closer page into the customer's only tab.
    const body = readSentBody(fetchMock)
    expect(body.mode).toBe('redirect')
  })
})

describe('the button never waits for something that is not coming', () => {
  it('stops and refreshes when the customer closes the popup unfinished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(START_OK)),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('Opening')

    popup.closed = true
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    // A closed popup fires no message. Without the poll this button reads
    // "Opening Instagram…" forever.
    expect(screen.getByRole('button')).toHaveTextContent('Connect')
    expect(refresh).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('closes the popup and says why when the server refuses', async () => {
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ ok: false, message: 'Every slot on your plan is in use.' }),
        }),
      ),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    // A refused connect must not leave an empty window sitting open with no
    // explanation anywhere.
    expect(popup.close).toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Every slot on your plan is in use.')
    expect(screen.getByRole('button')).toHaveTextContent('Connect')
  })
})
