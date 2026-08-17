import { Badge } from '@/components/ui/badge'

/**
 * The inline coming-soon treatment, for a control that will exist and does not
 * exist yet.
 *
 * ── WHY THIS IS A COMPONENT AND NOT A DISABLED BUTTON ────────────────────────
 * A greyed-out button and a roadmap item look identical and mean opposite
 * things: one is broken right now, the other is honest about the future. The
 * founder's ruling is that a user must be able to tell which within a second,
 * so this states it in words AND wears the Certainty System's `.is-proposed`
 * signature — dashed, transparent, muted — which already means "visibly
 * provisional" everywhere else in the app.
 *
 * It is the page-sized ComingSoon screen's vocabulary at tile scale: the same
 * `calm` rung chip reading "Coming soon", the same dashed border. `hideGlyph`
 * is passed for the same reason that screen passes it — rung 4's glyph is a
 * CHECK, which would read as "done".
 *
 * ── WHY IT RENDERS A <div> AND NEVER A <button> ──────────────────────────────
 * There is nothing to press. A `<button disabled>` is still announced as a
 * button to a screen reader, so it still promises an action; this announces as
 * what it is. `aria-disabled` is not used either, for the same reason: it
 * describes a control that exists and is unavailable, not a control that has
 * not been built.
 *
 * ── THE RULE ABOUT NUMBERS ───────────────────────────────────────────────────
 * `note` is for a sentence about SAHODA ("Posts go out on a schedule"), never a
 * figure about the customer. A container labelled coming soon is a promise we
 * control; a number inside it is a claim about the user's business that no
 * query in this codebase can support. Callers pass no counts, no percentages,
 * no ranges. See the five named exceptions in the run-11 brief.
 */
export function ComingSoonTile({
  icon,
  title,
  note,
  layout = 'stack',
  className = '',
}: {
  icon?: React.ReactNode
  title: string
  /** One line about the feature. NEVER a number about the user. */
  note?: string
  /**
   * `stack` is the default: icon over title over badge, for a tile standing on
   * its own or beside other stacked tiles.
   *
   * `row` is for a tile sharing a grid with SELECTABLE tiles, which are built
   * `flex items-center` — mark left, label and status in the middle, state
   * marker right. In the channel step the two shapes sat side by side in one
   * 4-column grid at 64px and 110px, so nine tiles for one kind of thing read as
   * two unrelated components. Being unbuilt is a reason to look PROVISIONAL,
   * which `.is-proposed` already says; it is not a reason to be a different
   * shape. The 64px floor matches the selectable tile's two-line height.
   */
  layout?: 'stack' | 'row'
  className?: string
}) {
  if (layout === 'row') {
    return (
      <div
        data-coming-soon
        className={`is-proposed flex min-h-16 items-center gap-2 rounded-card px-3 py-3 ${className}`}
      >
        {icon ? (
          <span aria-hidden className="grid size-7 shrink-0 place-items-center text-muted">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-muted">{title}</span>
          {note ? <span className="block text-[11.5px] text-muted">{note}</span> : null}
        </span>
        <Badge rung="calm" hideGlyph>
          Coming soon
        </Badge>
      </div>
    )
  }

  return (
    <div
      data-coming-soon
      className={`is-proposed flex flex-col items-start gap-2 rounded-card px-3 py-3 ${className}`}
    >
      {icon ? (
        <span aria-hidden className="grid size-7 place-items-center text-muted">
          {icon}
        </span>
      ) : null}
      <span className="text-[13px] font-semibold text-muted">{title}</span>
      {note ? <span className="text-[11.5px] text-muted">{note}</span> : null}
      <Badge rung="calm" hideGlyph>
        Coming soon
      </Badge>
    </div>
  )
}
