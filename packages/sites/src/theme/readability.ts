// The Readability Guard. Ported from apps/web/src/lib/brand/brand-theme.ts:34-49,
// which this lane may not import. Design System §2: a workspace theme replaces
// --p/--pfg, and that pair must NEVER read below WCAG AA 4.5:1 — a generated site
// ships to a customer's own domain, where an unreadable button is our bug on their
// brand. The property test in ./readability.test.ts is the enforcement.

import { contrastRatio, oklchToRgb, type Oklch, type Rgb } from './oklch'

/** --pfg is not a colour: it is one of two literal CSS values. */
export type ForegroundToken = 'white' | 'var(--ink)'

export interface GuardedPair {
  primary: Oklch
  fg: ForegroundToken
  /** Real contrast of `primary` against `fg`. Always >= MIN_CONTRAST. */
  ratio: number
}

const WHITE_RGB: Rgb = { r: 0xff, g: 0xff, b: 0xff }
// docs/08 §2 --ink:#131313 -> rgb(19,19,19). Decimal, not a hex literal, and kept
// module-private: the locked contract exports exactly three symbols from this file.
const INK_RGB: Rgb = { r: 0x13, g: 0x13, b: 0x13 }

const MIN_CONTRAST = 4.5
const DARKEN_STEP = 0.03
const MAX_DARKEN_ITERATIONS = 32

/**
 * Darken `primary` in fixed steps until either white or --ink text clears 4.5:1
 * against it, then return whichever foreground passes with the higher contrast.
 */
export const guardPrimaryForeground = (primary: Oklch): GuardedPair => {
  let lightness = primary.l

  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const candidate: Oklch = { l: lightness, c: primary.c, h: primary.h }
    const rgb = oklchToRgb(candidate)
    const againstWhite = contrastRatio(rgb, WHITE_RGB)
    const againstInk = contrastRatio(rgb, INK_RGB)

    if (againstWhite >= MIN_CONTRAST || againstInk >= MIN_CONTRAST) {
      const useInk = againstInk >= againstWhite
      return {
        primary: candidate,
        fg: useInk ? 'var(--ink)' : 'white',
        ratio: useInk ? againstInk : againstWhite,
      }
    }

    lightness = Math.max(0, lightness - DARKEN_STEP)
  }

  // Only reachable when a component is non-finite, which makes every comparison
  // above false forever. Chroma is dropped as well as lightness so the result is
  // provably pure black at 21:1 — a NaN chroma must not survive into the output.
  const fallback: Oklch = { l: 0, c: 0, h: Number.isFinite(primary.h) ? primary.h : 0 }
  return {
    primary: fallback,
    fg: 'white',
    ratio: contrastRatio(oklchToRgb(fallback), WHITE_RGB),
  }
}
