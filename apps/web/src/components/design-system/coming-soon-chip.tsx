/**
 * A coming-soon marker. A DIV, never a `<button disabled>`.
 *
 * ── WHY THIS IS NOT A BUTTON ─────────────────────────────────────────────────
 * A disabled button is still announced as a button. A screen reader offers it
 * as an action, the user tries to take it, and nothing happens — which is worse
 * than not offering it, because the failure looks like the app is broken rather
 * than like the feature is unbuilt. Coming-soon is not a disabled action; it is
 * a statement about the roadmap, and statements are text.
 *
 * It wears `.is-proposed` — the Certainty System's dashed edge — so it reads as
 * provisional without depending on the one brand colour to say so.
 */
export function ComingSoon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="type-sm text-muted">{children}</span>
      <span
        data-testid="coming-soon-chip"
        className="is-proposed rounded-sm px-[7px] py-[3px] text-[11px] font-semibold"
      >
        Coming soon
      </span>
    </span>
  )
}
