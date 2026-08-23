import { cn } from '@/lib/utils'

/**
 * WHICH WAY A NUMBER MOVED — as a shape and a word, never as a colour.
 *
 * ── THE RULE THIS EXISTS TO KEEP ─────────────────────────────────────────────
 * The reference codes green-up and red-down, and four of the five dashboards
 * the founder chose do the same. This product may not: docs/37 §9 separates
 * measured from inferred BY FILL WEIGHT precisely so the whole visual language
 * survives greyscale, re-theming and colour blindness, and introducing a
 * hue-coded up/down beside it would put a second, weaker vocabulary on the same
 * screen — one that a customer's Brand Skin could recolour into nonsense.
 *
 * So a direction is a TRIANGLE and a WORD. Nixtio does exactly this — a small
 * ▲ above each figure — and it is the one thing in those four shots that works
 * in greyscale. The colour of this component is `--ink-mute` in both directions.
 *
 * ── AND THERE IS NO `neutral` VARIANT ────────────────────────────────────────
 * "It did not move" is a real reading and it is a SENTENCE, not a glyph: a flat
 * dash beside a number reads as an absence mark (docs/37 §9 again — the app
 * already spends `is-unmeasured` on a 14x2 rule) and would collide with it.
 * A caller with no change to report renders nothing here.
 *
 * ── IT NEVER COMPUTES ANYTHING ───────────────────────────────────────────────
 * It takes a direction and a label that the caller has already derived from two
 * readings it actually holds. There is no `previous` prop and no arithmetic,
 * because a component that can subtract is a component that can be handed one
 * number and asked to imply a second.
 */
export function Direction({
  dir,
  children,
  className,
}: {
  dir: 'up' | 'down'
  /** The whole claim in words — "up 12 from last week". Never bare. */
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 type-meta text-muted', className)}>
      {/* An SVG triangle rather than ▲/▼, which render at wildly different
          sizes across fonts and are missing from some Android system faces —
          the reader this product is built for. */}
      <svg
        aria-hidden
        viewBox="0 0 8 7"
        className={cn('size-[7px] flex-none fill-current', dir === 'down' && 'rotate-180')}
      >
        <path d="M4 0 8 7H0Z" />
      </svg>
      {children}
    </span>
  )
}
