'use client'

import dynamic from 'next/dynamic'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { RowContext } from '@/lib/approvals/queue-context'

// The comment thread opens under a queue row on demand, so its whole subtree
// (the add/remove actions, the textarea) loads only when a reviewer expands a
// preview rather than in /(app)/approvals' base chunk, which keeps the route
// inside its js-budget.
const PostComments = dynamic(
  () => import('@/components/posts/comments/post-comments').then((m) => m.PostComments),
  { ssr: false },
)

export interface QueuePreviewProps {
  postId: string
  context: RowContext
  currentUserId: string | null
  zone: string
}

const UNREADABLE = 'Sahoda could not read this just now.'

/**
 * EVERYTHING A REVIEWER NEEDS TO DECIDE, WITHOUT OPENING THE EDITOR.
 *
 * The full body, every channel's version read-only, the reason it last came
 * back, and the tail of the comment thread. Read-only on purpose: a reviewer
 * who wants to CHANGE the words presses Edit, and a preview that quietly
 * accepted edits would be a second editor with none of the first one's guards.
 */
export function QueuePreview({ postId, context, currentUserId, zone }: QueuePreviewProps) {
  return (
    <div className="space-y-4 border-t border-line-soft bg-s2 px-3 py-3" data-queue-preview>
      <section>
        <p className="type-eyebrow mb-1 text-muted">The post</p>
        {context.body === null || context.body.trim() === '' ? (
          <p className="type-sm text-muted">Nothing written yet.</p>
        ) : (
          <p className="type-sm whitespace-pre-wrap text-ink">{context.body}</p>
        )}
      </section>

      <section>
        <p className="type-eyebrow mb-1 text-muted">Each channel&rsquo;s version</p>
        {context.versions === undefined ? (
          <p className="type-sm text-muted">{UNREADABLE}</p>
        ) : context.versions.length === 0 ? (
          <p className="type-sm text-muted">
            No channel has its own version yet. Each channel gets the post as written.
          </p>
        ) : (
          <ul className="space-y-2">
            {context.versions.map((version) => (
              <li
                key={version.channel}
                className="surface-ring rounded-sm bg-surface px-3 py-2"
                data-queue-version={version.channel}
              >
                <p className="type-meta font-[550] text-ink">{CHANNEL_LABELS[version.channel]}</p>
                <p className="type-sm whitespace-pre-wrap text-ink">{version.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {context.returnedReason !== null ? (
        <section data-queue-returned-reason>
          <p className="type-eyebrow mb-1 text-muted">Last sent back because</p>
          <p className="type-sm text-ink">{context.returnedReason}</p>
        </section>
      ) : null}

      {context.comments === undefined ? (
        <p className="type-sm text-muted">Sahoda could not read the comments just now.</p>
      ) : (
        <PostComments
          postId={postId}
          initial={context.comments}
          currentUserId={currentUserId}
          zone={zone}
          note={
            context.comments.length >= 3
              ? 'The last three. The post page holds the whole thread.'
              : undefined
          }
        />
      )}
    </div>
  )
}
