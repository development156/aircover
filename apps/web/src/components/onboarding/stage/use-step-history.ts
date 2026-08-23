'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * MAKE THE BROWSER'S BACK BUTTON MEAN "THE PREVIOUS STEP".
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `/onboarding` is nine screens behind one URL. It pushed no history entry when
 * it moved between them, so Back from step 4 left the flow entirely and landed
 * the customer wherever they came from — on the screens every customer meets
 * first, in a product whose reader has never used a marketing tool.
 *
 * The typed words already survive it: the store writes to `localStorage` on
 * every move, and a returning visit resumes at the step they left. That fix was
 * necessary and it is not this one. Surviving a wrong exit is not the same as
 * not being thrown out, and a person who presses Back expecting the previous
 * question does not know their answers are safe — they know the flow vanished.
 *
 * ── WHY IT PUSHES STATE AND NOT A URL ────────────────────────────────────────
 * The obvious version writes `#step-3` or `?step=3`. Both make the URL change,
 * which hands Next's App Router a navigation to reason about on a route that is
 * one page with nine internal states, and a hash the customer can paste is a
 * link that restores a position without the answers that belong to it.
 *
 * `pushState` with the url argument OMITTED keeps the address bar exactly as it
 * is and still creates an entry. Back then fires `popstate` on the same
 * document, which is precisely the event we want and nothing the router needs
 * to act on.
 *
 * ── AND WHY IT SPREADS THE EXISTING STATE ────────────────────────────────────
 * `history.state` is NOT ours. Next stores its own router keys in it, and
 * replacing the object wholesale leaves the router unable to recognise its own
 * entry on the way back — which degrades a soft navigation into a full reload,
 * silently, and only when someone presses Back. Spreading preserves whatever is
 * already there and adds one key beside it.
 *
 * ── THE FLAG, AND WHY A REF ──────────────────────────────────────────────────
 * A step change has two possible causes and they need opposite treatment:
 * pressing Continue must PUSH an entry, and arriving via Back must not — or
 * every Back would push a new entry and the button would never escape. The flag
 * has to hold within a single tick, before React re-renders, so it is a ref.
 */
export interface StepHistoryOptions<T extends string> {
  /** The step being shown right now. */
  step: T
  /** Restore a step the browser popped back to. Must not itself push. */
  onPop: (step: T) => void
  /** Is this one of ours? Guards against another writer's state object. */
  isStep: (value: unknown) => value is T
  /**
   * Steps that must NOT get an entry.
   *
   * The result screen is the case: the brain behind it was built and paid for
   * in this session, and an entry pointing at it would let Back return to a
   * screen whose work has already been consumed. The store refuses to resume
   * there for the same reason.
   */
  skip?: readonly T[]
}

const KEY = 'sahodaOnboardingStep'

export function useStepHistory<T extends string>({
  step,
  onPop,
  isStep,
  skip = [],
}: StepHistoryOptions<T>): void {
  const lastPushed = useRef<T | null>(null)
  const poppingTo = useRef<T | null>(null)
  // Held in a ref so the popstate listener is registered once and still calls
  // the current callbacks — a listener re-bound on every render would drop
  // events between removal and re-add.
  const handlers = useRef({ onPop, isStep })
  handlers.current = { onPop, isStep }

  const shouldSkip = useCallback((id: T) => skip.includes(id), [skip])

  useEffect(() => {
    function handle(event: PopStateEvent) {
      const raw = (event.state as Record<string, unknown> | null)?.[KEY]
      const { onPop: pop, isStep: check } = handlers.current
      if (!check(raw)) return
      // Marked BEFORE the state update, so the effect below sees it in the same
      // commit and declines to push the entry we are arriving from.
      poppingTo.current = raw
      lastPushed.current = raw
      pop(raw)
    }
    window.addEventListener('popstate', handle)
    return () => window.removeEventListener('popstate', handle)
  }, [])

  useEffect(() => {
    if (poppingTo.current === step) {
      poppingTo.current = null
      return
    }
    if (lastPushed.current === step) return

    const base = (window.history.state as Record<string, unknown> | null) ?? {}

    if (lastPushed.current === null) {
      // The FIRST step this hook sees gets a replace, never a push. A push here
      // would put an entry in front of wherever the customer came from, so the
      // first Back would return to the intro they had already left rather than
      // to the page before onboarding.
      window.history.replaceState({ ...base, [KEY]: step }, '')
      lastPushed.current = step
      return
    }

    if (shouldSkip(step)) return

    window.history.pushState({ ...base, [KEY]: step }, '')
    lastPushed.current = step
  }, [step, shouldSkip])
}
