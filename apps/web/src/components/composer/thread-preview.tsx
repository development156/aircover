'use client'

import type { ThreadPreview } from '@/lib/posts/thread-preview'

export interface ThreadPreviewViewProps {
  preview: ThreadPreview
}

/**
 * THE POSTS THIS WILL ACTUALLY BECOME.
 *
 * ── WHY A PREVIEW IS THE FEATURE, NOT A GARNISH ─────────────────────────────
 * A thread is the one place where what the writer typed and what the audience
 * reads are different shapes. One box of prose becomes seven posts, and where the
 * breaks fall changes how it reads — a sentence orphaned onto its own post lands
 * very differently from one that closes a paragraph. Publishing without showing
 * that is asking someone to approve something they have not seen.
 *
 * ── AND IT IS THE SAME ARITHMETIC THE PUBLISHER WILL DO ─────────────────────
 * `previewThread` plans from `publishedTextOf(formatForPlatform(...))`, the exact
 * string and function `runPublishPost` uses. So this is not an illustration of
 * roughly what will happen; it is the plan.
 *
 * ── READ AS TEXT, NOT AS BOXES ──────────────────────────────────────────────
 * Each post is a numbered region with its own count, and the numbers are
 * `tabular-nums` so seven rows of counts line up. The count is announced with a
 * real word rather than a slash — a screen reader given "3 280" reads two numbers
 * and no relationship between them, which is the defect the character meter
 * already had to fix.
 */
export function ThreadPreviewView({ preview }: ThreadPreviewViewProps) {
  if (preview.refusal !== null) return null
  if (preview.segments.length === 0) return null

  const count = preview.segments.length

  return (
    <section aria-labelledby="thread-preview-heading" data-thread-preview className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id="thread-preview-heading" className="text-[12px] text-muted">
          {count === 1 ? 'Goes out as one post' : 'Goes out as a thread'}
        </h4>
        <span className="text-[12.5px] font-semibold text-muted">
          <span className="tabular-nums" data-thread-count>
            {count}
          </span>{' '}
          {count === 1 ? 'post' : 'posts'}
        </span>
      </div>

      <ol className="space-y-1.5">
        {preview.segments.map((segment) => (
          <li
            key={segment.index}
            data-thread-segment={segment.index}
            className="surface-ring rounded-sm bg-s1 p-2.5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11.5px] font-semibold text-muted">
                {/* The relationship, in words, for anything that is not looking at
                    the layout. "3 of 7" is the whole sentence. */}
                <span className="tabular-nums">{segment.index}</span>
                <span className="sr-only"> of </span>
                <span aria-hidden> / </span>
                <span className="tabular-nums">{count}</span>
              </span>
              <span className="text-[11.5px] text-muted">
                <span className="tabular-nums">{segment.chars}</span>
                <span className="sr-only"> of </span>
                <span aria-hidden> / </span>
                <span className="tabular-nums">{preview.limit}</span>
                <span className="sr-only"> characters</span>
              </span>
            </div>
            {/* `whitespace-pre-wrap` because a paragraph break the writer chose is
                where this post was cut, and flattening it would show a break that
                does not exist on X. `break-words` because a long token has nowhere
                else to go and must not widen the card. */}
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-ink">
              {segment.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
