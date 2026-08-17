import { Badge } from '@/components/ui/badge'

/**
 * The vocabulary for a screen that is DESIGNED but not BUILT.
 *
 * ── WHY EVERY CONTROL HERE IS A <div> ────────────────────────────────────────
 * A `<button disabled>` is still announced as a button, so it still promises an
 * action that does not exist. These are not disabled controls; they are pictures
 * of controls. Rendering them as buttons would make a screen reader offer the
 * user five things to press on a page where nothing can be pressed.
 *
 * They also carry no `aria-disabled`, for the same reason: that attribute
 * describes a control that exists and is currently unavailable, which is a
 * different and untrue claim.
 *
 * ── WHY THE LAYOUT IS BUILT AT ALL ───────────────────────────────────────────
 * The founder's ruling: the roadmap should be VISIBLE. A placeholder tells you
 * nothing about what is coming; the real layout, marked clearly, tells you
 * exactly what the screen will be. The one thing it must never do is show a
 * NUMBER — a container is a promise about Sahoda, a figure inside it is a claim
 * about the reader's business.
 */

/** A control-shaped thing that cannot be pressed. */
export function InertButton({
  children,
  primary = false,
  className = '',
}: {
  children: React.ReactNode
  primary?: boolean
  className?: string
}) {
  return (
    <div
      data-inert-control
      className={[
        // `.is-proposed` — the Certainty System's DASHED signature, the same one
        // a suggested-not-approved post wears. Without it these read as live
        // buttons: a solid primary "Create campaign" is indistinguishable from a
        // real one until you press it and nothing happens, which is precisely
        // the broken-button impression the coming-soon treatment exists to
        // avoid. The banner says it once; this says it on every control.
        'is-proposed inline-flex items-center gap-1.5 rounded-input px-3 py-[7px] text-[13px] font-[550] select-none',
        primary ? 'text-accent' : 'text-muted',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/**
 * A filter chip with NO count.
 *
 * The reference renders "All 4 · Active 2 · Draft 1 · Completed 1". Those are
 * counts of a table this product does not have, so the chip keeps its label and
 * drops its number entirely — not a zero, which would claim the collection
 * exists and is empty.
 */
export function InertChip({ children, on = false }: { children: React.ReactNode; on?: boolean }) {
  return (
    <div
      data-inert-control
      className={[
        'is-proposed inline-flex items-center rounded-pill px-3 py-[5px] text-[12.5px] font-[550] select-none',
        on ? 'text-ink' : 'text-muted',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

/** A field-shaped thing with nothing behind it. */
export function InertField({ label }: { label: string }) {
  return (
    <div
      data-inert-control
      className="is-proposed flex min-h-[34px] items-center rounded-input px-3 text-[13px] text-muted select-none"
    >
      {label}
    </div>
  )
}

/**
 * The one banner that names the whole surface.
 *
 * Sits at the top so the claim is made ONCE, before anything below it can be
 * mistaken for live. Every card under it is a picture; this is the caption.
 */
export function RoadmapBanner({ what }: { what: string }) {
  return (
    <div className="is-proposed flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card p-4">
      <Badge rung="calm" hideGlyph>
        Coming soon
      </Badge>
      <p className="text-[12.5px] text-muted">
        {what} This is the screen as it will be. Nothing on it is connected yet, and no numbers are
        shown because there is nothing to measure.
      </p>
    </div>
  )
}
