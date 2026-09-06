'use client'

import { CHANNEL_LABELS, type Channel } from '@sahoda/shared'

import { useState, useTransition } from 'react'
import { SendHorizontal } from 'lucide-react'

import { stopAutopilotPost } from '@/app/actions/autopilot-stop'
import { Button } from '@/components/ui/button'
import type { GoingOutView } from '@/lib/loop/autopilot/going-out-copy'

/**
 * WHAT IS SET TO GO OUT — the cancel window, made visible.
 *
 * ── WHY THIS PANEL EXISTS ────────────────────────────────────────────────────
 * The stop was built before anything could arm a post, and until now nothing
 * rendered the posts it stops. A cancel window nobody can see is not a
 * safeguard. This is the screen half of it.
 *
 * ── IT RENDERS EVEN WHEN THERE IS NOTHING, AND SAYS WHICH NOTHING ────────────
 * `goingOutView` distinguishes three states and only one of them earns "nothing
 * is waiting". Hiding the panel in the other two would leave a reader who has
 * never armed a channel with no way to learn that the setting exists, and a
 * reader whose read failed with a screen that looks identical to an empty
 * queue. Both are the product being quiet about something it knows.
 *
 * ── THE OUTCOME OF A STOP IS NOT ASSUMED ─────────────────────────────────────
 * `stopAutopilotPost` answers three ways and the row prints which. "Stopped"
 * over a post that already went out is the false claim this whole module is
 * built to avoid, so `already` gets its own sentence and it does not pretend
 * the post was caught.
 */

export interface GoingOutRow {
  postId: string
  variantId: string
  channel: string
  postTitle: string
}

export function GoingOut({
  view,
  waiting,
}: {
  view: GoingOutView
  waiting: readonly GoingOutRow[]
}) {
  return (
    <section aria-labelledby="loop-going-out" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-going-out" className="type-h2">
          What is set to go out
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          {view.sentence}
          {view.remedy ? ` ${view.remedy}` : ''}
        </p>
      </div>

      {waiting.length > 0 ? (
        <ul className="grid gap-2">
          {waiting.map((row) => (
            <WaitingRow key={`${row.postId}:${row.variantId}`} row={row} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function WaitingRow({ row }: { row: GoingOutRow }) {
  const [settled, setSettled] = useState<'stopped' | 'already' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function stop() {
    setError(null)
    startTransition(async () => {
      const result = await stopAutopilotPost(row.postId, row.variantId)
      if (!result.ok) {
        setError(result.message ?? 'Sahoda could not stop that one.')
        return
      }
      // The action's own word, never a guess. `already` means the post went out
      // or somebody else stopped it first, and saying "stopped" over either
      // would be a claim nothing checked.
      setSettled(result.outcome ?? 'already')
    })
  }

  return (
    <li className="surface-ring rounded-card bg-surface p-4">
      <div className="flex items-start gap-3">
        <SendHorizontal
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className="mt-icon-nudge shrink-0 text-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="type-body truncate text-ink">{row.postTitle}</p>
          <p className="type-sm mt-1.5 text-muted">
            On {CHANNEL_LABELS[row.channel as Channel] ?? row.channel}.
          </p>
        </div>

        {settled ? (
          <p className="type-sm shrink-0 text-muted">
            {settled === 'stopped' ? 'Stopped. Nothing went out.' : 'Too late to stop this one.'}
          </p>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={stop}
            disabled={pending}
            className="shrink-0"
          >
            {pending ? 'Stopping…' : 'Stop this one'}
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="type-sm mt-2 text-muted">
          {error} Nothing changed, and nothing was charged.
        </p>
      ) : null}
    </li>
  )
}
