'use client'

import { useRef, useState } from 'react'
import { Send, Undo2 } from 'lucide-react'
import type { PostStatus } from '@sahoda/shared'

import { returnToDraft, sendForReview } from '@/app/actions/posts-review'
import { Button } from '@/components/ui/button'
import { panelState } from '@/lib/approvals/context'

import { SendBackForm } from './send-back-form'

export interface ReviewState {
  intent: PostStatus
  approvedBy: string | null
  approvedAt: string | null
  currentUserId: string | null
  /** Called with the status the RPC landed in, so the composer can follow. */
  onIntentChange: (intent: PostStatus) => void
}

export interface ReviewControlsProps extends ReviewState {
  postId: string | null
  scheduledAt: string | null
  zone: string
  /** Write the post first, creating the row if needed. False when that failed. */
  flush: () => Promise<boolean>
  /** The row id after `flush`, read at call time (a new post has none until then). */
  readPostId: () => string | null
}

const SENT = 'Sent for review. It now waits on an owner, editor or approver.'
const RETURNED = 'Sent back to draft with your note.'
const NO_ROW = 'Write a line first. Sahoda saves the post, then it can be sent for review.'

/** Statuses the finish panel names as a state and offers to send back. */
const HELD: ReadonlySet<PostStatus> = new Set<PostStatus>(['review', 'approved', 'scheduled'])
const SUBMITTABLE: ReadonlySet<PostStatus> = new Set<PostStatus>(['idea', 'draft'])

/**
 * THE REVIEW HALF OF THE FINISH PANEL.
 *
 * A draft can be SENT FOR REVIEW; a post in review, approved or booked NAMES
 * that state and can be SENT BACK with a note. Both are one RPC each, both
 * leave a `post_approvals` row, and the sentence after each is the outcome the
 * RPC reported, never a guess.
 *
 * ── EDITING AN APPROVED POST KEEPS THE APPROVAL ──────────────────────────────
 * Founder's ruling, 2026-09-06. The composer stays editable on an approved or
 * scheduled post and the approval is not withdrawn by an edit; the one-line
 * notice says exactly that, so a reviewer who cares can send it back instead.
 */
export function ReviewControls({
  postId,
  intent,
  approvedBy,
  approvedAt,
  scheduledAt,
  currentUserId,
  zone,
  flush,
  readPostId,
  onIntentChange,
}: ReviewControlsProps) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [returning, setReturning] = useState(false)
  const sendBackButton = useRef<HTMLButtonElement>(null)

  async function submit() {
    setBusy(true)
    setOutcome(null)
    const saved = await flush()
    const id = saved ? readPostId() : null
    if (id === null) {
      setBusy(false)
      setOutcome({ tone: 'error', text: NO_ROW })
      return
    }
    const result = await sendForReview(id)
    setBusy(false)
    if (result.ok) {
      onIntentChange(result.status)
      setOutcome({ tone: 'ok', text: SENT })
    } else {
      setOutcome({ tone: 'error', text: result.message })
    }
  }

  async function sendBack(reason: string): Promise<string | null> {
    if (postId === null) return NO_ROW
    const result = await returnToDraft(postId, reason)
    if (!result.ok) return result.message
    setReturning(false)
    onIntentChange(result.status)
    setOutcome({ tone: 'ok', text: RETURNED })
    return null
  }

  function closeForm() {
    setReturning(false)
    // The button is back in the tree on the next paint.
    requestAnimationFrame(() => sendBackButton.current?.focus())
  }

  const state = panelState({ intent, approvedBy, approvedAt, scheduledAt }, currentUserId, zone)

  return (
    <div className="space-y-2" data-review-controls data-review-intent={intent}>
      {HELD.has(intent) && state !== null ? (
        <div className="surface-ring space-y-2 rounded-sm bg-s2 p-3">
          <p className="type-eyebrow text-muted">Where this stands</p>
          <p className="type-h3 text-ink" data-review-state>
            {state}
          </p>
          {intent === 'approved' || intent === 'scheduled' ? (
            <p className="type-meta text-muted">Changes go out as they are. Approval stays.</p>
          ) : null}
          {returning ? (
            <SendBackForm subject="this post" onSubmit={sendBack} onCancel={closeForm} />
          ) : (
            <Button
              ref={sendBackButton}
              size="sm"
              variant="secondary"
              onClick={() => setReturning(true)}
            >
              <Undo2 size={13} strokeWidth={2} aria-hidden />
              Send back to draft
            </Button>
          )}
        </div>
      ) : null}

      {SUBMITTABLE.has(intent) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-meta text-muted">
            Or ask a teammate to look first. An owner, editor or approver decides.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void submit()}
            loading={busy}
            disabled={busy}
          >
            <Send size={13} strokeWidth={2} aria-hidden />
            Send for review
          </Button>
        </div>
      ) : null}

      {outcome !== null ? (
        <p
          role={outcome.tone === 'error' ? 'alert' : 'status'}
          className={outcome.tone === 'error' ? 'type-meta text-danger' : 'type-meta text-ok'}
        >
          {outcome.text}
        </p>
      ) : null}
    </div>
  )
}
