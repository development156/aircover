'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'

import { confirmBrainField } from '@/app/actions/brand-field'
import { Button } from '@/components/ui/button'
import type { BrainLeaf } from '@/lib/brand/leaf'

export interface ConfirmAllTarget {
  path: string
  value: BrainLeaf
}

/**
 * Confirm every remaining guess in one section, exactly as written.
 *
 * ── WHY THIS IS NOT A SHORTCUT AROUND THE CONFIRMATION RING ──────────────────
 * The ring's meaning is "a person vouched for this", and the worry about a bulk
 * button is that it lets someone reach a confirmed brain without reading it. It
 * is offered anyway, for a reason the screen makes true: the values are all
 * on-screen above this button. Pressing it is a person saying "these are right",
 * about text they are looking at, which is the same act the per-field button
 * performs and no weaker.
 *
 * What it must never become is a button that confirms fields the reader cannot
 * see — one that spans tabs, or the whole brain from the header. It is scoped to
 * the section it sits in for that reason.
 *
 * ── ONE WRITE PER FIELD, SEQUENTIALLY ────────────────────────────────────────
 * `confirmBrainField` writes one version per field through the RPC; there is no
 * bulk action and this does not invent one by reaching past it. Sequential
 * because each is a workspace-scoped write behind RLS, and a burst of them at a
 * free-tier database to save a moment on a button press is the wrong trade.
 *
 * A partial failure is REPORTED, not swallowed: the marks that changed have
 * changed, and the sentence names how many did not so the reader is not left
 * comparing counts to work it out.
 */
export function ConfirmAll({ targets }: { targets: readonly ConfirmAllTarget[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (targets.length === 0) return null

  function confirmAll() {
    setError(null)
    start(async () => {
      let failed = 0
      for (const target of targets) {
        try {
          const result = await confirmBrainField(target.path, target.value)
          if (!result.ok) failed += 1
        } catch {
          // A throw and an `ok: false` read the same to the person: that one is
          // still a guess.
          failed += 1
        }
      }
      setError(
        failed === 0
          ? null
          : `${failed} of ${targets.length} could not be confirmed. The rest were. Try those again.`,
      )
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        {/* See the note in `field-row.tsx`: this shipped as a ghost and was
            reported missing by someone looking at it. */}
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={confirmAll}>
          <Check size={13} aria-hidden />
          Confirm all {targets.length} · free
        </Button>
      </div>
      {/* Says what the press does before it is pressed, in the same words the
          per-field button uses, so the two read as one action at two scales. */}
      <p className="type-sm text-muted">
        Marks every remaining guess here as yours, exactly as written.
      </p>
      {error ? (
        <p role="alert" className="type-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
