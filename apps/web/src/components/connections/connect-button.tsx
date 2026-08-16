'use client'

import { useState, useTransition } from 'react'

import type { Channel } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { Badge } from '@/components/ui/badge'
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
  note,
}: {
  platform: Channel
  label: string
  disabled?: boolean
  disabledReason?: string
  /** The fourth, INFORMATIONAL state — see the badge below. */
  note?: string
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
    <div className="surface-ring flex min-w-[196px] flex-col gap-2 rounded-card bg-surface p-3">
      <div className="flex items-center gap-2">
        {/* The mark, uncontained — the row's own ring is the only edge. */}
        <ChannelLogo channel={platform} size={20} />
        <span className="truncate text-[13px] font-[550]">{label}</span>
        {note ? (
          // THE FOURTH STATE — informational.
          //
          // The kit's enum is connected | disconnected | error, and on a channel
          // the customer cannot actually complete, `disconnected` reads as an
          // INVITATION they cannot accept: a live-looking "Connect X" that ends
          // in a dead end after they have already approved access on X's own
          // screen. This fourth state says the true thing instead — the channel
          // is listed, and here is why it is not offered yet.
          // `hideGlyph`: rung 4's glyph is a CHECK, and a tick beside "Not
          // verified live" claims the exact opposite of the words next to it.
          <Badge rung="calm" hideGlyph className="ml-auto shrink-0">
            {note}
          </Badge>
        ) : null}
      </div>

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
