'use client'

import { useState, useTransition } from 'react'
import { OctagonX } from 'lucide-react'

import { killLoop } from '@/app/actions/loop-controls'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * THE KILL SWITCH — stop everything the Loop has scheduled, at once.
 *
 * ── IT ASKS FIRST, AND WHAT IT ASKS IS THE POINT ─────────────────────────────
 * The confirmation is not ceremony. It is the only place a reader is told what
 * pressing this actually does: nothing is deleted, drafts stay in the Planner,
 * and the Loop stops planning until they turn it back on. Someone reaching for
 * this is usually alarmed, and an alarmed person deserves to know that the
 * emergency stop is not also a delete button.
 *
 * ── THE RESULT REPORTS COUNTS, INCLUDING ZERO ────────────────────────────────
 * "Stopped the Loop" tells a reader nothing about whether it worked. The counts
 * do — and a zero is reported as a zero rather than hidden, because "there was
 * nothing scheduled" is a real and reassuring answer that a silent success
 * leaves them guessing at.
 */

export function KillSwitch() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function stop() {
    setError(null)
    startTransition(async () => {
      const out = await killLoop(true)
      if (!out.ok) {
        setError(out.message ?? 'Could not stop the Loop.')
        return
      }
      const parts = [
        `${out.cyclesCancelled} ${out.cyclesCancelled === 1 ? 'cycle' : 'cycles'} stopped`,
        `${out.postsUnscheduled} ${out.postsUnscheduled === 1 ? 'post' : 'posts'} taken off the calendar`,
      ]
      // Only mentioned when there were any. A line reading "0 credits released"
      // invites the question of why credits were involved at all.
      if ((out.holdsReleased ?? 0) > 0) parts.push(`${out.holdsReleased} reserved credits released`)
      setResult(`${parts.join(', ')}. The Loop is paused.`)
      setOpen(false)
    })
  }

  return (
    <section
      aria-labelledby="loop-kill"
      className="surface-ring rounded-card bg-danger-bg p-5 max-narrow:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex items-start gap-3">
          <OctagonX
            size={18}
            strokeWidth={1.8}
            aria-hidden
            className="mt-icon-nudge shrink-0 text-danger"
          />
          <div className="min-w-0">
            <h2 id="loop-kill" className="type-h3 text-ink">
              Stop everything
            </h2>
            <p className="type-body mt-1 max-w-[68ch] text-muted">
              Takes every post the Loop scheduled off the calendar and pauses it. Your drafts stay
              in the Planner. Nothing is deleted.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
          <OctagonX size={15} strokeWidth={1.8} aria-hidden />
          Stop the Loop
        </Button>
      </div>

      {result ? (
        <p role="status" className="type-sm mt-3 text-ink">
          {result}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}

      {/* The actions ride in the modal's FOOTER slot, dismiss first and the
          commitment last, on the trailing edge — the order every other footer
          in the product uses. They sat in the body before, primary on the left,
          so this one dialog read backwards against its neighbours and, on a
          short phone viewport, its buttons scrolled away with the text. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title="Stop the Loop?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Leave it running
            </Button>
            <Button onClick={stop} loading={pending}>
              Stop the Loop
            </Button>
          </>
        }
      >
        <p className="type-body text-muted">
          Every post the Loop scheduled comes off the calendar and goes back to being a draft.
          Nothing is deleted and nothing is published. The Loop stops planning until you turn it
          back on.
        </p>
      </Modal>
    </section>
  )
}
