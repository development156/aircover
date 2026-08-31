'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pause, Play } from 'lucide-react'

import { setLoopSettings } from '@/app/actions/loop-dial'
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

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await setLoopSettings({ paused: !paused })
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
        <StatusPill enabled={enabled} paused={paused} running={running} />
        <Button variant="secondary" onClick={toggle} loading={pending}>
          {paused ? (
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

function StatusPill({ enabled, paused, running }: LoopStatusProps) {
  // `enabled` is asked FIRST. A missing settings row gives enabled:false with
  // paused:false — the same pair as a live, idle Loop — so a label that only
  // consults `enabled` inside the paused branch tells a workspace that has
  // never opened the Loop that it is on and waiting.
  const label = !enabled
    ? 'Not turned on'
    : paused
      ? 'Paused'
      : running
        ? 'Running now'
        : `On, ${WAITING_FOR}`

  // The dot is decoration; the word carries the state. A pill that says its
  // meaning only in colour is a pill that says nothing to a reader who cannot
  // see it, and this one is the first thing on the page.
  const tone = paused ? 'text-muted' : running ? 'text-accent' : 'text-ok'
  const ground = paused ? 'bg-s2' : running ? 'bg-tint-100 dark:bg-s2' : 'bg-ok-bg'

  return (
    <span
      className={['type-chip inline-flex items-center gap-2 rounded-full px-3 py-1', ground].join(
        ' ',
      )}
    >
      <span aria-hidden className={['size-1.5 rounded-full bg-current', tone].join(' ')} />
      <span className={paused ? 'text-muted' : 'text-ink'}>{label}</span>
    </span>
  )
}
