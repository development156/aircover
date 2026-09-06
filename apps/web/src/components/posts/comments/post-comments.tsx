'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { MessageSquare } from 'lucide-react'

import { addComment, removeComment } from '@/app/actions/post-comments'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { COMMENT_MAX, whoIs, type CommentRow } from '@/lib/approvals/context'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

export interface PostCommentsProps {
  postId: string
  /** The rows the server rendered. The thread starts from these. */
  initial: readonly CommentRow[]
  currentUserId: string | null
  /** The workspace zone, so a comment's time reads in the same clock as the post's. */
  zone: string
  /** A line under the list, for a surface that shows only part of the thread. */
  note?: string
  className?: string
}

const TEMP = 'temp-'

/**
 * THE THREAD BESIDE A POST.
 *
 * ── OPTIMISTIC, AND HONEST ABOUT IT ──────────────────────────────────────────
 * A comment appears the moment it is sent and is REPLACED by the server's row
 * when that comes back, or REMOVED (with the words handed back to the box) when
 * the server refuses. Removal works the same way in reverse. Nothing on screen
 * ever claims a write the server did not confirm for longer than the round trip.
 *
 * ── A REMOVED COMMENT KEEPS ITS PLACE ────────────────────────────────────────
 * The row stays in the table with `deleted_at` set, and the thread keeps its
 * shape: "Comment removed" where the words were, so a reply below it still
 * makes sense. The words themselves are not rendered.
 */
export function PostComments({
  postId,
  initial,
  currentUserId,
  zone,
  note,
  className,
}: PostCommentsProps) {
  const id = useId()
  const [comments, setComments] = useState<readonly CommentRow[]>(initial)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const body = draft.trim()
    if (body.length === 0 || body.length > COMMENT_MAX || busy) return
    const temp: CommentRow = {
      id: `${TEMP}${Date.now()}`,
      post_id: postId,
      author: currentUserId ?? '',
      body,
      created_at: new Date().toISOString(),
      deleted_at: null,
    }
    setComments((current) => [...current, temp])
    setDraft('')
    setError(null)
    setBusy(true)
    const result = await addComment(postId, body)
    setBusy(false)
    if (result.ok) {
      setComments((current) => current.map((row) => (row.id === temp.id ? result.comment : row)))
    } else {
      // Rolled back, and the words go back where they were typed.
      setComments((current) => current.filter((row) => row.id !== temp.id))
      setDraft(body)
      setError(result.message)
    }
  }

  async function remove(commentId: string) {
    const before = comments
    setError(null)
    setComments((current) =>
      current.map((row) =>
        row.id === commentId ? { ...row, deleted_at: new Date().toISOString() } : row,
      ),
    )
    const result = await removeComment(commentId)
    if (!result.ok) {
      setComments(before)
      setError(result.message)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void send()
    }
  }

  const length = draft.trim().length
  const overLimit = length > COMMENT_MAX

  return (
    <section aria-labelledby={`${id}-heading`} className={className} data-post-comments>
      <h3 id={`${id}-heading`} className="type-eyebrow mb-2 flex items-center gap-1.5 text-muted">
        <MessageSquare size={13} strokeWidth={2} aria-hidden />
        Comments
      </h3>

      {comments.length === 0 ? (
        <p className="type-sm text-muted">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((row) => {
            const who = whoIs(row.author, currentUserId)
            const mine = currentUserId !== null && row.author === currentUserId
            const removed = row.deleted_at !== null
            return (
              <li key={row.id} className="surface-ring rounded-sm bg-surface px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="type-sm font-[550] text-ink">
                    {who === 'you' ? 'You' : 'A teammate'}
                  </span>
                  <span className="type-meta tabular-nums text-muted">
                    {formatScheduledAt(row.created_at, zone)}
                  </span>
                  {mine && !removed && !row.id.startsWith(TEMP) ? (
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="type-meta ml-auto text-muted underline underline-offset-2 hover:text-ink"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {removed ? (
                  <p className="type-sm italic text-muted">Comment removed</p>
                ) : (
                  <p className="type-sm whitespace-pre-wrap text-ink">{row.body}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {note !== undefined ? <p className="type-meta mt-2 text-muted">{note}</p> : null}

      <form
        className="mt-3 space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <Label htmlFor={`${id}-box`}>Add a comment</Label>
        <Textarea
          id={`${id}-box`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={COMMENT_MAX}
          rows={2}
          error={overLimit || error !== null}
          aria-describedby={`${id}-count`}
          placeholder="Say what should change, or what works."
        />
        <div className="flex flex-wrap items-center gap-2">
          <span id={`${id}-count`} className="type-meta tabular-nums text-muted">
            {length} / {COMMENT_MAX}
          </span>
          {error !== null ? (
            <span role="alert" className="type-meta text-danger">
              {error}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <span className="type-meta text-muted">Ctrl+Enter or Cmd+Enter sends</span>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={busy || length === 0 || overLimit}
            >
              Add comment
            </Button>
          </span>
        </div>
      </form>
    </section>
  )
}
