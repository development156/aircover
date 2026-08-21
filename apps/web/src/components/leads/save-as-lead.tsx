'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'

import { promoteThreadToLead } from '@/app/actions/leads'
import { Button } from '@/components/ui/button'

/**
 * DOOR TWO, from the inbox — "this one wants to buy something".
 *
 * ── WHY THE DETAILS TRAVEL FROM HERE ─────────────────────────────────────────
 * The conversation lives at Zernio; this database has never seen it. So the
 * name and the message come from the screen a member is already looking at, and
 * `lead_from_conversation` records `source.details = 'from_client'` so nobody
 * six months from now reads the lead as something Sahoda observed. The one thing
 * that does NOT travel from here is the tenant: the workspace id is checked
 * against the caller's own memberships inside the function.
 *
 * ── AND PRESSING IT TWICE IS NOT AN ERROR ────────────────────────────────────
 * The database dedupes on the conversation, so the second press finds the lead
 * that already exists and says so. A duplicated person in a pipeline is worse
 * than a missing one, because both get chased.
 */

export interface SaveAsLeadProps {
  conversationRef: string
  channel: string
  authorName: string | null
  authorHandle: string | null
  message: string | null
}

type State =
  | { kind: 'idle' }
  | { kind: 'saved'; existing: boolean }
  | { kind: 'failed'; message: string }

export function SaveAsLead(props: SaveAsLeadProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [pending, startTransition] = useTransition()

  function save() {
    setState({ kind: 'idle' })
    startTransition(async () => {
      const result = await promoteThreadToLead(props)
      if (!result.ok) {
        setState({ kind: 'failed', message: result.message ?? 'Could not save that as a lead.' })
        return
      }
      setState({ kind: 'saved', existing: Boolean(result.existing) })
    })
  }

  if (state.kind === 'saved') {
    return (
      <p role="status" className="type-sm text-muted">
        {state.existing ? 'Already in your leads.' : 'Saved to your leads.'}{' '}
        <Link href="/leads" className="font-[550] text-accent underline underline-offset-2">
          Open leads
        </Link>
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={save} loading={pending}>
        <UserPlus size={15} strokeWidth={1.8} aria-hidden />
        Save as a lead
      </Button>
      {state.kind === 'failed' ? (
        <span role="alert" className="type-sm text-danger">
          {state.message}
        </span>
      ) : null}
    </div>
  )
}
