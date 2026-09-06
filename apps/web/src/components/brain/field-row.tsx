'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil } from 'lucide-react'

import { confirmBrainField } from '@/app/actions/brand-field'
import { blankReason } from '@/lib/brand/blank'

import { useJustChanged } from './use-just-changed'
import { Button } from '@/components/ui/button'
import type { BrainField } from '@/lib/brand/fields'
import { leavesEqual, type BrainLeaf } from '@/lib/brand/leaf'
import type { FieldState } from '@/lib/brand/provenance'

import { CertaintyMark } from './certainty-mark'
import { FieldEditor } from './field-editor'
import { FieldValue } from './field-value'

const UNREACHABLE = 'Could not reach Sahoda. Check your connection and try again. Nothing changed.'

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
  /**
   * A transport failure is a SENTENCE here, never a throw.
   *
   * MEASURED 2026-09-06 on the wt-core preview, network set to Offline, one
   * "Confirm · free" pressed: the rejection escaped `startTransition`, React
   * unmounted the route into the error boundary, and the whole tab — every
   * open editor and ticked checkbox — was replaced by "Something broke on our
   * side, not yours". The failure was the person's own connection.
   */
  function confirmInPlace() {
    setError(null)
    startSaving(async () => {
      try {
        const result = await confirmBrainField(field.path, value, { asSeen: true })
        if (!result.ok) setError(result.message)
      } catch {
        setError(UNREACHABLE)
      }
    })
  }

  function save() {
    setError(null)
    startSaving(async () => {
      try {
        const result = await confirmBrainField(field.path, draft)
        if (!result.ok) {
          setError(result.message)
          return
        }
        // Left open on failure so the typing survives; closed on success, where
        // the revalidated server render is now the truth.
        setEditing(false)
      } catch {
        setError(UNREACHABLE)
      }
    })
  }

  // The server re-renders this row with the new state after a write; the change
  // in the PROP is the beat the chip pops on. First render never pops.
  const justConfirmed = useJustChanged(state) && state === 'confirmed'

  const unchanged = leavesEqual(draft, value)
  // Refused BEFORE the press, in the same words the server would refuse it in.
  const blank = blankReason(field, draft)
  // Unchanged text on an already-confirmed field is the one press that genuinely
  // records nothing — the server short-circuits it rather than burning a version.
  const alreadyConfirmed = state === 'confirmed'

  return (
    <div data-guide={`brain.field.${field.path}`} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{field.label}</span>
        <CertaintyMark state={state} justChanged={justConfirmed} />
        {!editing ? (
          <div className="ml-auto flex items-center gap-1">
            {/* Only while it is still a guess. On a confirmed field this would
                be a button that records nothing, next to a mark already saying
                the field is confirmed. */}
            {/* SECONDARY, not ghost, and that is the whole point of it.
                Shipped as a ghost first and the founder read straight past it —
                and past the section's "Confirm all" too, reporting it missing
                while looking at a screenshot containing it. `ghost` is
                `text-muted` with no ring: it reads as a caption, not a control,
                and a control nobody recognises is a control nobody presses.
                NOT `primary`: that variant is rationed to one per view (§6) and
                this screen renders fifteen of these. `secondary` is the button
                shape without the accent — the variant's own comment calls it
                the workhorse. */}
            {state !== 'confirmed' ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={pending}
                onClick={confirmInPlace}
                className="px-2.5"
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
          <FieldEditor
            field={field}
            draft={draft}
            onDraftChange={setDraft}
            disabled={pending}
            autoFocus
          />
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
            <Button
              type="button"
              size="sm"
              loading={pending}
              disabled={blank !== null}
              onClick={save}
            >
              {unchanged && !alreadyConfirmed ? 'Confirm · free' : 'Save · free'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
            {blank ? <span className="type-sm text-muted">{blank}</span> : null}
            {unchanged && !pending && !blank ? (
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
          <FieldValue field={field} value={value} state={state} lit={justConfirmed} />
          {/* The editor renders its own error. This one belongs to the inline
              confirm, which has no editor open to put it in — without this the
              press would fail silently and the mark would simply not change. */}
          {error ? (
            <p role="alert" className="type-sm text-danger">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
