'use client'

import { useState, useTransition } from 'react'
import { CornerDownRight } from 'lucide-react'

import type { InboxSendState } from '@/app/actions/inbox-send'

import { SendResult } from './send-result'

/**
 * The collapsed reply form shared by comments and reviews.
 *
 * ── WHY THESE TWO SHARE A COMPONENT AND THE DM COMPOSER DOES NOT ─────────────
 * Comments and reviews are the same interaction: a public reply, with no send window,
 * gated by a per-row permission and reported by its platform id. The DM composer is
 * genuinely different — it carries the window explanation and a message-tag picker —
 * and forcing all three into one component would put a `kind` flag through every branch.
 *
 * ── COLLAPSED BY DEFAULT ─────────────────────────────────────────────────────
 * A post can carry dozens of comments. A permanently open textarea under each one turns
 * the page into a wall of empty boxes and buries the comments themselves.
 */
export interface InlineReplyProps {
  /** Unique per row — several of these render on one page and ids must not collide. */
  fieldId: string
  label: string
  /** False disables the trigger. The reason is stated by the row, next to it. */
  canReply: boolean
  /** Does the actual send. Supplied by the caller so this component holds no action. */
  send: (body: string) => Promise<InboxSendState>
}

export function InlineReply({ fieldId, label, canReply, send }: InlineReplyProps) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [result, setResult] = useState<InboxSendState | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canReply}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
      >
        <CornerDownRight size={13} strokeWidth={2} aria-hidden />
        Reply
      </button>
    )
  }

  const disabled = pending || body.trim() === ''

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return

    startTransition(async () => {
      const state = await send(body.trim())
      setResult(state)
      // Cleared only on a CONFIRMED send. After an unconfirmed attempt the words stay in
      // the box: retyping a reply because we could not verify it landed is our cost to
      // carry, not the customer's.
      if (state.ok) setBody('')
    })
  }

  return (
    <form onSubmit={submit} className="mt-3 border-t border-line pt-3">
      <label htmlFor={fieldId} className="text-[13px] font-semibold">
        {label}
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={pending}
        rows={2}
        placeholder="Write a reply"
        className="mt-1.5 w-full resize-none rounded-card border border-line bg-s2 px-3 py-2 text-[14px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-pill bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
        >
          {pending ? 'Sending…' : 'Send reply'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-pill px-3 py-1 text-[13px] font-semibold text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
        >
          Cancel
        </button>
      </div>

      <SendResult result={result} />
    </form>
  )
}
