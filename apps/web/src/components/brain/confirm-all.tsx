'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'

import { confirmBrainFields } from '@/app/actions/brain-resolve-fields'
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
 * ── ONE WRITE FOR THE WHOLE GESTURE ─────────────────────────────────────────
 * This looped `confirmBrainField` once per target. MEASURED 2026-09-06 on the
 * wt-core preview against production: "Confirm all 4" fired four POSTs and
 * wrote versions 4, 5, 6 and 7 inside 1.1 seconds, while the console's
 * "Confirm selected" wrote two fields as one version in the same session.
 * `confirmBrainFields` stamps every path in one `resolve_brand_memory` call:
 * one version, one round trip, and no "1 of 4 could not be confirmed" to
 * explain, because there is no half-done state to be in.
 *
 * A transport failure (no network) is REPORTED in a sentence, never thrown out
 * of the transition — a rejection escaping `startTransition` unmounts the whole
 * route into the error boundary, which is what the per-row buttons did.
 */
export function ConfirmAll({ targets }: { targets: readonly ConfirmAllTarget[] }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (targets.length === 0) return null

  function confirmAll() {
    setError(null)
    start(async () => {
      try {
        const result = await confirmBrainFields(targets.map((target) => target.path))
        if (!result.ok) setError(result.message)
      } catch {
        setError('Could not reach Sahoda. Check your connection and try again. Nothing changed.')
      }
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
