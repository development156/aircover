'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useId, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Pencil, Undo2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { RowContext } from '@/lib/approvals/queue-context'
import type { DisplayPost } from '@/lib/posts/display-post'
import { cn } from '@/lib/utils'

import { QueuePreview } from './queue-preview'
import { SendBackForm } from './send-back-form'

export interface ReviewRowProps {
  post: DisplayPost
  context: RowContext
  zone: string
  currentUserId: string | null
  /** Whether the reader may decide at all. False renders the row read-only. */
  decides: boolean
  selected: boolean
  onToggle: () => void
  /** Approve this one row. Resolves when the row has left the queue or the call failed. */
  onApprove: () => Promise<void>
  /** Send this one row back. Resolves with the failure sentence, or null. */
  onSendBack: (reason: string) => Promise<string | null>
}

/** Send back walks a post out of review, approval or a booking. A dated draft is none of those. */
const RETURNABLE = new Set(['review', 'approved', 'scheduled'])

const READINESS_WORD = { live: 'Connected', off: 'Not connected', unknown: 'Not checked' } as const

/**
 * ONE POST WAITING ON A DECISION, WITH THE CONTEXT TO MAKE IT (F-23).
 *
 * ── SELF-APPROVAL TAKES A SECOND CLICK (F-44) ────────────────────────────────
 * The author of a post may approve it when their role allows, and the queue
 * says so beside the control rather than hiding the fact. The first press arms
 * "Approve my own post"; only the second one approves. Not a dialog: the row
 * already holds everything the reader needs, and a modal over it would hide
 * the very post they are being asked to vouch for.
 *
 * ── THE TITLE IS TEXT, AND "EDIT" IS THE LINK ────────────────────────────────
 * The row used to be a link. Now that it carries the whole decision, a click
 * anywhere on it must not navigate away from the decision; the editor is one
 * explicit control among the others.
 */
export function ReviewRow({
  post,
  context,
  zone,
  currentUserId,
  decides,
  selected,
  onToggle,
  onApprove,
  onSendBack,
}: ReviewRowProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [returning, setReturning] = useState(false)
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const sendBackButton = useRef<HTMLButtonElement>(null)

  const title = post.title?.trim() || 'Untitled post'
  const own = currentUserId !== null && post.created_by === currentUserId

  async function approve() {
    if (own && !armed) {
      setArmed(true)
      return
    }
    setBusy(true)
    await onApprove()
    setBusy(false)
    setArmed(false)
  }

  function closeForm() {
    setReturning(false)
    requestAnimationFrame(() => sendBackButton.current?.focus())
  }

  return (
    <li
      className={cn('border-b border-line-soft last:border-b-0', selected && 'bg-brand-wash')}
      data-review-row={post.id}
    >
      <div className="flex flex-wrap items-start gap-3 px-3 py-3">
        {decides ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
            aria-label={`Select ${title}`}
          />
        ) : null}

        {context.thumbnail !== undefined && context.thumbnail !== null ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL
          <img
            src={context.thumbnail}
            alt=""
            className="size-12 shrink-0 rounded-sm object-cover"
            data-queue-thumbnail
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-[550] text-ink">{title}</span>
            <Badge rung="urgent">{post.intent === 'review' ? 'In review' : 'Needs approval'}</Badge>
          </div>
          <p className="type-sm text-muted">
            {context.when !== null ? (
              <span className="tabular-nums" data-queue-when>
                {context.when}
              </span>
            ) : (
              <span>No time yet</span>
            )}
            <span aria-hidden> · </span>
            <span data-queue-authorship>{context.authorship}</span>
            {context.review === undefined ? (
              <>
                <span aria-hidden> · </span>
                <span>History not read</span>
              </>
            ) : context.review !== null ? (
              <>
                <span aria-hidden> · </span>
                <span data-queue-review>{context.review}</span>
              </>
            ) : null}
          </p>
          {context.excerpt !== null ? (
            <p className="type-sm text-ink" data-queue-excerpt>
              {context.excerpt}
            </p>
          ) : null}
          {context.readiness.length > 0 ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Channels">
              {context.readiness.map((item) => (
                <li
                  key={item.channel}
                  className={cn(
                    'type-meta',
                    item.state === 'live'
                      ? 'text-ok'
                      : item.state === 'off'
                        ? 'text-warn'
                        : 'text-muted',
                  )}
                  data-queue-channel={item.channel}
                  data-queue-readiness={item.state}
                >
                  {item.label}: {READINESS_WORD[item.state]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={`${id}-preview`}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
            Preview
          </Button>
          <Link
            href={`/posts/${post.id}` as Route}
            className="type-sm inline-flex items-center gap-1 font-[550] text-accent underline underline-offset-2"
          >
            <Pencil size={13} aria-hidden />
            Edit
          </Link>
          {decides ? (
            <>
              {RETURNABLE.has(post.intent) ? (
                <Button
                  ref={sendBackButton}
                  size="sm"
                  variant="secondary"
                  onClick={() => setReturning(true)}
                  disabled={busy}
                >
                  <Undo2 size={13} strokeWidth={2} aria-hidden />
                  Send back
                </Button>
              ) : null}
              <span className="flex items-center gap-2">
                {own ? (
                  <span className="type-meta text-muted" data-queue-own>
                    You wrote this
                  </span>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void approve()}
                  loading={busy}
                  disabled={busy}
                  aria-describedby={own ? `${id}-own` : undefined}
                >
                  <Check size={13} strokeWidth={2} aria-hidden />
                  {armed ? 'Approve my own post' : 'Approve'}
                </Button>
              </span>
              {own ? (
                <span id={`${id}-own`} className="sr-only">
                  You wrote this post. Approving it takes a second press.
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {returning ? (
        <div className="px-3 pb-3">
          <SendBackForm subject="this post" onSubmit={onSendBack} onCancel={closeForm} />
        </div>
      ) : null}

      {open ? (
        <div id={`${id}-preview`}>
          <QueuePreview
            postId={post.id}
            context={context}
            currentUserId={currentUserId}
            zone={zone}
          />
        </div>
      ) : null}
    </li>
  )
}
