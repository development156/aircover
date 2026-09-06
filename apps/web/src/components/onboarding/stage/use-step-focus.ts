'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Q-03 — FOCUS DROPPED TO `<body>` ON EVERY STEP CHANGE.
 *
 * MEASURED (docs/51_Full_App_Audit_2026-09-05.md, Q-03): after Continue,
 * `document.activeElement` was `<body>`. Nothing told a keyboard or
 * screen-reader user which screen they now stood on — the URL never changes,
 * so there was no other signal at all.
 *
 * Moves focus to the new step's own heading whenever `step` changes. The
 * container this is given is `#pane` — `onboarding-stage.tsx` keys the
 * `<section>` inside it by `${step}-${dir}`, so exactly ONE step's markup is
 * ever mounted there at a time, and querying the first `h2` inside it finds
 * that step's own title rather than a stray one. (`ProcessingOverlay`'s own
 * `h2` renders as a SIBLING of `#pane`, not inside it, so it is never in
 * scope here.) Intro has no `h2` at all — it is an `h1`, deliberately not
 * matched, so the very first paint is left where the browser puts it rather
 * than being yanked before anyone has pressed anything.
 *
 * A heading is not focusable by default, so `tabindex="-1"` is set here,
 * programmatically, on the one element that should ever carry it — giving the
 * whole pane a tabindex would move focus onto a wrapper a screen reader
 * announces as silence.
 *
 * ── WHAT THIS TRADES AWAY ─────────────────────────────────────────────────
 * `what-step.tsx` focuses its own "Other" input on mount when a resumed
 * session already holds a typed category. React fires child effects before
 * parent effects, so this hook's focus move — being the parent's — runs
 * AFTER that one in the same commit and wins. A session resuming directly
 * onto step 02 with a custom category loses that autofocus to the heading.
 * Narrow (it only fires on a resumed session, and only into that one step),
 * and accepted rather than fixed here: the alternative is skipping the
 * heading move for one step out of eight, which would be one more asymmetry
 * for the next reader to explain.
 */
export function useStepFocus(step: string, containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const heading = containerRef.current?.querySelector<HTMLElement>('h2')
    if (!heading) return
    heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
    // `step` only: `containerRef` is a ref object whose IDENTITY never
    // changes, so it is intentionally left out rather than re-running this on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
}
