import type { VariantState } from '@/components/posts/use-variants'

/**
 * What this channel's copy is, in one word the writer can scan down the stack.
 *
 * ── WHY "FOLLOWS YOUR POST" IS A STATE AND NOT A PLACEHOLDER ─────────────────
 * The publisher sends `post_variants.body` and has no fallback to `posts.body`,
 * so a channel that has never been written has nothing to publish. Rather than
 * show an empty box beside a full one, the composer mirrors the post into every
 * following channel and says so — and says, equally plainly, that the mirrored
 * text is not in the row yet.
 *
 * The four words are deliberately different lengths and shapes, so the stack can
 * be read down the left edge without reading each one.
 */
export function versionStateLabel(state: VariantState): string {
  if (state.saving) return 'Saving…'
  if (state.following) return state.dirty ? 'Follows your post · unsaved' : 'Follows your post'
  return state.dirty ? 'Unsaved' : 'Saved'
}

export interface VersionStateProps {
  state: VariantState
}

export function VersionState({ state }: VersionStateProps) {
  const label = versionStateLabel(state)
  return (
    <span
      aria-live="polite"
      className={state.dirty && !state.saving ? 'text-[12px] text-ink' : 'text-[12px] text-muted'}
    >
      {label}
    </span>
  )
}
