'use client'

import { Link2, Undo2 } from 'lucide-react'

import type { VariantState } from '@/components/posts/use-variants'

export interface RelinkControlProps {
  label: string
  state: VariantState
  /** The post's body right now — what relinking would bring across. */
  canonicalBody: string
  onRelink: () => void
  onUndo: () => void
}

/**
 * FOLLOW THE POST AGAIN — the half of FSD §3.1 that was never built.
 *
 * ── WHAT WAS MISSING ─────────────────────────────────────────────────────────
 * "Variants editable independently; relink re-syncs from canonical." The first
 * half shipped; the second never did. `following` went false the moment anyone
 * typed into a channel and nothing in the app could set it back — so a writer who
 * adapted Instagram, then rewrote the post, had no way to bring Instagram along
 * except by selecting the post's text and pasting it over their own.
 *
 * ── WHY IT IS AN UNDO AND NOT A CONFIRM ──────────────────────────────────────
 * A confirmation dialog asks a question the writer cannot answer well: they can
 * see the two bodies far better AFTER the swap than in a sentence describing it.
 * So the swap happens, the replaced words are kept, and the way back is one
 * click that is still there when they scroll back.
 *
 * It is safe to do that because relinking WRITES NOTHING. The mirrored body lands
 * in the box marked unsaved — the same rule "Use the saved version" follows — so
 * `post_variants` still holds this channel's own copy until the writer saves.
 *
 * ── AND WHY IT IS HIDDEN WHEN IT WOULD DO NOTHING ────────────────────────────
 * A channel that already follows the post has nothing to relink, and a channel
 * whose copy is already identical to the post would swap a string for itself.
 * Progressive disclosure: nothing appears until it is relevant.
 */
export function RelinkControl({
  label,
  state,
  canonicalBody,
  onRelink,
  onUndo,
}: RelinkControlProps) {
  if (state.relinkedFrom !== null) {
    // Same fix as not-built-yet.tsx: --s1 is --canvas, so this block was the
    // page's own colour on light and had no edge to say otherwise.
    return (
      <div className="surface-ring flex flex-wrap items-center gap-2 rounded-sm bg-s2 px-3 py-2 text-[12.5px] text-muted">
        <span>
          {label} follows your post again. Its own copy is kept until you save. Nothing was written.
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="surface-ring-firm inline-flex h-7 shrink-0 items-center gap-icon-gap rounded-sm bg-surface px-btn-tight text-[12px] leading-none font-[550] text-ink transition-micro hover:bg-s2 max-narrow:min-h-[44px]"
        >
          <Undo2 size={13} aria-hidden />
          Put my {label} copy back
        </button>
      </div>
    )
  }

  // Nothing to do: this channel is already the post, or already following it.
  if (state.following || state.body === canonicalBody) return null

  return (
    <button
      type="button"
      data-relink={label}
      onClick={onRelink}
      className="inline-flex items-center gap-icon-gap rounded-sm px-1 text-[12.5px] font-[550] text-muted transition-micro hover:text-ink max-narrow:min-h-[44px]"
    >
      <Link2 size={13} aria-hidden />
      Follow the post again
    </button>
  )
}
