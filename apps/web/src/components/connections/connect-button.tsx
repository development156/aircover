'use client'

import { useState, useTransition } from 'react'

import type { Channel } from '@sahoda/shared'

import { Button } from '@/components/ui/button'

/**
 * Start the Zernio connect flow: POST to our own route, then send the browser to
 * the authUrl it returns.
 *
 * The redirect target is fetched rather than hard-coded because the URL is
 * per-profile and short-lived — and because building it here would mean the
 * profile id round-tripping through the browser, which is exactly what the
 * server-side design avoids.
 */
export function ConnectButton({
  platform,
  label,
  disabled,
  disabledReason,
}: {
  platform: Channel
  label: string
  disabled?: boolean
  disabledReason?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const start = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/oauth/zernio/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // The route validates this against the shared allowlist — it is a request,
          // not an instruction.
          body: JSON.stringify({ platform }),
        })
        const body = (await res.json()) as { ok?: boolean; authUrl?: string; message?: string }
        if (!res.ok || !body.ok || !body.authUrl) {
          setError(body.message ?? 'Couldn’t start the connection — try again.')
          return
        }
        // Leaving the app entirely; Zernio hosts the consent screen.
        window.location.assign(body.authUrl)
      } catch {
        setError('Couldn’t reach the server — check your connection and try again.')
      }
    })
  }

  return (
    // Just the control now. The CARD is `ChannelTile`, which owns the logo, the
    // name and the state — this used to draw its own card and its own logo row,
    // which is how the page ended up with two different tiles for one idea.
    <div className="flex w-full flex-col gap-1">
      <Button
        variant={disabled ? 'secondary' : 'primary'}
        size="sm"
        className="w-full"
        disabled={disabled || pending}
        onClick={start}
        data-guide={disabled ? undefined : `connections.connect_${platform}`}
      >
        {pending ? `Opening ${label}\u2026` : `Connect ${label}`}
      </Button>
      {disabled && disabledReason ? (
        <span className="text-[11px] text-muted">{disabledReason}</span>
      ) : null}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  )
}
