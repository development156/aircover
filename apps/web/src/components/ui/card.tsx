import * as React from 'react'

import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Interactive cards lift on hover (docs/08 §6). */
  interactive?: boolean
}

// shadcn/ui Card, restyled to the kit's `.sl-card`.
//
// A RESTING CARD HAS A VERY SLIGHT LIFT, IN THE LIGHT THEME ONLY.
//
// This paragraph said the opposite until 2026-09-03 — "a resting card has no
// shadow", reserving depth for layers that genuinely float. Founder's ruling
// reverses it for light: the boxes should read as slightly above the white
// page. `--sh-rest` is his value, `0 4px 18px rgba(0, 0, 0, 0.05)`, and it is
// ZERO in dark and in the inverse scope, so the old sentence is still exactly
// true everywhere except a white background.
//
// The hairline inset ring has not gone anywhere and is not decoration: it is
// what draws the edge, and in dark it is the only thing that does.
// `surface-ring-lift` emits both in ONE `box-shadow`, which is the whole
// reason it exists as a utility rather than two classes — see globals.css.
//
// Keeping BOTH a border and the ring is still the single most common way this
// port goes wrong (RETHEME.md §9: "Cards look heavy"), so there is still
// exactly one edge: the ring.
//
// Only `interactive` cards lift. Cards that are not clickable do not move,
// because a hover response is a promise that a click does something.
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        /* ── p-5, NOT p-4, AND THE PRIMITIVE WAS SIMPLY OFF THE SCALE ──────
           docs/37 §4's table is explicit: **20-24 is card padding (default)**
           and 16 is the COMPACT value. This shipped at 16 for every card in the
           app, so the default case was rendering the compact one.

           The founder's brief names the consequence rather than the cause —
           "cards that breathe: the reference's internal padding is generous and
           that is most of why it reads calm" — and MEASURED against the
           reference's own dashboard capture, its stat cards carry ~20px. This
           is bringing the primitive onto the documented scale, not a
           preference, which is why it changes here rather than being overridden
           per call site on the two screens this lane shot.

           It costs 8px of content width at every card. `no-truncated-labels`
           and `connections-widths` (seven widths) are the guards that would
           catch that going wrong, and both are in the gate. */
        'surface-ring-lift rounded-card bg-surface p-5',
        // The kit draws this hover ring with --text-3, whose equivalent here is
        // --ink-faint. Using --line-firm instead: ink-faint is ratcheted to a
        // shrinking allowlist (ink-faint-exceptions.ts — adding an entry fails
        // the gate), and a ring is a LINE, so a line token is the honest name
        // for it regardless. Same rendered weight, no debt added.
        /* The hover keeps `--sh-rest`, not `--sh-card`. It used to raise the
           card to `--sh-card`, which was an increase when rest was flat and is
           a DECREASE now that rest carries an 18px diffusion: hovering would
           have dropped the card while translating it up, which reads as a
           glitch rather than a lift. So hover firms the RING and keeps the
           same shadow, and the 1px translate stays the movement. */
        interactive &&
          'transition-panel hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_var(--line-firm),var(--sh-rest)]',
        className,
      )}
      {...props}
    />
  )
})

export function CardLabel({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        // `type-eyebrow` IS the v3 eyebrow: --t-eyebrow (600 11px/14px mono) plus
        // --t-eyebrow-ls tracking and uppercase. The previous hand-rolled copy
        // duplicated all four and sat at 10.5px, off the type scale entirely.
        'type-eyebrow mb-2 flex items-center gap-2 text-muted',
        className,
      )}
      {...props}
    />
  )
}
