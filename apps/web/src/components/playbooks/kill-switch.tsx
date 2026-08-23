'use client'

import { useState, useTransition } from 'react'
import { OctagonX } from 'lucide-react'

import { killPlaybooks } from '@/app/actions/playbook-controls'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * THE KILL SWITCH — stop every playbook and take back what they scheduled.
 *
 * ── IT ASKS FIRST, AND WHAT IT ASKS IS THE POINT ─────────────────────────────
 * The confirmation is not ceremony. It is the only place a reader is told what
 * pressing this actually does: nothing is deleted, drafts stay in the Planner,
 * and the playbooks stop until they turn them back on. Someone reaching for this
 * is usually alarmed, and an alarmed person deserves to know that the emergency
 * stop is not also a delete button.
 *
 * ── IT DOES NOT TOUCH WORK THE PLAYBOOKS DID NOT SCHEDULE ───────────────────
 * Worth saying on the screen and not only in the SQL, because it is the fear
 * that stops people pressing it. The function finds its posts through the run
 * items, so a post you adopted, edited and scheduled yourself is not one of them
 * — even though it still carries the mark saying Sahoda drafted it.
 *
 * ── THE RESULT REPORTS COUNTS, INCLUDING ZERO ────────────────────────────────
 * "Stopped" tells a reader nothing about whether it worked. The counts do — and
 * a zero is reported as a zero rather than hidden, because "there was nothing
 * scheduled" is a real and reassuring answer that a silent success leaves them
 * guessing at.
 */

export function PlaybookKillSwitch() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function stop() {
    setError(null)
    startTransition(async () => {
      const out = await killPlaybooks(true)
      if (!out.ok) {
        setError(out.message ?? 'Could not stop them.')
        return
      }
      const runs = out.runsCancelled ?? 0
      const posts = out.postsUnscheduled ?? 0
      const off = out.playbooksDisabled ?? 0
      const parts = [
        `${runs} ${runs === 1 ? 'run' : 'runs'} stopped`,
        `${posts} ${posts === 1 ? 'post' : 'posts'} taken off the calendar`,
        `${off} ${off === 1 ? 'playbook' : 'playbooks'} switched off`,
      ]
      // Only mentioned when there were any. A line reading "0 credits still
      // reserved" invites the question of why credits were involved at all.
      if ((out.outstandingHolds ?? 0) > 0) {
        parts.push(`${out.outstandingHolds} reserved credits still held`)
      }
      setResult(`${parts.join(', ')}.`)
      setOpen(false)
    })
  }

  return (
    <section aria-labelledby="pb-kill" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="pb-kill" className="type-h3 text-ink">
        Stop everything
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        Takes every post a playbook scheduled off the calendar and switches them all off. Your
        drafts stay in the Planner. Nothing is deleted, and anything you scheduled yourself is left
        exactly where it is.
      </p>

      <div className="mt-3">
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={pending}>
          <OctagonX size={15} strokeWidth={1.8} aria-hidden />
          Stop every playbook
        </Button>
      </div>

      {result ? (
        <p role="status" className="type-sm mt-3 text-muted">
          {result}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-sm mt-3 text-muted">
          {error}
        </p>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title="Stop every playbook?">
        <p className="type-body text-muted">
          Every run in progress stops, every post a playbook put on the calendar comes off it and
          goes back to being a draft, and every playbook switches off. Nothing is deleted, and a
          post you scheduled by hand is not touched.
        </p>
        <div className="mt-4 flex gap-3">
          <Button onClick={stop} disabled={pending}>
            Stop them
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Leave them running
          </Button>
        </div>
      </Modal>
    </section>
  )
}
