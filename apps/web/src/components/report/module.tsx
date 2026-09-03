import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ONE SECTION OF THE MONDAY BRIEFING.
 *
 * ── IT IS STILL A DOCUMENT, AND THE NUMBER IS WHY THAT SURVIVED ──────────────
 * The page's standing argument is that this is a DOCUMENT, not a dashboard: a
 * single column of prose at reading measure, because a grid of tiles asks the
 * reader to do the analysis and this page IS the analysis. The redesign brief
 * asks for numbered modules with tinted icons, which sounds like the grid that
 * argument refuses.
 *
 * It is not, and the ordinal is the reason. `01…05` is the READING ORDER of one
 * document — what happened, what it noticed, what it learned, what it will do,
 * what it cost — and each step depends on the one before it. Numbering a
 * sequence makes it read MORE like a briefing, not less. Numbering a grid of
 * independent tiles would be decoration; there is no grid here.
 *
 * ── THE NUMERAL IS DECORATION AND IS TREATED AS SUCH ─────────────────────────
 * `--ink-faint` is the one token this system marks "disabled + decorative only,
 * fails 4.5:1, never content text", and that is exactly right for a numeral
 * whose whole job is to say "this is the third thing". It is `aria-hidden`, and
 * nothing is only knowable from it: the heading beside it carries the meaning
 * and the document's order carries the sequence. A screen reader gets five
 * named sections in order and loses nothing.
 *
 * ── THE ICON SQUARES ARE NEUTRAL, AND ONE IS NOT ─────────────────────────────
 * The brief asks for "subtle lavender, cyan and soft blue" tints. Neither
 * lavender nor cyan exists in this theme, and the colours that DO exist at that
 * weight — `--info-bg`, `--ok-bg`, `--warn-bg` — are SEMANTIC: they mean
 * informational, fine, careful. Painting "What Sahoda noticed" in `--info-bg`
 * would say that block is an informational state, which is a claim about the
 * content rather than a decoration on it, and docs/37 reserves those tokens for
 * strokes, icons and text rather than fills.
 *
 * So four squares are neutral and ONE carries the brand tint: the money. That
 * is this system's own rule — spend the accent on the one thing the screen is
 * for — applied to the brief's idea rather than against it. Five tinted squares
 * would also be five things competing, which the brief itself warns against two
 * lines after it asks for them.
 *
 * `dark:bg-s2` on the tinted one is not optional: `--t100` stays warm-light in
 * dark while `--acc` flips to Orange300, and the pair measures ~1.7:1. The
 * surface swap is the documented fix (apps/web/CLAUDE.md).
 */
export function ReportModule({
  n,
  eyebrow,
  title,
  icon: Icon,
  accent = false,
  children,
}: {
  /** Position in the document, 1-based. Rendered zero-padded, decoratively. */
  n: number
  eyebrow: string
  title: string
  icon: LucideIcon
  /** The one module that carries the brand tint. See the header. */
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'surface-ring rounded-card bg-surface p-6 shadow-card max-narrow:p-4',
        // A hover response is a promise that a click does something, and these
        // do not click. So the card does NOT lift; only the numeral warms, which
        // reads as the document tracking where you are rather than as an
        // affordance that is not there.
        'group transition-panel',
      )}
    >
      <div className="flex items-start gap-4 max-narrow:gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-12 flex-none place-items-center rounded-[14px] max-narrow:size-10',
            accent ? 'bg-tint-100 text-accent dark:bg-s2' : 'bg-surface-2 text-ink',
          )}
        >
          <Icon size={22} strokeWidth={1.7} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="type-eyebrow text-muted">{eyebrow}</p>
          <h2 className="type-h2 mt-1 text-ink">{title}</h2>
          <div className="mt-3">{children}</div>
        </div>

        {/* The ordinal. Decorative, hidden from assistive tech, and it warms
            on hover so the module you are reading is the one that is marked. */}
        <span
          aria-hidden
          className="type-hero-num num flex-none text-ink-faint transition-micro group-hover:text-ink-mute max-narrow:hidden"
        >
          {String(n).padStart(2, '0')}
        </span>
      </div>
    </section>
  )
}
