'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { Paperclip, Send, X } from 'lucide-react'
import type { MessageTag, ReplyAffordance } from '@sahoda/shared'

import { sendThreadReply, type InboxSendState } from '@/app/actions/inbox-send'
import type { AssetCard } from '@/lib/assets/view'
import { cn } from '@/lib/utils'

import { SendResult } from './send-result'

// The library dialog and everything under it (the grid, the thumbnails, the picker
// action) load when Attach is pressed rather than in the thread route's base chunk,
// which is what keeps this screen inside its js-budget. Same pattern as the
// approvals queue's comment thread.
const AttachPicker = dynamic(() => import('./attach-picker').then((m) => m.AttachPicker), {
  ssr: false,
})

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
  // The chosen file, held here and sent as an ID. Nothing is written until Send:
  // picking a photo and then changing your mind must cost nothing.
  const [attachment, setAttachment] = useState<AssetCard | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const status: Status = pending ? 'sending' : 'idle'
  const canSend = affordance.canSendFromSahoda
  const tags = affordance.state === 'tagged' ? affordance.tags : []
  // A tagged thread needs a tag chosen before anything can go. Left implicit, the send
  // would be refused server-side for a reason the customer could have fixed in advance.
  const needsTag = affordance.state === 'tagged' && tag === ''
  // The window rules are untouched: Attach follows the composer exactly. A thread
  // that cannot send must not let a file be chosen for it, and neither may a send
  // in flight. Only the empty-body and missing-tag conditions are Send's alone.
  const canAttach = canSend && status !== 'sending'
  const disabled = !canSend || status === 'sending' || body.trim() === '' || needsTag

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return

    startTransition(async () => {
      const state = await sendThreadReply(
        accountId,
        conversationId,
        body.trim(),
        tag || undefined,
        // An ID, never a url. The server resolves it against this workspace's own
        // library and mints the link the platform fetches.
        attachment === null ? undefined : { assetId: attachment.id },
      )
      setResult(state)
      // Cleared only on a CONFIRMED send. After an unconfirmed or failed attempt the
      // words stay in the box — retyping a reply the customer already wrote is the
      // cost of our uncertainty, and it should not be theirs to pay. The photo stays
      // for the same reason: re-finding it is the same cost.
      if (state.ok) {
        setBody('')
        setAttachment(null)
      }
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

      {attachment !== null ? (
        <AttachmentChip card={attachment} onRemove={() => setAttachment(null)} busy={!canAttach} />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={!canAttach}
          aria-label={attachment === null ? 'Attach a picture' : 'Change the attached picture'}
          data-guide="inbox.attach"
          className="inline-flex h-control items-center gap-1.5 rounded-sm border border-line bg-s2 px-3 type-sm font-[550] text-ink transition-micro hover:border-primary active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
        >
          <Paperclip size={13} strokeWidth={2} aria-hidden />
          {attachment === null ? 'Attach' : 'Change'}
        </button>

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

      {pickerOpen ? (
        <AttachPicker
          open
          onClose={() => setPickerOpen(false)}
          onPick={(card) => {
            setAttachment(card)
            setPickerOpen(false)
          }}
        />
      ) : null}
    </form>
  )
}

/**
 * The photo waiting to go out, with the one control that takes it back off.
 *
 * It sits ABOVE the buttons rather than inside the row, so a long filename cannot
 * push Send off the line. Disabled with the rest of the composer: a thread whose
 * window has closed must not let a file be swapped in a box that cannot send.
 */
function AttachmentChip({
  card,
  onRemove,
  busy,
}: {
  card: AssetCard
  onRemove: () => void
  busy: boolean
}) {
  // The library's own `displayName` is not imported here on purpose. It is a RUNTIME
  // value from `lib/assets/view`, which pulls three more `@sahoda/shared` helpers into
  // this route's base chunk and would partly undo the dynamic boundary above. The chip
  // needs one fallback, and one fallback is not worth a module.
  const name = card.title ?? card.alt ?? 'Unnamed file'
  return (
    <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-s2 py-1 pr-1 pl-1">
      {(card.thumbUrl ?? card.previewUrl) ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived url next/image cannot optimise */
        <img
          src={card.thumbUrl ?? card.previewUrl ?? ''}
          alt=""
          className="size-7 rounded-full object-cover"
        />
      ) : (
        // The preview could not be signed. The FILE is real and still sends, so the
        // chip stays and says the picture is the thing it cannot show.
        <span className="grid size-7 place-items-center rounded-full bg-surface type-meta text-muted">
          <Paperclip size={12} strokeWidth={2} aria-hidden />
        </span>
      )}
      <span className="truncate type-meta text-ink">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${name} from this reply`}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-micro hover:bg-surface hover:text-ink active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45"
      >
        <X size={13} strokeWidth={2} aria-hidden />
      </button>
    </div>
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
