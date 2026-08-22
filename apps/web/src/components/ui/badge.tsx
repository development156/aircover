import * as React from 'react'
import { Check, CircleAlert, CircleDot, Clock } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The four-rung status ladder (SPECIFICATION.md §3, RETHEME.md §5).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The palette has no green/red pair. `--ok` is black and `--danger` and `--warn`
 * are BOTH the brand orange, so a chip that carried its meaning in hue now
 * carries no meaning at all. Status is therefore encoded three ways at once:
 *
 *     FILL WEIGHT  solid ▸ ring-on-wash ▸ hairline outline
 *     GLYPH        one per rung, never repeated
 *     LABEL        the word, always present, never abbreviated
 *
 * Any ONE of those is enough to tell two rungs apart, which is what makes this
 * survive greyscale, a photocopier and colour blindness.
 *
 * ── LOUDEST IS URGENT, NOT BAD ───────────────────────────────────────────────
 * The ladder ranks how much a thing NEEDS YOU, not how good it is. "Failed" and
 * "Needs approval" are both rung 1 — both need you now. "Published" and
 * "Expired" are both rung 4 — neither needs anything, however different they
 * are as outcomes.
 *
 * This is a DIFFERENT AXIS from the Certainty System in tokens.css, which ranks
 * how REAL a thing is. A published post is maximally real (`.is-real`) and
 * minimally urgent (rung 4). Do not collapse the two: mapping `.is-real` onto
 * rung 1 would stamp a `!` on every successful publish.
 *
 * ── NEVER ADD A FIFTH RUNG ───────────────────────────────────────────────────
 * If something does not fit, it belongs on an existing rung and the label does
 * the work. A fifth rung means the ladder has stopped being readable at a
 * glance, which was the only thing it was for.
 */

export type Rung = 'urgent' | 'active' | 'pending' | 'calm'

/**
 * Glyphs, one per rung.
 *
 * SPECIFICATION.md §3 gives rung 1 and rung 3 the SAME `!` glyph; RETHEME.md §5
 * gives four distinct ones. Following RETHEME, because the whole promise of the
 * ladder is that any single channel distinguishes the rungs — and with a shared
 * glyph, rungs 1 and 3 fall back to fill weight alone. Distinct glyphs satisfy
 * both documents; a shared glyph satisfies only one.
 */
const RUNG_GLYPH: Record<Rung, React.ComponentType<{ className?: string }>> = {
  urgent: CircleAlert,
  // NOT lucide's `Dot`: it draws a 2px point inside a 24 viewBox, so at 11px it
  // renders as a speck and rung 2 effectively loses its glyph. Caught in the
  // greyscale check. `CircleDot` fills the box at the same size.
  active: CircleDot,
  pending: Clock,
  calm: Check,
}

/**
 * Fill weights. The ORDER is the message — each step down is visually quieter.
 *
 * Rung 2 is solid ink rather than solid orange so that it reads as strong but
 * not as alarming; on dark it inverts to solid white, because solid black on a
 * near-black surface is not a fill, it is a hole.
 */
const RUNG_FILL: Record<Rung, string> = {
  // INK on the brand fill, never white. `--pfg` is `#000000` and measures
  // 7.15:1; white on `#ff6600` is **2.94:1**, which docs/26 §1.1 names as the
  // figure that misses every threshold there is, and §1.2 rules on directly.
  // The token was fixed; this call site kept its literal, so the loudest badge
  // in the product — the one that says "Weak signal — inputs conflict" on the
  // reveal, the screen where an owner decides whether to approve a brain — was
  // the least readable thing on it, while the Approve button 1500px below wore
  // the correct pair. Two orange fills on one screen disagreeing with each
  // other.
  //
  // `--pfg` is NOT redefined in dark (orange is the one fixed point, §1.1), so
  // this pair holds in both themes without a `dark:` variant.
  urgent: 'bg-brand text-primary-foreground',
  active: 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]',
  // 1.5px ring, not 1px. In COLOUR the orange ring separates this from `calm`
  // instantly; in GREYSCALE it does not — orange-40 over white flattens to
  // ~#d4d4d4 and --line is #dcdcdc, near-identical greys. The greyscale check
  // caught exactly that. Ring WEIGHT is a structural difference that survives
  // the conversion, which is the whole contract of the ladder, so the two
  // outline rungs are now separated by weight AND wash AND glyph — not by hue
  // plus a glyph.
  pending: 'bg-brand-wash text-accent shadow-[inset_0_0_0_1.5px_var(--brand-lift)]',
  calm: 'bg-transparent text-muted shadow-[inset_0_0_0_1px_var(--line)]',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  rung: Rung
  /** The word. Required — a rung without a label is a colour, which is the
   *  thing this component exists to stop. */
  children: React.ReactNode
  /** Hide the glyph only where the row already carries one. Rare. */
  hideGlyph?: boolean
}

export function Badge({ rung, children, hideGlyph, className, ...props }: BadgeProps) {
  const Glyph = RUNG_GLYPH[rung]

  return (
    <span
      data-rung={rung}
      className={cn(
        // 20px tall, 7px inset, 11px/600 — the kit's `.sl-badge`.
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-[7px] text-[11px] leading-none font-semibold whitespace-nowrap',
        RUNG_FILL[rung],
        className,
      )}
      {...props}
    >
      {/* Decorative: the label beside it already says this in words, so a
          screen reader hearing both would hear the status twice. */}
      {hideGlyph ? null : <Glyph className="size-[11px] shrink-0" aria-hidden />}
      {children}
    </span>
  )
}
