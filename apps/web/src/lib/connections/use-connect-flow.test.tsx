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
    focus: vi.fn(),
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

  it('raises the window it opened, because a named window is reused unfocused', async () => {
    // `window.open('', 'sahoda-connect', …)` on a second press returns the window
    // already open rather than making a new one, and does not bring it forward.
    // Behind the main window that reads as nothing happening at all — reported
    // as "does not even open".
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/oauth/x' }),
        }),
      ),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    expect(popup.focus).toHaveBeenCalled()
  })

  it('refreshes when the tab gets focus back, not only when a message lands', async () => {
    // THE REGRESSION. Every other signal fires while this tab is in the
    // BACKGROUND — the popup holds focus until it closes — and a background tab
    // is throttled. Reported as "after the popup closes nothing happens, only
    // when I refresh does X connected appear", with the row already written.
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/oauth/x' }),
        }),
      ),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))
    refresh.mockClear()

    // No message, no close — only focus coming back, which is what actually
    // happens the instant the popup goes away.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveTextContent('Connect')
  })

  it('does not refresh on every later focus, which is the other failure mode', async () => {
    // RETARGETED, not weakened. It used to be called "stops listening for focus
    // once the wait is over" and it asserted the MECHANISM — that the listener
    // is torn down. The listener now outlives the wait on purpose (see the
    // repaint effect and the test below it), because tearing it down is what
    // made the focus fix unable to fire in the case it was written for.
    //
    // The guarantee is unchanged and is what is asserted here: a customer who
    // comes back to this tab later must not have the page refreshed under them.
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/oauth/x' }),
        }),
      ),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    refresh.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(refresh).not.toHaveBeenCalled()
  })
})

/**
 * THE SEQUENCE THAT ACTUALLY HAPPENS, WHICH THE FIRST FOCUS FIX NEVER SAW.
 *
 * ── WHAT WAS WRONG WITH THE TEST ABOVE IT ────────────────────────────────────
 * `refreshes when the tab gets focus back` dispatches `focus` with no message
 * first. That passes against a focus listener living inside the `pending` effect,
 * because `pending` is still true when it fires.
 *
 * Production does the opposite. `popupCloser` posts on the BroadcastChannel and
 * THEN calls `window.close()`, so the message lands while this tab is still in
 * the background: `finish()` runs, `pending` goes false, the effect is torn down
 * and the focus listener is removed — and only then does the popup vanish and
 * focus come back to a tab with nothing listening. The refresh that did start,
 * started in a background tab and was throttled.
 *
 * That is the founder's report, twice: "after the popup closes nothing happens,
 * only when i refresh then only x connected appears". The fix shipped, the report
 * came back, and the reason is that the safety net was taken down a moment before
 * the fall. A test in the wrong order could not see it.
 */
describe('the message lands first, and the paint is still owed', () => {
  /** The tab is behind the popup: visible, but not focused. */
  function backgroundTab() {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  }

  async function connectAndSignalFromBackground() {
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/oauth/x' }),
        }),
      ),
    )

    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    // The closer posts home while this tab is still behind the popup.
    backgroundTab()
    await act(async () => {
      const channel = new BroadcastChannel('sahoda-connect')
      channel.postMessage({ type: 'sahoda:connect-outcome' })
      channel.close()
      await Promise.resolve()
    })
    return popup
  }

  it('refreshes AGAIN when focus finally comes back', async () => {
    // THE REGRESSION. Before the fix this second refresh never happened, and the
    // customer sat looking at a tile that said "Not connected" over a row that
    // had been written seconds earlier.
    await connectAndSignalFromBackground()
    refresh.mockClear()

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(refresh).toHaveBeenCalled()
  })

  it('owes only ONE repaint, however many times the tab is returned to', async () => {
    // The listener outlives the wait now, so this is the guard that stops it
    // becoming a refresh on every tab switch for the rest of the session.
    await connectAndSignalFromBackground()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    refresh.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })

    expect(refresh).not.toHaveBeenCalled()
  })

  it('owes nothing when the tab had focus all along', async () => {
    // A customer watching this tab when the popup closes already got a refresh
    // that could paint. Owing a second one would refresh under them for nothing.
    const popup = fakePopup()
    vi.stubGlobal(
      'open',
      vi.fn(() => popup),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, authUrl: 'https://zernio.com/oauth/x' }),
        }),
      ),
    )
    render(<Harness />)
    await userEvent.click(screen.getByRole('button'))

    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    await act(async () => {
      const channel = new BroadcastChannel('sahoda-connect')
      channel.postMessage({ type: 'sahoda:connect-outcome' })
      channel.close()
      await Promise.resolve()
    })
    refresh.mockClear()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(refresh).not.toHaveBeenCalled()
  })
})
