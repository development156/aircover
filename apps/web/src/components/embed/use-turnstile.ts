'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cloudflare Turnstile, driven explicitly, with every way it can fail named.
 *
 * ── WHY EXPLICIT RENDERING AND NOT THE `.cf-turnstile` DIV ───────────────────
 * The implicit form renders any `.cf-turnstile` it finds and writes the token
 * into a hidden input. It also throws an uncaught `TurnstileError` when the
 * widget fails, and tells the page nothing. MEASURED 2026-09-02 against the
 * production build: with the widget unable to load, both embed forms showed no
 * widget and no notice, left Send enabled, posted `turnstile_token: ''` and
 * the visitor was told to check details that were right.
 *
 * Explicit rendering hands us the three callbacks that matter (token, expired,
 * error), and the script's own `load`/`error` events plus a timeout cover the
 * case where Cloudflare's script never arrives at all (an ad blocker, a
 * corporate proxy, the challenge host blocked). Every one of those lands in
 * `failed`, which the forms render as a sentence and a disabled button.
 *
 * ── THE STATES ───────────────────────────────────────────────────────────────
 *   unconfigured  no site key; the form says it is not set up and loads nothing
 *   loading       script or widget in flight, or a token expired and is renewing
 *   ready         a token is held and may be posted once
 *   failed        the check could not load or run; nothing can be sent
 */
export type ChallengeState = 'unconfigured' | 'loading' | 'ready' | 'failed'

export interface TurnstileRenderOptions {
  sitekey: string
  theme?: 'light' | 'dark' | 'auto'
  callback: (token: string) => void
  'expired-callback'?: () => void
  /** Returning true tells Turnstile the error was handled, so it does not throw. */
  'error-callback'?: (code: string) => boolean | void
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** `render=explicit`, so the script renders nothing until asked. */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** How long a visitor waits for Cloudflare's script before the form says it could not load. */
export const LOAD_TIMEOUT_MS = 8_000

export interface Turnstile {
  state: ChallengeState
  /** The token to post. Empty unless `state` is `ready`. */
  token: string
  /** Where the widget renders. Must be mounted while `siteKey` is set. */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Ask for a fresh token after a send was refused: a token is single-use at Cloudflare. */
  reset: () => void
}

export function useTurnstile(siteKey: string | null): Turnstile {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [state, setState] = useState<ChallengeState>(siteKey ? 'loading' : 'unconfigured')
  const [token, setToken] = useState('')

  useEffect(() => {
    if (!siteKey) return
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let timer: number | null = null

    const fail = (): true => {
      if (!cancelled) {
        setState('failed')
        setToken('')
      }
      return true
    }

    const renderWidget = () => {
      if (cancelled) return
      const turnstile = window.turnstile
      if (!turnstile) {
        fail()
        return
      }
      if (timer !== null) window.clearTimeout(timer)
      try {
        widgetIdRef.current = turnstile.render(container, {
          sitekey: siteKey,
          theme: 'light',
          callback: (fresh) => {
            if (cancelled) return
            setToken(fresh)
            setState('ready')
          },
          'expired-callback': () => {
            // Turnstile renews an expired token on its own; hold Send until it has.
            if (cancelled) return
            setToken('')
            setState('loading')
          },
          'error-callback': fail,
        })
      } catch {
        fail()
      }
    }

    timer = window.setTimeout(fail, LOAD_TIMEOUT_MS)

    if (window.turnstile) {
      renderWidget()
    } else {
      // Reuse a tag that is already loading (React StrictMode runs this effect
      // twice in development) rather than loading Cloudflare's script twice.
      let script = document.head.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', renderWidget)
      script.addEventListener('error', fail)
    }

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      const id = widgetIdRef.current
      widgetIdRef.current = null
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id)
        } catch {
          // The widget is gone with the container; nothing to clean.
        }
      }
    }
  }, [siteKey])

  const reset = useCallback(() => {
    const id = widgetIdRef.current
    if (!id || !window.turnstile) return
    setToken('')
    setState('loading')
    try {
      window.turnstile.reset(id)
    } catch {
      setState('failed')
    }
  }, [])

  return { state, token, containerRef, reset }
}
