'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Unlink } from 'lucide-react'

import { disconnectConnection } from '@/app/actions/connections'
import { Button } from '@/components/ui/button'

/** The armed state disarms itself — never one click from destruction forever. */
const CONFIRM_WINDOW_MS = 8000

export interface DisconnectButtonProps {
  connectionId: string
  /** Account label shown in the confirm step, so the user knows WHICH one is armed. */
  label: string
}

/**
 * Two-step disconnect (compact cousin of DeletePostButton — same reasoning:
 * no window.confirm). Deleting the row cascades the sealed tokens away.
 */
export function DisconnectButton({ connectionId, label }: DisconnectButtonProps) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()

  function arm() {
    setArmed(true)
    setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS)
  }

  function run() {
    startTransition(async () => {
      const result = await disconnectConnection(connectionId)
      setArmed(false)
      // The claim is narrowed to what actually happened. "Disconnected Instagram"
      // was a claim about the account; this is a claim about Sahoda, which is the
      // part we can keep — the account is still linked at the publishing provider.
      if (result.ok) toast.success(`Sahoda stopped posting to ${label}`)
      else toast.error(result.message)
    })
  }

  if (!armed) {
    return (
      <Button size="sm" variant="ghost" onClick={arm}>
        <Unlink size={14} aria-hidden />
        Disconnect
      </Button>
    )
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="destructive" onClick={run} disabled={pending} loading={pending}>
        Confirm disconnect
      </Button>
      {/* ── WHAT DISCONNECT ACTUALLY DOES, SAID BEFORE IT IS DONE ────────────
          The button used to arm and confirm with no sentence at all, and the
          toast afterwards said "Disconnected Instagram", which claims more than
          happens. Deleting the row cascades the sealed tokens away, so Sahoda
          genuinely cannot publish there any more — that half is true and is what
          the customer is asking for.

          The half that was not said: the account stays linked at Zernio. There
          is no removal endpoint wired and the client exposes no method that
          could call one, so pressing Connect on this channel again re-adopts
          whatever Zernio still holds, including this account. Naming it here is
          the difference between a surprise and a documented behaviour, and it is
          the sentence to delete on the day a revoke exists. */}
      {/* `type-sm`, not a hand-written size. docs/37 §3.3 owns the type steps and
          `design-lint` refuses a literal here — correctly: a one-off px value is
          how a screen ends up with four sizes that are each nearly one of the four
          real ones. */}
      <span className="type-sm max-w-[220px] text-right text-muted">
        Sahoda stops posting here. The account stays linked at the publishing provider, so
        connecting this channel again brings it back.
      </span>
    </span>
  )
}
