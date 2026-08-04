'use client'

import { useState, useTransition } from 'react'

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
  platform: string
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
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        onClick={start}
        data-guide={disabled ? undefined : `connections.connect_${platform}`}
      >
        {pending ? `Opening ${label}…` : `Connect ${label}`}
      </Button>
      {disabled && disabledReason ? (
        <span className="text-[12px] text-muted">{disabledReason}</span>
      ) : null}
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  )
}
