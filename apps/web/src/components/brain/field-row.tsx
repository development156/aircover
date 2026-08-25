'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil } from 'lucide-react'

import { confirmBrainField } from '@/app/actions/brand-field'
import { Button } from '@/components/ui/button'
import type { BrainField } from '@/lib/brand/fields'
import { leavesEqual, type BrainLeaf } from '@/lib/brand/leaf'
import type { FieldState } from '@/lib/brand/provenance'

import { CertaintyMark } from './certainty-mark'
import { FieldEditor } from './field-editor'
import { FieldValue } from './field-value'

export interface FieldRowProps {
  field: BrainField
  value: BrainLeaf
  state: FieldState
}

/**
 * One field of the Brand Brain: what it says, how it got there, and the way to
 * make it yours.
 *
 * Saving is an EXPLICIT press, not a blur. UI_RULES_v3 asks that approving a
 * proposed item be a visible event rather than a silent database write, and this
 * is that event — the dash turns solid because the user pressed a button that
 * said it would.
 *
 * The button carries "free" for the same reason a spending button carries its
 * cost. The other affordance on this page re-runs the whole resolve for 50
 * credits, and a user who cannot tell the two apart will avoid both. Confirming
 * a field calls `confirmBrainField`, which writes one version through the RPC and
 * touches neither the mesh nor the ledger.
 */
export function FieldRow({ field, value, state }: FieldRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<BrainLeaf>(value)
  const [error, setError] = useState<string | null>(null)
  const [pending, startSaving] = useTransition()

  function beginEdit() {
    // Re-seed from the server value on every entry: a cancelled edit, or a
    // regenerate that landed while this row sat open, must not resurrect a stale
    // draft the next time the row is opened.
    setDraft(value)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(value)
    setError(null)
    setEditing(false)
  }

  /**
   * Agree with the guess exactly as it stands, without opening the editor.
   *
   * The editor already offered this — its button reads "Confirm · free" when the
   * draft is untouched — but reaching it meant pressing Edit on a field that
   * needed no editing, and then pressing again. For a brain where most fields
   * are right on the first pass that is two presses of friction per field, on
   * the screen whose whole purpose is turning guesses into confirmations.
   *
   * Sends `value`, the server's own truth, and never `draft`. A draft can be
   * stale: it is seeded when the row mounts, and a regenerate landing since then
   * would make this press confirm a value the field no longer holds.
   */
  function confirmInPlace() {
    setError(null)
    startSaving(async () => {
      const result = await confirmBrainField(field.path, value)
      if (!result.ok) setError(result.message)
    })
  }

  function save() {
    setError(null)
    startSaving(async () => {
      const result = await confirmBrainField(field.path, draft)
      if (!result.ok) {
        setError(result.message)
        return
      }
      // Left open on failure so the typing survives; closed on success, where the
      // revalidated server render is now the truth.
      setEditing(false)
    })
  }

  const unchanged = leavesEqual(draft, value)
  // Unchanged text on an already-confirmed field is the one press that genuinely
  // records nothing — the server short-circuits it rather than burning a version.
  const alreadyConfirmed = state === 'confirmed'

  return (
    <div data-guide={`brain.field.${field.path}`} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{field.label}</span>
        <CertaintyMark state={state} />
        {!editing ? (
          <div className="ml-auto flex items-center gap-1">
            {/* Only while it is still a guess. On a confirmed field this would
                be a button that records nothing, next to a mark already saying
                the field is confirmed. */}
            {state !== 'confirmed' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={pending}
                onClick={confirmInPlace}
                className="px-2"
              >
                <Check size={13} aria-hidden />
                Confirm · free
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={beginEdit} className="px-2">
              <Pencil size={13} aria-hidden />
              Edit
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <FieldEditor field={field} draft={draft} onDraftChange={setDraft} disabled={pending} />
          {/* The question is shown while editing rather than at rest: at rest it
              would be noise beside an answer that already exists, and here it is
              the thing the user is actually answering. */}
          <p className="text-[12.5px] text-muted">{field.question}</p>
          {error ? (
            <p role="alert" className="text-[12.5px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            {/* Enabled even when the draft matches what is stored, and the label
                changes to say what the press actually does.

                This button used to be DISABLED here, beside "Change something to
                confirm this field." — because provenance was derived from the
                version where a value last changed, so an identical save recorded
                no authorship and the press would have reported success while
                confirming nothing. Refusing it was the honest move given that
                mechanism. `field_meta` carries the confirmation independently of
                the text, so agreeing with a guess is now a real, recordable act
                and the fastest path to a confirmed brain. Leaving the button
                disabled would have kept the whole point of that change
                unreachable from the one screen that offers it. */}
            <Button type="button" size="sm" loading={pending} onClick={save}>
              {unchanged && !alreadyConfirmed ? 'Confirm · free' : 'Save · free'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
            {unchanged && !pending ? (
              <span className="text-[12.5px] text-muted">
                {alreadyConfirmed
                  ? 'Already confirmed. Edit the text to change it.'
                  : 'Saves this wording as yours, exactly as written.'}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <FieldValue field={field} value={value} state={state} />
          {/* The editor renders its own error. This one belongs to the inline
              confirm, which has no editor open to put it in — without this the
              press would fail silently and the mark would simply not change. */}
          {error ? (
            <p role="alert" className="text-[12.5px] text-danger">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
