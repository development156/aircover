'use client'

import { useCallback, useEffect, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

/**
 * Collapse and expand the rail. Founder's ruling: it OPENS COLLAPSED.
 *
 * ── WHERE IT SITS, AND WHY THAT IS NOT A DETAIL ──────────────────────────────
 * MEASURED off the reference: a small circular control on the rail's OUTER
 * EDGE, vertically centred, straddling the boundary between the panel and the
 * page. That placement is what makes it read as a control on the rail rather
 * than one more row inside it — a toggle in the nav list would be a
 * twenty-second item in a list this whole pass exists to shorten.
 *
 * It is mounted on the rail's OUTER wrapper, not inside the `<aside>`: the
 * panel is `overflow-hidden` so it can clip the brand lockup and the scroll
 * fade, and a control half-outside it would be sliced down the middle.
 *
 * ── THE STATE IS ON <html>, NOT IN REACT ─────────────────────────────────────
 * The rail is a SERVER component and so is everything in it. Lifting the
 * collapse into React state would make the rail a client component and ship the
 * nav map, the approval count and the ops-admin check to the browser. The
 * attribute costs one `setAttribute` and CSS does the rest, which is also why
 * there is no flash: `rail-script.tsx` has already written it before first
 * paint.
 *
 * ── AND WHY IT IS A BUTTON WITH aria-expanded ────────────────────────────────
 * The thing it expands is the navigation's LABELS, not its destinations —
 * everything stays reachable in both states, because the labels go `sr-only`
 * and never `display:none`. `aria-controls` therefore points at the nav region
 * the labels live in, and the accessible name states the ACTION ("Expand the
 * menu") rather than the state, which is what `aria-expanded` is for.
 */

const KEY = 'sahoda-rail'

function isExpanded(): boolean {
  return document.documentElement.getAttribute('data-rail') === 'expanded'
}

export function RailToggle() {
  /**
   * Starts `false` on the server AND on the first client render, because that
   * is the default and a mismatch here is a hydration error rather than a
   * cosmetic one. The effect below reconciles it with what the inline script
   * actually wrote, one frame later — the VISUAL state was already correct
   * throughout, since it is driven by the attribute and not by this.
   */
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(isExpanded())
  }, [])

  const toggle = useCallback(() => {
    const next = !isExpanded()
    const root = document.documentElement
    if (next) root.setAttribute('data-rail', 'expanded')
    else root.removeAttribute('data-rail')
    setExpanded(next)
    try {
      // Only the non-default is stored, so clearing site data returns the
      // reader to the founder's default rather than to whatever they last had.
      if (next) localStorage.setItem(KEY, 'expanded')
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode, blocked storage — the toggle still works for this page */
    }
  }, [])

  const Icon = expanded ? PanelLeftClose : PanelLeftOpen

  return (
    <button
      type="button"
      onClick={toggle}
      data-guide="nav.rail-toggle"
      data-testid="rail-toggle"
      aria-expanded={expanded}
      aria-controls="rail-nav"
      aria-label={expanded ? 'Collapse the menu' : 'Expand the menu'}
      className={[
        // Straddles the rail's right edge, vertically centred. `z-1` so it sits
        // over the page's content edge rather than under it.
        'absolute top-1/2 right-0 z-1 grid size-[26px] -translate-y-1/2 translate-x-1/2 place-items-center',
        // A pill, like every other control (docs/37 §5). Solid, not glass: it
        // overlaps two different grounds at once and a translucent control
        // would take a different colour on each half.
        'rounded-full bg-surface-3 text-ink-mute shadow-[0_0_0_1px_var(--canvas)]',
        'transition-micro hover:bg-surface-2 hover:text-ink',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        /* ── HIDDEN BELOW 1180, AND THAT IS THE POINT ──────────────────────
           Between 700 and 1179 the rail is collapsed BY THE MEDIA QUERY, and
           a media query cannot be overridden by an attribute. Rendering the
           control there would give the reader a button that flips
           `aria-expanded`, writes localStorage, and changes not one pixel —
           docs/37 §17's "a control says what happens when it is used", failed
           in the quietest possible way. Below 700 the rail is gone entirely.

           `hidden` and not `sr-only` deliberately, and it is the opposite call
           from the nav labels: a label whose DESTINATION still exists must keep
           its accessible name, but this control genuinely does not apply at
           this width, so announcing it would be announcing a dead end. */
        'max-wide:hidden',
      ].join(' ')}
    >
      <Icon size={14} strokeWidth={1.9} aria-hidden />
    </button>
  )
}
