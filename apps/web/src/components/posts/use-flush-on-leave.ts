'use client'

import { useEffect, useRef } from 'react'

/**
 * Write what is pending when the customer LEAVES, by every route out that exists.
 *
 * ── WHY TEARDOWN IS THE WRONG HOOK, MEASURED ─────────────────────────────────
 * `/posts/[id]` lost everything typed inside its 2s debounce to a browser Back,
 * and two attempts to fix it in the effect cleanup changed nothing. Run 23
 * INFERRED the segment was not unmounting; this is the measurement that settles
 * it. A `console.log` in the cleanup, driven in a real browser:
 *
 *     CONSOLE BEFORE TYPING -> ["[autosave] mounted"]
 *     CONSOLE AFTER BACK    -> ["[autosave] mounted"]
 *     POSTS AFTER BACK      -> ["POST /v1/environment"]     (Clerk, nothing of ours)
 *     URL AFTER BACK        -> /posts
 *     FIELD                 -> ""
 *
 * The mount line proves the probe can see the hook, so the missing CLEANUP line
 * means what it says: React never tore the component down. Next kept the segment
 * in its router cache and swapped the view. No cleanup, no `pagehide`, no
 * `beforeunload` — the page never went anywhere.
 *
 * ── SO THE HOOK IS THE NAVIGATION ITSELF ─────────────────────────────────────
 * `popstate` is what a Back press actually fires, and it fires on the window
 * whether or not React unmounts anything. The other two cover the ways a phone
 * takes a tab away, which are not navigations at all:
 *
 *   popstate          Back and Forward, including the swipe gesture
 *   visibilitychange  backgrounding the tab, switching apps, locking the screen
 *   pagehide          a real unload — closing the tab, a hard reload
 *
 * All three, because each one alone leaves a hole a customer walks through. The
 * flush is idempotent (`runSave` compares against the last confirmed snapshot and
 * returns early when nothing changed), so overlapping triggers cost one no-op,
 * never a duplicate write.
 *
 * `visibilitychange` is checked for `hidden` specifically: it also fires on the
 * way BACK to a tab, and flushing then would write on every app switch.
 */
export function useFlushOnLeave(flush: () => void): void {
  // Read through a ref so the listeners are attached ONCE and still call the
  // current flush. Re-attaching on every render would be a listener churn on a
  // hook that re-renders on every keystroke.
  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    const run = () => flushRef.current()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') run()
    }

    window.addEventListener('popstate', run)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', run)
    return () => {
      window.removeEventListener('popstate', run)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', run)
    }
  }, [])
}
