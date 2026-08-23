'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import type { MessageTag, ReplyAffordance } from '@sahoda/shared'

import { sendThreadReply, type InboxSendState } from '@/app/actions/inbox-send'
import { cn } from '@/lib/utils'

import { SendResult } from './send-result'

/**
 * The compose control for a DM thread.
 *
 * ── IT RENDERS EVEN WHEN IT CANNOT SEND ──────────────────────────────────────
 * A missing control leaves the customer wondering whether the feature exists; a
 * disabled one that states its cause answers the question. `canSendFromSahoda` is the
 * gate, and it narrows the affordance: `open` and `tagged` can send, `template_only`,
 * `closed` and `unknown` cannot and say why — before anything is typed, not after a
 * rejected submit.
 *
 * ── THE SERVER STILL DECIDES ─────────────────────────────────────────────────
 * Everything here is a hint. This tab may have been open since before the window
 * closed, so the action re-reads the thread and re-derives the window at submit time.
 * A live-looking box can still come back refused, and that refusal carries the same
 * sentence this card would have shown — one rule, one wording.
 */

/** Not a spinner: a stated state. The button says what it is doing while it does it. */
type Status = 'idle' | 'sending'

export interface ReplyComposerProps {
  affordance: ReplyAffordance
  accountId: string
  conversationId: string
}

export function ReplyComposer({ affordance, accountId, conversationId }: ReplyComposerProps) {
  const [body, setBody] = useState('')
  const [tag, setTag] = useState<MessageTag | ''>('')
  const [result, setResult] = useState<InboxSendState | null>(null)
  const [pending, startTransition] = useTransition()

  const status: Status = pending ? 'sending' : 'idle'
  const canSend = affordance.canSendFromSahoda
  const tags = affordance.state === 'tagged' ? affordance.tags : []
  // A tagged thread needs a tag chosen before anything can go. Left implicit, the send
  // would be refused server-side for a reason the customer could have fixed in advance.
  const needsTag = affordance.state === 'tagged' && tag === ''
  const disabled = !canSend || status === 'sending' || body.trim() === '' || needsTag

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return

    startTransition(async () => {
      const state = await sendThreadReply(accountId, conversationId, body.trim(), tag || undefined)
      setResult(state)
      // Cleared only on a CONFIRMED send. After an unconfirmed or failed attempt the
      // words stay in the box — retyping a reply the customer already wrote is the
      // cost of our uncertainty, and it should not be theirs to pay.
      if (state.ok) setBody('')
    })
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-line pt-4">
      <label htmlFor="reply-body" className="text-[13px] font-semibold">
        Reply
      </label>

      <textarea
        id="reply-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={!canSend || status === 'sending'}
        rows={3}
        aria-describedby={canSend ? undefined : 'reply-window-reason'}
        placeholder={canSend ? 'Write a reply' : 'Replying is not available on this thread'}
        className="mt-1.5 w-full resize-none rounded-card border border-line bg-s2 px-3 py-2 text-[14px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      />

      {tags.length > 0 ? <TagPicker tags={tags} value={tag} onChange={setTag} /> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-control rounded-sm bg-primary px-3 text-[13px] font-[550] text-primary-foreground transition-micro hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
        >
          <Send size={13} strokeWidth={2} aria-hidden />
          {status === 'sending' ? 'Sending…' : tags.length > 0 ? 'Send tagged reply' : 'Send reply'}
        </button>

        {needsTag ? (
          <span className="text-[13px] text-muted">Choose a message tag to send this reply.</span>
        ) : null}
      </div>

      <SendResult result={result} />
    </form>
  )
}

/**
 * The tags this THREAD still allows, not the platform's full set.
 *
 * HUMAN_AGENT is the only timed tag, so a Facebook thread past seven days offers three
 * and an Instagram one offers none — which is why the list comes from the affordance
 * rather than from `SEND_WINDOWS`. Radios rather than a select: the whole set is short,
 * and each option is a policy decision worth reading before it is made.
 */
function TagPicker({
  tags,
  value,
  onChange,
}: {
  tags: readonly MessageTag[]
  value: MessageTag | ''
  onChange: (tag: MessageTag) => void
}) {
  return (
    <fieldset className="mt-3">
      <legend className="text-[13px] font-semibold">Message tag</legend>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
        The free-form window has closed, so this reply has to declare why it is allowed. Choose the
        one that is actually true. The platform audits these.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((option) => (
          <label
            key={option}
            className={cn(
              'cursor-pointer rounded-pill border px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.04em] transition-micro',
              value === option
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-line bg-s2 text-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              name="message-tag"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
