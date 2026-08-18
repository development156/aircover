'use client'

import { Button } from '@/components/ui/button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { SaveConflict } from '@/lib/posts/state'

/**
 * Someone else saved this channel's copy while you were writing it.
 *
 * ── THE TRAP THIS IS SHAPED AROUND ───────────────────────────────────────────
 * A conflict notice is the second way to lose work, and it is the easier one to
 * ship: "This post changed. Reload?" with an OK button is a paragraph destroyed
 * by a reflex. So nothing here discards anything.
 *
 *  1. The local text STAYS in the box. Nothing is replaced until it is asked for.
 *  2. Both versions are named in words a shop owner uses — "yours" and "the saved
 *     version", never "local" and "remote".
 *  3. Two verbs, and neither is final. "Keep mine" re-sends with the fresh
 *     version. "Use theirs" loads the other text INTO THE BOX, not into the row,
 *     so it can still be edited or undone before anything is written.
 *  4. No "dismiss". Dismissing leaves a variant that cannot save and a writer
 *     typing into a box whose contents can no longer land.
 *  5. The CHANNEL is named. A conflict is per-variant; "your Instagram version"
 *     is actionable and "this post" is not.
 *
 * The same five rules `use-autosave`'s divergence notice already follows for the
 * canonical body, so the editor and the create flow cannot describe one event two
 * ways.
 *
 * ── WHY THIS RENDERS BEFORE ANYTHING PRODUCES IT ─────────────────────────────
 * Detecting the clash needs a version column and a compare-and-set on
 * `post_variants` — a migration, which applies to production and is not this
 * run's to write. Shipping the notice first is what keeps the migration from
 * landing on a UI that can only show a generic save error. See
 * docs/23_Concurrent_Edit_Plan.md.
 */
export interface VariantConflictNoticeProps {
  conflict: SaveConflict
  /** Re-send the local text with the fresh version. */
  onKeepMine: () => void
  /** Load the stored text into the editor — not into the row. */
  onUseTheirs: (theirs: string) => void
}

export function VariantConflictNotice({
  conflict,
  onKeepMine,
  onUseTheirs,
}: VariantConflictNoticeProps) {
  const label = CHANNEL_LABELS[conflict.channel]

  return (
    <div
      role="alert"
      className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
    >
      <p className="font-semibold">Someone else saved the {label} version</p>
      <p className="mt-1">
        Your text is still here and nothing of yours has been lost. Choose which one to keep.
      </p>

      {/* Theirs is SHOWN, not summarised. "The saved version is different" is not
          something anyone can act on; the words are. */}
      <div className="surface-ring mt-2 rounded-input bg-surface px-3 py-2 text-[12.5px] text-ink">
        <p className="type-eyebrow text-muted">The saved version</p>
        <p className="mt-1 whitespace-pre-wrap">{conflict.theirs}</p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onKeepMine}>
          Keep mine
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onUseTheirs(conflict.theirs)}>
          Use the saved version
        </Button>
      </div>
    </div>
  )
}
