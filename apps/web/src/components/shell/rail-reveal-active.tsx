'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Bring the current page's nav row into view inside the rail.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * MEASURED at 1440x900: the rail's nav holds more rows than its box, and the
 * groups near the bottom — AUTOMATE and everything under it — sit below the
 * fold. On `/loop` and `/playbooks` that means the app highlights the current
 * route on a row nobody can see, so the navigation says nothing at all about
 * where you are. The rail already scrolls and already fades its bottom edge;
 * what it never did was OPEN on the row that matters.
 *
 * Two smaller things fall out of the same fix. A group heading sliced in half by
 * the clip reads as broken layout rather than as "more below" — and once the
 * active row is revealed, the clip lands somewhere the reader has a reason to
 * be. And the scroll container gained real bottom padding, so the fade falls on
 * space instead of through the middle of a word.
 *
 * ── WHY scrollTop AND NOT scrollIntoView ─────────────────────────────────────
 * `scrollIntoView` walks every scrollable ancestor, including the document, so
 * on a short viewport it scrolls the PAGE as well as the rail — the shell
 * jumping on every navigation to fix a sidebar is a worse bug than the one being
 * fixed. Setting the container's own `scrollTop` cannot reach anything else.
 *
 * It is also deliberately a no-op when the row is already visible: a rail that
 * re-centres itself on every click is a rail that moves under the pointer.
 */
export function RailRevealActive() {
  const pathname = usePathname()

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]')
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active) return
    if (nav.scrollHeight <= nav.clientHeight + 1) return

    const rowTop = active.offsetTop - nav.offsetTop
    const rowBottom = rowTop + active.offsetHeight
    // The bottom 20px are under the fade mask, so a row that ends inside it is
    // not really visible even though its geometry says it is.
    const FADE = 20
    const viewTop = nav.scrollTop
    const viewBottom = viewTop + nav.clientHeight - FADE

    if (rowTop >= viewTop && rowBottom <= viewBottom) return

    // Land the row a third of the way down rather than at the very edge, so the
    // rows around it stay legible as context.
    const target = rowTop - nav.clientHeight / 3
    nav.scrollTop = Math.max(0, Math.min(target, nav.scrollHeight - nav.clientHeight))
  }, [pathname])

  return null
}
