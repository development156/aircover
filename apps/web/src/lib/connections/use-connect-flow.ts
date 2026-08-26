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
 * A popup keeps the app mounted. It is possible here for one specific reason
 * worth stating, because it is the thing that would silently break it: the LAST
 * hop of the flow lands on OUR origin (`/api/oauth/zernio/return`), so the popup's
 * final document is same-origin with the opener and can talk to it. Framing
 * headers are irrelevant to a popup — it is a window, not an iframe — but
 * `Cross-Origin-Opener-Policy` is not, and this repo sets none. If one is ever
 * added, `window.opener` goes null and this degrades to the redirect below.
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

    // A closed popup fires no message. Without this poll the button waits for
    // something that is never coming.
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) finish()
    }, CLOSE_POLL_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }
  }, [pending, finish])

  const start = useCallback(() => {
    setError(null)

    // SYNCHRONOUS, inside the click. See the header — after an await this is
    // blocked by every browser that takes popup blocking seriously.
    const popup = window.open('', 'sahoda-connect', 'width=620,height=780,noopener=no')
    popupRef.current = popup
    setPending(true)

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
