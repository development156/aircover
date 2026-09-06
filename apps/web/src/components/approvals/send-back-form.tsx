'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { REASON_MAX, validateReason } from '@/lib/approvals/context'

export interface SendBackFormProps {
  /** What the note is about, for the label: "this post" or "3 posts". */
  subject: string
  /** Runs with the trimmed reason. Resolves with the sentence to show on failure, or null. */
  onSubmit: (reason: string) => Promise<string | null>
  onCancel: () => void
}

/**
 * THE NOTE THAT GOES BACK WITH A POST. Inline, not a dialog.
 *
 * ── WHY A REASON IS REQUIRED ─────────────────────────────────────────────────
 * `return_post_to_draft` refuses an empty one (REASON_REQUIRED), and the rule is
 * right: "sent back" with no note is a post the writer has to guess about. The
 * same check runs here first, so an empty press costs a sentence and not a
 * round trip.
 *
 * ── FOCUS ────────────────────────────────────────────────────────────────────
 * The box takes focus on open, Escape cancels, and the caller restores focus to
 * whatever opened it (the control this replaced is gone from the tree by then,
 * so only the caller knows where to send it).
 */
export function SendBackForm({ subject, onSubmit, onCancel }: SendBackFormProps) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    box.current?.focus()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const check = validateReason(reason)
    if (!check.ok) {
      setError(check.message)
      box.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const failure = await onSubmit(check.reason)
    setBusy(false)
    if (failure !== null) {
      setError(failure)
      box.current?.focus()
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="surface-ring space-y-2 rounded-sm bg-s2 p-3"
      data-send-back-form
    >
      <Label htmlFor={`${id}-reason`}>What should change in {subject}?</Label>
      <Textarea
        id={`${id}-reason`}
        ref={box}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={REASON_MAX}
        rows={3}
        error={error !== null}
        aria-describedby={error !== null ? `${id}-error` : `${id}-count`}
        placeholder="One sentence the writer can act on."
      />
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${id}-count`} className="type-meta tabular-nums text-muted">
          {reason.trim().length} / {REASON_MAX}
        </span>
        {error !== null ? (
          <span id={`${id}-error`} role="alert" className="type-meta text-danger">
            {error}
          </span>
        ) : null}
        <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy} disabled={busy}>
            <Undo2 size={13} strokeWidth={2} aria-hidden />
            Send back
          </Button>
        </span>
      </div>
    </form>
  )
}
