'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { Channel } from '@sahoda/shared'

/**
 * THE ONE PLACE A CONNECT WINDOW IS OPENED.
 *
 * ── A POPUP, WITH THE FULL REDIRECT STILL BEHIND IT ──────────────────────────
 * Connecting used to take the whole tab: `window.location.assign(authUrl)` threw
 * the app away, and the customer came back to a fresh server render with a notice
 * at the top. Everything they had open elsewhere went with it.
 *
 * A popup keeps the app mounted. The last hop of the flow lands on OUR origin
 * (`/api/oauth/zernio/return`), so the popup's final document is same-origin with
 * this one and the two can talk.
 *
 * ── BUT NOT THROUGH `window.opener`, AND THAT IS THE WHOLE LESSON ────────────
 * The first version signalled with `window.opener.postMessage`. It failed in the
 * real world every time, and the reason is upstream of us: Google's sign-in pages
 * serve `Cross-Origin-Opener-Policy: same-origin`. The moment the popup lands on
 * one, the browser moves it into a NEW browsing context group and **severs
 * `window.opener` permanently** — navigating back to our origin afterwards does
 * not restore it. Our own headers were never the question; this repo sets no COOP
 * and it made no difference.
 *
 * Reported as "it opens a popup and it opens another new website and connects
 * there", with a screenshot of the popup showing the whole app at
 * `/connections?zernio=connected`. That was the closer's `opener`-is-null
 * fallback doing exactly what it was told.
 *
 * `BroadcastChannel` is the mechanism that does not care. It is scoped by ORIGIN,
 * not by window relationship, so a message posted from the popup reaches this tab
 * whatever the browsing context group. `opener.postMessage` is kept as a second
 * attempt for the case where it does survive, and costs nothing when it does not.
 *
 * ── `window.open` MUST BE CALLED IN THE CLICK, BEFORE THE FETCH ──────────────
 * The previous shape awaited `/api/oauth/zernio/start` and only then navigated. A
 * `window.open` after an `await` is outside the user-activation stack and Safari
 * and Firefox block it unconditionally. So the window is opened SYNCHRONOUSLY on
 * the click, pointed at nothing yet, and its location is replaced once the authUrl
 * comes back. That also means the customer never stares at a blank window while
 * the start route provisions a Zernio profile.
 *
 * ── AND IT ALWAYS HAS A WAY BACK ─────────────────────────────────────────────
 * A blocked popup returns null. Extensions block them, iOS Safari blocks them in
 * some modes, and a customer may simply have turned them off. The redirect path is
 * not a legacy branch kept around; it is the permanent fallback, which is why the
 * query-string outcome notice on /connections stays exactly as it was.
 */

/** What the popup posts home. Nothing else on this channel is acted on. */
const MESSAGE_TYPE = 'sahoda:connect-outcome'

/**
 * The origin-scoped channel the closer speaks on.
 *
 * Must match the literal in `popupCloser` in the return route byte for byte. It
 * is a string on both sides because the closer is inline script in a hand-built
 * HTML response and cannot import anything.
 */
const CHANNEL_NAME = 'sahoda-connect'

/** How often to notice a popup the customer closed without finishing. */
const CLOSE_POLL_MS = 500

export interface ConnectFlowState {
  pending: boolean
  error: string | null
  start: () => void
}

export function useConnectFlow(platform: Channel): ConnectFlowState {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const popupRef = useRef<Window | null>(null)

  /**
   * Stop waiting, and refresh.
   *
   * `router.refresh()` on EVERY ending, including a popup the customer closed
   * without connecting. The tiles are rendered on the server, so without it a
   * successful connect would leave a notice saying "Connected" above a card still
   * reading "Not connected" — and a cancelled one would leave a button stuck on
   * "Opening Instagram…" forever.
   */
  const finish = useCallback(() => {
    popupRef.current = null
    setPending(false)
    router.refresh()
  }, [router])

  useEffect(() => {
    if (!pending) return

    function onMessage(event: MessageEvent) {
      // THREE CHECKS, AND ALL THREE ARE LOAD-BEARING.
      //   origin — anyone can post to a window they have a handle on
      //   source — it must be the window WE opened, not another tab of ours.
      //            This is also what keeps two connect buttons pressed at once
      //            from answering each other's messages, since each holds its
      //            own ref, and it is why no nonce is needed on top.
      //   shape  — a same-origin script could still post anything
      if (event.origin !== window.location.origin) return
      if (event.source !== popupRef.current) return
      if ((event.data as { type?: unknown } | null)?.type !== MESSAGE_TYPE) return
      finish()
    }

    window.addEventListener('message', onMessage)

    // ── THE CHANNEL THAT ACTUALLY CARRIES THE ANSWER ────────────────────────
    // `BroadcastChannel` is scoped by ORIGIN. It does not care that Google's
    // COOP moved the popup into a different browsing context group and cut
    // `window.opener`, which is why the postMessage above never arrived.
    //
    // No origin check here and none is possible: the API only delivers between
    // same-origin contexts, which is the guarantee `event.origin` was being used
    // to establish. The shape is still checked — a same-origin script could post
    // anything.
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
      channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: unknown } | null)?.type === MESSAGE_TYPE) finish()
      }
    } catch {
      // Not every browser has it. The close-poll below still ends the wait, so a
      // customer on an old engine gets a slower finish rather than a stuck button.
    }

    // A closed popup fires no message. Without this poll the button waits for
    // something that is never coming — and it is also the safety net for a
    // browser with no BroadcastChannel and a severed opener.
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) finish()
    }, CLOSE_POLL_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      channel?.close()
      window.clearInterval(timer)
    }
  }, [pending, finish])

  const start = useCallback(() => {
    setError(null)

    // SYNCHRONOUS, inside the click. See the header — after an await this is
    // blocked by every browser that takes popup blocking seriously.
    // NO `noopener` TOKEN IN ANY FORM. `noopener=no` was here, on the reasoning
    // that the value turns it off. Browsers disagree about that, and there was
    // never a reason to name the feature at all — omitting it is the only
    // unambiguous way to keep the opener relationship.
    const popup = window.open('', 'sahoda-connect', 'width=620,height=780')
    popupRef.current = popup
    setPending(true)

    // ── AND BRING IT TO THE FRONT ────────────────────────────────────────────
    // The window is NAMED, so a second press reuses the one already open rather
    // than opening a second. A reused window is not raised, so a popup sitting
    // behind the main window means the customer presses Connect and sees nothing
    // happen at all — reported exactly that way, as "does not even open".
    // Wrapped: `focus` is refused in some embedded and mobile browsers, and a
    // throw here would abandon the fetch below.
    try {
      popup?.focus()
    } catch {
      // Nothing to do. The window is open either way.
    }

    void (async () => {
      try {
        const res = await fetch('/api/oauth/zernio/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // The route validates both against allowlists — a request, not an
          // instruction. `mode` tells the RETURN trip how to answer: a popup gets
          // a page that talks to its opener, a redirect gets the 303 it always got.
          body: JSON.stringify({ platform, mode: popup ? 'popup' : 'redirect' }),
        })
        const body = (await res.json()) as { ok?: boolean; authUrl?: string; message?: string }

        if (!res.ok || !body.ok || !body.authUrl) {
          popup?.close()
          popupRef.current = null
          setPending(false)
          setError(body.message ?? 'Couldn’t start the connection. Try again.')
          return
        }

        if (popup) {
          // `replace`, not `assign`: the empty document we opened should not be a
          // back-stop in the popup's own history.
          popup.location.replace(body.authUrl)
          return
        }

        // The popup was blocked. The whole tab goes, exactly as it always did,
        // and /connections reads the outcome off the query string on the way back.
        window.location.assign(body.authUrl)
      } catch {
        popup?.close()
        popupRef.current = null
        setPending(false)
        setError('Couldn’t reach the server. Check your connection and try again.')
      }
    })()
  }, [platform])

  return { pending, error, start }
}
