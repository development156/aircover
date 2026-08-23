'use client'

import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'
import type { DivergenceState } from '@/components/posts/use-autosave'

export interface DivergenceNoticeProps {
  divergence: DivergenceState | null
  onLoadTheirs: () => void
  onKeepMine: () => void
  /** The last save failure, if the post could not be written at all. */
  error: string | null
  onRetry: () => void
}

/**
 * The two things that can go wrong with the POST itself: someone else moved it,
 * or it could not be written.
 *
 * ── WHY THE DIVERGENCE NOTICE NEVER NAMES A CULPRIT ─────────────────────────
 * `posts` has no version column, so every `updated_at` this client sees is a
 * post-write one and it is IMPOSSIBLE to say who overwrote whom. What is knowable
 * is that the row moved to a timestamp this session did not produce. Both buttons
 * are real choices: one loads the other version, the other writes this draft over
 * it. Neither is styled as the safe one, because neither is.
 *
 * ── WHY THE RETRY MATTERS MORE THAN IT LOOKS ────────────────────────────────
 * A writer who has stopped typing has no other way back. The debounced save only
 * re-fires on the next edit, so without this the last words written before a
 * dropped connection would need a fake keystroke to reach the server.
 */
export function DivergenceNotice({
  divergence,
  onLoadTheirs,
  onKeepMine,
  error,
  onRetry,
}: DivergenceNoticeProps) {
  if (divergence === null && error === null) return null

  return (
    <div className="space-y-2">
      {divergence !== null ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-card border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
        >
          <span className="grow">
            {divergence.message} Both versions are still here. Choose which one to keep.
          </span>
          <Button variant="secondary" size="sm" onClick={onLoadTheirs}>
            Load that version
          </Button>
          <Button variant="ghost" size="sm" onClick={onKeepMine}>
            Keep mine and save
          </Button>
        </div>
      ) : null}

      {error !== null ? (
        <InlineError className="flex flex-wrap items-center gap-3">
          <span className="grow">
            {error} Your text is still here. Retry now, or keep editing and Sahoda retries on the
            next change.
          </span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry save
          </Button>
        </InlineError>
      ) : null}
    </div>
  )
}
