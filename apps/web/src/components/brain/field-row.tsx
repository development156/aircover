'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'

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

  return (
    <div data-guide={`brain.field.${field.path}`} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink">{field.label}</span>
        <CertaintyMark state={state} />
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={beginEdit}
            className="ml-auto px-2"
          >
            <Pencil size={13} aria-hidden />
            Edit
          </Button>
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
            {/* Disabled while the draft matches what is already stored. Provenance
                is derived from the version where a value last CHANGED, so an
                identical save records no authorship — the press would report
                success and confirm nothing. Better to refuse it than to lie. */}
            <Button type="button" size="sm" loading={pending} disabled={unchanged} onClick={save}>
              Save · free
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
            {unchanged && !pending ? (
              <span className="text-[12.5px] text-muted">
                Change something to confirm this field.
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <FieldValue field={field} value={value} state={state} />
      )}
    </div>
  )
}
