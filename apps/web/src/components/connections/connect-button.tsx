'use client'

import { ChevronRight, Link2 } from 'lucide-react'
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
          setError(body.message ?? 'Couldn’t start the connection. Try again.')
          return
        }
        // Leaving the app entirely; Zernio hosts the consent screen.
        window.location.assign(body.authUrl)
      } catch {
        setError('Couldn’t reach the server. Check your connection and try again.')
      }
    })
  }

  return (
    // Just the control now. The CARD is `ChannelTile`, which owns the logo, the
    // name and the state — this used to draw its own card and its own logo row,
    // which is how the page ended up with two different tiles for one idea.
    <div className="flex w-full flex-col gap-1">
      <Button
        /* SECONDARY, not primary, and this is the reference's own rule rather
           than a preference: "one primary per view" and "orange is rationed"
           (README §Design system). /connections renders FOUR of these at once —
           Instagram, LinkedIn, X, Google Business Profile — so making each one
           a solid orange full-width button spent the accent four times on a
           single screen and turned a calm checklist into the loudest page in
           the app.

           Four equal options also means there is no single primary here: none
           of these channels outranks the others, and the page's real job is to
           show which are connected. The workhorse secondary says "you may press
           this" without shouting, and the accent stays available for the one
           place a screen genuinely has a primary action. */
        variant="secondary"
        size="sm"
        /* `justify-between` with a leading mark and a trailing chevron, so the
           control reads as "this leaves the app and goes there" rather than as
           a generic submit. The chevron is the same affordance the spend row
           above it uses. Still `secondary` \u2014 see above; four of these render at
           once and none of them outranks the others. */
        className="w-full justify-between"
        disabled={disabled || pending}
        onClick={start}
        data-guide={disabled ? undefined : `connections.connect_${platform}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Link2 aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {pending ? `Opening ${label}\u2026` : `Connect ${label}`}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-3.5 shrink-0" />
      </Button>
      {disabled && disabledReason ? (
        <span className="text-[11px] text-muted">{disabledReason}</span>
      ) : null}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  )
}
