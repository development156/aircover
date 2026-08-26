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
    /* ── FULL WIDTH, AND THAT IS THE FIX ────────────────────────────────────
       Armed, this used to be a right-aligned column with a `max-w-[220px]`
       sentence, rendered INSIDE the row that also holds Reconnect. On a tile
       whose inner column is barely wider than that maximum, the sentence
       refused to shrink and the button beside it was squeezed until "Reconnect
       X" broke onto two lines and the confirm block sat over the card. Visible
       in the founder's screenshot and reported as "there is a visual bug too".

       `w-full` makes the parent's `flex-wrap` do its job: the confirm block
       takes its own line instead of competing for one. The sentence then wraps
       inside the tile rather than setting a floor wider than it. */
    <span className="flex w-full flex-col items-stretch gap-1.5">
      <Button size="sm" variant="destructive" onClick={run} disabled={pending} loading={pending}>
        Confirm disconnect
      </Button>
      {/* ── WHAT DISCONNECT ACTUALLY DOES, SAID BEFORE IT IS DONE ────────────
          ⚠ THIS SENTENCE WAS FALSE AND HAD TO CHANGE. It read: "The account
          stays linked at the publishing provider, so connecting this channel
          again brings it back." That was true while no removal endpoint was
          wired, and the old comment here said so and named itself as "the
          sentence to delete on the day a revoke exists".

          That day was 2026-08-26. `disconnectConnection` now calls
          `DELETE /v1/accounts/{id}` FIRST and deletes our row only if it
          succeeds. MEASURED against the live API: after the founder pressed
          Disconnect on X, `GET /v1/accounts` returned zero accounts across
          every profile on the key — the account really is gone at the provider.

          So the old sentence told a customer their account was still linked
          somewhere it no longer is, and promised that reconnecting would bring
          it back without a sign-in. Both halves wrong, in the direction that
          makes a person think less happened than did.

          What it says now is the sequence the action actually performs, and the
          consequence the customer can act on: they will have to sign in again.
          If the provider call fails, nothing is deleted and the action says so
          separately — that refusal is not this sentence's job. */}
      {/* `type-sm`, not a hand-written size. docs/37 §3.3 owns the type steps and
          `design-lint` refuses a literal here — correctly: a one-off px value is
          how a screen ends up with four sizes that are each nearly one of the four
          real ones. */}
      <span className="type-sm text-muted">
        Sahoda stops posting here and removes the account at the publishing provider. To use this
        channel again you will need to sign in to it again.
      </span>
    </span>
  )
}
