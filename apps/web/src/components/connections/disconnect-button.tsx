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
      if (result.ok) toast.success(`Disconnected ${label}`)
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
    <Button size="sm" variant="destructive" onClick={run} disabled={pending} loading={pending}>
      Confirm disconnect
    </Button>
  )
}
