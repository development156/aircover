'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * A settled number, revealed by counting to it (docs/26 §8.1).
 *
 * ── WHAT THIS MAY NEVER BE USED FOR ──────────────────────────────────────────
 * The credit balance, the wallet hero, the rail foot, the credit chip — any
 * AUTHORITATIVE LIVE quantity. §8's original rule stands there unchanged: that
 * is the number you act on, it moves under you as actions spend, and mid-flight
 * this component displays a figure that is not your balance. Guarded by
 * `count-up.guard.test.ts`, which fails if this file is imported by one of them.
 *
 * It is for a SETTLED HISTORICAL figure arriving for the first time — reach for
 * a closed period, credits spent last month. Finished, and it will not move
 * again while you look at it.
 *
 * ── IT CANNOT INVENT ─────────────────────────────────────────────────────────
 * `value` is `number`, not `number | null`. There is deliberately no way to
 * mount this without a figure the server returned, because a count-up toward a
 * number we do not have is the one thing this product may never render. An
 * absent reading is `Unmeasured` / `Unreadable` (docs/26 §4), never this.
 *
 * ── WHY useLayoutEffect, AND WHY IT STARTS AT THE FINAL VALUE ─────────────────
 * State initialises to `value`, so the server and the first client render agree
 * — no hydration mismatch, and with JS disabled the real number is simply there.
 * The reset to 0 happens in a LAYOUT effect, which runs before the browser
 * paints, so the final value is never briefly visible before the count starts.
 * Doing this in a normal effect produces a visible flash of the answer.
 *
 * ── REDUCED MOTION IS CHECKED HERE, IN JS ────────────────────────────────────
 * `tokens.css` kills CSS animation under `prefers-reduced-motion`, but a
 * requestAnimationFrame loop is not a CSS animation and that rule does not
 * reach it. So this reads the media query itself and, when set, never starts —
 * the state is already the final value, so the number is simply correct on
 * first paint.
 */

/** Decelerating. A count that lands hard reads as a stutter. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** The duration lives in tokens.css (`--dur-count`); this reads it rather than restating it. */
function countDurationMs(el: Element): number {
  const raw = getComputedStyle(el).getPropertyValue('--dur-count').trim()
  const ms = raw.endsWith('ms') ? Number.parseFloat(raw) : Number.parseFloat(raw) * 1000
  return Number.isFinite(ms) && ms > 0 ? ms : 560
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function CountUp({
  value,
  className,
  format,
}: {
  /** A real figure the server returned. Never nullable — see the header. */
  value: number
  className?: string
  /** How the landed number is written. Defaults to Indian grouping. */
  format?: (n: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // Initialised to the ANSWER, so SSR and hydration agree and a no-JS reader
  // still gets the real number.
  const [shown, setShown] = useState(value)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // GUARDED, and the guard is not defensive padding. jsdom does not implement
    // `matchMedia` at all, so the unguarded call threw and took down every test
    // that rendered a tree containing this component — `/home`'s page test
    // started failing the moment PerformanceStrip adopted it. Anywhere the
    // query cannot be asked, the honest default is NOT to animate: the state is
    // already the final value, so the number is simply correct.
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Nothing to count toward, and counting to zero from zero is a no-op that
    // would still cost a frame.
    if (value === 0) return

    const duration = countDurationMs(el)
    let raf = 0
    let start: number | null = null

    setShown(0)

    const step = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / duration)
      // The LAST frame assigns `value` itself, not a rounded interpolation, so
      // what the user ends up reading is exactly what the server returned.
      setShown(t >= 1 ? value : Math.round(value * easeOutCubic(t)))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  const write = format ?? ((n: number) => n.toLocaleString('en-IN'))
  return (
    // `.num` is not decoration here: without tabular figures the digits change
    // width on every frame and the number visibly jitters as it counts.
    /* `data-countup` exists so a guard can tell a rolled figure from a printed
       one. A test that matched on the rendered text could not: the component
       lands on the answer, so a rolled 448 and a printed 448 read identically
       once it has finished. */
    <span ref={ref} data-countup className={cn('num', className)}>
      {write(shown)}
    </span>
  )
}
