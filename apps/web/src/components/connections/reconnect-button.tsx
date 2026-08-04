'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Re-run the connect flow for an account that has expired or been flagged.
 *
 * Deliberately the SAME route as a first-time connect. Zernio has no "refresh"
 * endpoint — doc 13 §2.5: 60-day tokens, no auto-refresh — so reconnecting is
 * genuinely consenting again, and `upsert_zernio_connection` upserts on
 * `(workspace, platform, account id)`, which means the same account lands back on
 * the same row with a fresh `expires_at` rather than becoming a duplicate.
 *
 * Nothing is deleted first. A disconnect-then-reconnect would leave the workspace
 * with no connection at all if the user abandoned the consent screen halfway.
 */
export function ReconnectButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/oauth/zernio/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        })
        const body = (await res.json()) as { ok?: boolean; authUrl?: string; message?: string }
        if (!res.ok || body.ok !== true || !body.authUrl) {
          setError(body.message ?? 'Couldn’t start reconnecting — try again.')
          return
        }
        window.location.assign(body.authUrl)
      } catch {
        setError('Couldn’t reach the server — check your connection and try again.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={run} disabled={pending}>
        <RefreshCw size={14} aria-hidden />
        {pending ? 'Opening…' : `Reconnect ${label}`}
      </Button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  )
}
