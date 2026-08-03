'use client'

import { useEffect, useState } from 'react'

/**
 * The card code the URL is pointing at, e.g. `#task-SL-040` → `SL-040`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The hero card names blocked cards and links to them, and "To reach Done" does
 * the same. Those links target `id="task-<code>"` on a board tile — which, once
 * the page collapsed by default (SL-062 §4), is behind TWO collapses: the board
 * region is shut, and inside it the card's stage is shut too. The anchor exists
 * in no DOM, so the browser scrolls nowhere and the link silently does nothing.
 *
 * A dead link is a control that does nothing, which this console refuses
 * elsewhere in exactly these words. So the collapses listen to the hash instead:
 * a `#task-` target forces the board region open and expands the one stage
 * holding that card, without disturbing what the admin had chosen to leave open.
 *
 * Deliberately NOT part of `useCollapse`: this is a temporary override driven by
 * the URL, and writing it into the stored preference would mean following one
 * blocked-card link silently re-opened the board for that admin forever.
 */
export function useHashTarget(): string | null {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    function read() {
      // `location.hash` includes the '#'. Anything that is not a task anchor —
      // `#board`, an empty hash — reads as no target rather than as a code.
      const match = /^#task-(.+)$/.exec(window.location.hash)
      setCode(match ? decodeURIComponent(match[1]!) : null)
    }

    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  return code
}
