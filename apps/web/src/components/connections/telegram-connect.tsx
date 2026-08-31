'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * TELEGRAM'S CONTROL, WHICH IS NOT A BUTTON THAT OPENS A WINDOW.
 *
 * ── WHY THIS COMPONENT EXISTS AT ALL ─────────────────────────────────────────
 * Every other card on /connections opens a consent screen. MEASURED against the
 * live API, `GET /v1/connect/telegram` returns no `authUrl`: it returns a pairing
 * code valid fifteen minutes. The customer adds Zernio's bot as an administrator
 * of their channel and messages it that code, and the link completes INSIDE
 * TELEGRAM — a different product, on a different device as often as not.
 *
 * So there is nothing to pop up and nothing to come back from. The card issues a
 * code, shows it, and polls. Until this existed the button answered "Couldn't
 * start the connection. Try again." on every press, which is a remedy that could
 * never work.
 *
 * ── THREE SECONDS, AND IT STOPS ON ITS OWN ───────────────────────────────────
 * Zernio's own recommended interval. The poll is torn down when the code lands,
 * when it expires, and when the component unmounts — a timer that outlives the
 * card would keep calling our own route for the rest of the session on a page
 * the customer has navigated away from.
 */
const POLL_MS = 3000

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'waiting'; code: string; botUsername: string; instructions: string[] }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

export function TelegramConnect({
  disabled,
  disabledReason,
}: {
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  /** Read by the interval without re-arming it every time the phase object changes. */
  const active = useRef(false)

  const start = useCallback(async () => {
    setPhase({ kind: 'starting' })
    try {
      const res = await fetch('/api/oauth/zernio/telegram', { method: 'POST' })
      const body = (await res.json()) as {
        ok?: boolean
        code?: string
        botUsername?: string
        instructions?: string[]
        message?: string
      }
      if (!res.ok || !body.ok || !body.code || !body.botUsername) {
        setPhase({ kind: 'error', message: body.message ?? 'Couldn’t start the connection.' })
        return
      }
      active.current = true
      setPhase({
        kind: 'waiting',
        code: body.code,
        botUsername: body.botUsername,
        instructions: Array.isArray(body.instructions) ? body.instructions : [],
      })
    } catch {
      setPhase({ kind: 'error', message: 'Couldn’t reach the server. Try again.' })
    }
  }, [])

  useEffect(() => {
    if (phase.kind !== 'waiting') return
    let stopped = false

    const tick = async () => {
      if (stopped) return
      try {
        const res = await fetch('/api/oauth/zernio/telegram', { cache: 'no-store' })
        const body = (await res.json()) as { ok?: boolean; status?: string; message?: string }
        if (stopped) return
        if (!res.ok || !body.ok) {
          setPhase({ kind: 'error', message: body.message ?? 'Couldn’t check the connection.' })
          active.current = false
          return
        }
        if (body.status === 'connected') {
          active.current = false
          setPhase({ kind: 'idle' })
          // The card is rendered on the server, so the row only appears after a
          // refresh. Same reason `useConnectFlow` refreshes on every ending.
          router.refresh()
          return
        }
        if (body.status === 'expired') {
          active.current = false
          setPhase({ kind: 'expired' })
        }
      } catch {
        // A single failed poll is not a failed connection. The next tick asks
        // again; only an answer from our own route changes the phase.
      }
    }

    const timer = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [phase, router])

  if (phase.kind === 'waiting') {
    return (
      <div className="flex w-full flex-col gap-2">
        <ol className="type-sm flex flex-col gap-1.5 text-muted">
          <li>
            1. Add <span className="font-medium text-ink">@{phase.botUsername}</span> as an admin of
            your channel.
          </li>
          <li>2. Open a chat with the bot and send it this code, then your @channel.</li>
        </ol>
        {/* The code is the whole point of this panel, so it is the one thing
            given weight. `num` for tabular figures — it is read character by
            character off a screen and typed into another app. */}
        <p
          data-telegram-code
          className="num rounded-input bg-s2 surface-ring px-3 py-2 text-center font-medium tracking-widest"
        >
          {phase.code}
        </p>
        <p className="type-sm text-muted">
          This page notices on its own. The code lasts fifteen minutes.
        </p>
      </div>
    )
  }

  const words =
    phase.kind === 'starting'
      ? 'Getting a code…'
      : phase.kind === 'expired'
        ? 'Get a new code'
        : 'Connect Telegram'

  return (
    <div className="flex w-full flex-col gap-1">
      <Button
        variant="secondary"
        className="w-full justify-between"
        onClick={() => void start()}
        disabled={disabled || phase.kind === 'starting'}
        {...(disabled && disabledReason ? { title: disabledReason } : {})}
      >
        <span className="flex items-center gap-2">
          <Link2 aria-hidden className="size-4" />
          {words}
        </span>
        <ChevronRight aria-hidden className="size-4" />
      </Button>
      {phase.kind === 'expired' ? (
        <p className="type-sm text-muted">
          That code ran out before the bot saw it. A new one lasts fifteen minutes.
        </p>
      ) : null}
      {phase.kind === 'error' ? (
        <p role="alert" className="type-sm text-danger">
          {phase.message}
        </p>
      ) : null}
      {disabled && disabledReason ? <p className="type-sm text-muted">{disabledReason}</p> : null}
    </div>
  )
}
