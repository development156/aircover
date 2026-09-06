'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { approvePosts } from '@/app/actions/approvals'
import { returnToDraft } from '@/app/actions/posts-review'
import { Button } from '@/components/ui/button'
import { approveMessage, bulkApproveMessage } from '@/lib/approvals/state'
import type { QueueContext } from '@/lib/approvals/queue-context'
import type { DisplayPost } from '@/lib/posts/display-post'

import { ReviewRow } from './review-row'

export interface ReviewQueueProps {
  posts: readonly DisplayPost[]
  /** Per-row context, built on the server. A missing id renders the row bare. */
  context: QueueContext
  zone: string
  currentUserId: string | null
  /** Whether the reader may decide at all. Viewers see the queue read-only. */
  decides: boolean
}

const VIEWER_NOTE =
  'You can read what is waiting, but only an owner, editor or approver can approve or send back.'

/**
 * THE REVIEW QUEUE — every post waiting on a decision, with what the decision
 * needs beside it (F-23), a per-row Approve and Send back (F-06), and the bulk
 * bar over a selection.
 *
 * ── THE BULK BAR APPEARS WITH A SELECTION AND NOT BEFORE ─────────────────────
 * A permanently visible "Approve" over an empty selection is a control that
 * does nothing, which is the disabled-button problem in another costume. With
 * nothing ticked there is no bulk action, so there is no bar.
 *
 * ── AND THE OUTCOME IS REPORTED IN THREE PARTS ───────────────────────────────
 * `approvePosts` returns approved / scheduled / moved / failed and the toast
 * says all of them. "4 approved · 1 had already moved on" is the honest
 * sentence for a stale list; "Approved" over that would be a fabricated
 * success. See `approvals/state.ts`.
 */
export function ReviewQueue({ posts, context, zone, currentUserId, decides }: ReviewQueueProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pending, startTransition] = useTransition()

  const allSelected = posts.length > 0 && selected.size === posts.length

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.id)))
  }

  function report(result: Awaited<ReturnType<typeof approvePosts>>, single: boolean) {
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    const cleared = result.approved + result.scheduled
    // One row: the sentence names what happened to THAT post. Several: the counts.
    const message =
      single && cleared === 1 && result.moved === 0 && result.failed === 0
        ? approveMessage(result.scheduled === 1 ? 'scheduled' : 'approved')
        : bulkApproveMessage(result)
    if (cleared > 0 && result.moved === 0 && result.failed === 0) toast.success(message)
    else if (cleared > 0) toast.warning(message)
    else toast.error(message)
  }

  function runBulk() {
    const ids = [...selected]
    startTransition(async () => {
      report(await approvePosts(ids), false)
      setSelected(new Set())
    })
  }

  async function approveOne(id: string) {
    report(await approvePosts([id]), true)
    setSelected((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  async function sendBack(id: string, reason: string): Promise<string | null> {
    const result = await returnToDraft(id, reason)
    if (!result.ok) return result.message
    toast.success('Sent back to draft with your note.')
    return null
  }

  return (
    <section aria-labelledby="approvals-queue" className="surface-ring rounded-card bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-2.5">
        <label className="flex min-h-[34px] items-center gap-2 text-[13px] font-semibold max-narrow:min-h-[44px]">
          {decides ? (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="size-4 accent-[var(--brand)]"
              aria-label={allSelected ? 'Clear the selection' : 'Select every post below'}
            />
          ) : null}
          <span id="approvals-queue">Waiting for you</span>
        </label>
        <span className="type-sm text-muted">
          {/* A count of the rows ON THIS PAGE, which is a count of what was
              selected from the database — not a stored figure. */}
          <span className="num">{posts.length}</span>
          {posts.length === 1 ? ' post' : ' posts'}
        </span>
      </header>

      {!decides ? (
        <p className="type-sm border-b border-line-soft px-3 py-2 text-muted" data-queue-readonly>
          {VIEWER_NOTE}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-s2 px-3 py-2">
          <span className="type-sm text-muted">
            <span className="num">{selected.size}</span> selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={runBulk} loading={pending} disabled={pending}>
              <Check size={13} strokeWidth={2} aria-hidden />
              Approve {selected.size}
            </Button>
          </div>
        </div>
      ) : null}

      <ul>
        {posts.map((post) => (
          <ReviewRow
            key={post.id}
            post={post}
            context={context[post.id] ?? BARE}
            zone={zone}
            currentUserId={currentUserId}
            decides={decides}
            selected={selected.has(post.id)}
            onToggle={() => toggle(post.id)}
            onApprove={() => approveOne(post.id)}
            onSendBack={(reason) => sendBack(post.id, reason)}
          />
        ))}
      </ul>
    </section>
  )
}

/** A row whose context was not built: every read reports as not done. */
const BARE: QueueContext[string] = {
  when: null,
  excerpt: null,
  body: null,
  thumbnail: undefined,
  readiness: [],
  authorship: '',
  review: undefined,
  returnedReason: null,
  comments: undefined,
  versions: undefined,
}
