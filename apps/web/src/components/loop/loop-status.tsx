'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pause, Play } from 'lucide-react'

import { setLoopSettings } from '@/app/actions/loop-dial'
import { loopStatusView, type LoopStatusView } from '@/lib/loop/status-view'
import { LOOP_SCHEDULE_SENTENCE } from '@/lib/loop/schedule'
import { Button } from '@/components/ui/button'

/**
 * IS THE LOOP ON, AND THE ONE CONTROL THAT CHANGES THAT.
 *
 * ── WHY THIS LEFT THE CONTROLS PANEL ─────────────────────────────────────────
 * Pause was the third control in a row of three, beside a budget field and a
 * button that spends credits. It is not that kind of control: it is the answer
 * to "is this thing running", which is the first question anybody opening this
 * page has, and it belongs beside the title where that question is asked.
 *
 * ── THREE STATES, NOT TWO ────────────────────────────────────────────────────
 * "Never turned on" is not "paused". A workspace that has never enabled the Loop
 * has no schedule to resume, and telling it the Loop is paused implies one was
 * taken away. `enabled` is a separate stored fact precisely so this pill can
 * tell those apart.
 *
 * ── IT REFRESHES THE SERVER RATHER THAN KEEPING ITS OWN TRUTH ────────────────
 * Pausing changes what the panel below may do: the plan button is disabled while
 * paused, and the refusal sentence beside it comes from the same verdict the
 * Sunday cron reaches. Both are computed on the server. Local state here with
 * server state there is how a screen ends up showing an enabled button above a
 * sentence explaining why it cannot be pressed, so this asks the server again
 * and lets one answer reach both.
 */

/**
 * "waiting for Sunday", with the day coming from the cron rather than typed.
 * `LOOP_SCHEDULE_SENTENCE` is "Every Sunday"; lowercased and re-fronted it is
 * the same day this deployment actually fires on, and it moves when that does.
 */
const WAITING_FOR = `waiting for ${LOOP_SCHEDULE_SENTENCE.replace(/^Every /, '')}`

export interface LoopStatusProps {
  /** Whether anybody has ever turned the Loop on in this workspace. */
  enabled: boolean
  paused: boolean
  /** Whether a cycle is working right now. */
  running: boolean
}

export function LoopStatus({ enabled, paused, running }: LoopStatusProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const view = loopStatusView({ enabled, paused, running }, WAITING_FOR)

  function toggle() {
    setError(null)
    startTransition(async () => {
      // What the press MEANS, not a flag negated. `paused: !paused` created the
      // settings row already paused for a workspace that had never turned the
      // Loop on, which is the press the remedy link sends people to.
      const result = await setLoopSettings({ paused: view.intent === 'pause' })
      if (!result.ok) {
        setError(result.message ?? 'Could not save that.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div id="loop-controls" className="flex flex-col items-start gap-2 narrow:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill view={view} />
        <Button variant="secondary" onClick={toggle} loading={pending}>
          {view.intent === 'turn-on' ? (
            <>
              <Play size={15} strokeWidth={1.8} aria-hidden />
              Turn the Loop on
            </>
          ) : (
            <>
              <Pause size={15} strokeWidth={1.8} aria-hidden />
              Pause the Loop
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="type-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function StatusPill({ view }: { view: LoopStatusView }) {
  return (
    <span
      className={[
        'type-chip inline-flex items-center gap-2 rounded-pill px-3 py-1',
        view.ground,
      ].join(' ')}
    >
      <span aria-hidden className={['size-1.5 rounded-pill bg-current', view.tone].join(' ')} />
      <span className={view.text}>{view.label}</span>
    </span>
  )
}
