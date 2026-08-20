'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { approvePosts } from '@/app/actions/approvals'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { bulkApproveMessage } from '@/lib/approvals/state'
import { STATUS_WORD } from '@/lib/posts/status-word'
import type { DisplayPost } from '@/lib/posts/display-post'
import { cn } from '@/lib/utils'

/**
 * THE REVIEW QUEUE — select, then approve the selection.
 *
 * ── WHY THE ROW IS A LINK AND THE CHECKBOX IS NOT PART OF IT ─────────────────
 * Home's `NeedsAttention` deliberately has no inline Approve, and its reasoning
 * holds: approving from a summary, where you cannot see the body, is the wrong
 * place for the decision. This screen is not a summary — it exists to be the
 * place that decision is made — but the same instinct applies to the ROW. The
 * title is a link into the editor, and approving is a separate, explicit act on
 * a selection. A single click that both navigates and approves is how somebody
 * approves the wrong post.
 *
 * ── THE BULK BAR APPEARS WITH A SELECTION AND NOT BEFORE ─────────────────────
 * A permanently visible "Approve" over an empty selection is a control that
 * does nothing, which is the disabled-button problem in another costume. With
 * nothing ticked there is no bulk action, so there is no bar.
 *
 * ── AND THE OUTCOME IS REPORTED IN THREE PARTS ───────────────────────────────
 * `approvePosts` returns approved / moved / failed and the toast says all three.
 * "4 approved · 1 had already moved on" is the honest sentence for a stale list;
 * "Approved" over that would be a fabricated success. See `approvals/state.ts`.
 */
export function ReviewQueue({ posts }: { posts: readonly DisplayPost[] }) {
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

  function runBulk() {
    const ids = [...selected]
    startTransition(async () => {
      const result = await approvePosts(ids)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      // The three counts decide the tone, not the absence of an error. A run
      // that approved nothing is not a success message.
      const message = bulkApproveMessage(result)
      if (result.approved > 0 && result.moved === 0 && result.failed === 0) toast.success(message)
      else if (result.approved > 0) toast.warning(message)
      else toast.error(message)
      setSelected(new Set())
    })
  }

  return (
    <section aria-labelledby="approvals-queue" className="surface-ring rounded-card bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-2.5">
        <label className="flex min-h-[34px] items-center gap-2 text-[13px] font-semibold max-narrow:min-h-[44px]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="size-4 accent-[var(--brand)]"
            aria-label={allSelected ? 'Clear the selection' : 'Select every post below'}
          />
          <span id="approvals-queue">Waiting for you</span>
        </label>
        <span className="type-sm text-muted">
          {/* A count of the rows ON THIS PAGE, which is a count of what was
              selected from the database — not a stored figure. */}
          <span className="num">{posts.length}</span>
          {posts.length === 1 ? ' post' : ' posts'}
        </span>
      </header>

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
          <li
            key={post.id}
            className={cn(
              'flex flex-wrap items-center gap-3 border-b border-line-soft px-3 py-3 last:border-b-0',
              selected.has(post.id) && 'bg-brand-wash',
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(post.id)}
              onChange={() => toggle(post.id)}
              className="size-4 shrink-0 accent-[var(--brand)]"
              aria-label={`Select ${post.title?.trim() || 'Untitled post'}`}
            />
            <Link
              href={`/posts/${post.id}` as Route}
              className="min-w-0 flex-1 rounded-sm text-[13px] font-[550] text-ink hover:text-accent"
            >
              <span className="block truncate">{post.title?.trim() || 'Untitled post'}</span>
              {post.channels.length > 0 ? (
                <span className="type-sm block truncate text-muted">
                  {post.channels.map((channel) => CHANNEL_SHORT[channel]).join(' · ')}
                </span>
              ) : null}
            </Link>
            <Badge rung="urgent">{STATUS_WORD[post.intent]}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
