'use client'

import { RefreshCw } from 'lucide-react'

import type { ConnectionPlatform } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { useConnectFlow } from '@/lib/connections/use-connect-flow'

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
 *
 * ── AND IT OPENS THE SAME WINDOW THE CONNECT BUTTON DOES ─────────────────────
 * Both call `useConnectFlow`, which is the only place in this app that opens a
 * connect window. They had two copies of the fetch-then-navigate dance, so a
 * change to one silently gave the product two different connect experiences
 * depending on which control the customer happened to press.
 */
export function ReconnectButton({
  platform,
  label,
}: {
  platform: ConnectionPlatform
  label: string
}) {
  const { pending, error, start } = useConnectFlow(platform)

  return (
    <div className="flex flex-col items-end gap-1">
      {/* `loading` rather than `disabled` + a swapped label: it sets `aria-busy`
          and the disable in one place, so a screen-reader user is told the
          control is working instead of just losing it. The one control on this
          page that already used `loading` (Disconnect) behaved differently from
          the two that did not.

          INTEGRATION NOTE: wt-jiban wrote this against a hand-rolled
          `useTransition` + `fetch('/api/oauth/zernio/start')` and called the
          handler `run`. wt-divas had since moved this control onto the shared
          `useConnectFlow` hook — a popup opened synchronously on the click with
          a full-page redirect behind it for browsers that block one — whose
          handler is `start`. The hook is kept; only the a11y fix is taken. */}
      <Button size="sm" onClick={start} loading={pending}>
        {pending ? null : <RefreshCw size={14} aria-hidden />}
        {pending ? 'Opening…' : `Reconnect ${label}`}
      </Button>
      {error ? <span className="text-[12px] text-danger">{error}</span> : null}
    </div>
  )
}
