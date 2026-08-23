import Link from 'next/link'
import type { Route } from 'next'

import { NotYet, Unmeasured, Unreadable } from '@/components/design-system/absence-row'
import { cn } from '@/lib/utils'

/**
 * ONE NUMBER, AT REAL SIZE. The reference's stat card, measured off it.
 *
 * ── THE SHAPE, AND WHERE EACH PART CAME FROM ─────────────────────────────────
 * label (eyebrow, muted) · the figure at display size · its unit, small, on the
 * same baseline · one line underneath saying what the figure is OF. Runey's
 * five-across strip is exactly this; Toota adds the sub-line; Flux sets the
 * unit small beside the number rather than in the label, which is what lets
 * "4,3k kcal today" read as one phrase instead of two.
 *
 * ── GENEROUS PADDING IS THE POINT, NOT A DETAIL ──────────────────────────────
 * docs/37 §4 puts card padding at 20-24 and the shared `Card` primitive is at
 * 16. That is not wrong for a dense table card, and it is wrong for this: the
 * single biggest reason the reference reads calm is that its stat cards have
 * air around one number. `p-5` here rather than changing `Card`'s default,
 * because this lane has shot two screens and `Card` renders on forty.
 *
 * ── AN ABSENT NUMBER IS A MARK, NEVER A DASH AND NEVER A ZERO ────────────────
 * `value: null` is not enough information to render honestly — docs/37 §9 has
 * three absence states and they make different claims. So the caller passes
 * WHICH ONE, and there is no default: a slot whose absence has not been
 * classified is a slot that will eventually render "we could not read this" to
 * somebody whose account is simply new.
 *
 * The third state — the quantity does not exist — has no rendering here on
 * purpose. Do not pass `absent` for it; do not render the card at all.
 */

export type StatAbsence =
  /** The slot is real; the reading has not arrived. */
  | 'unmeasured'
  /** We asked and got nothing back. */
  | 'unreadable'
  /** There is nothing that could have a value yet — no workspace. */
  | 'not-yet'

export interface StatCardProps {
  label: string
  /** The reading. `null` means absent, and `absent` says which kind. */
  value: number | string | null
  absent?: StatAbsence
  /** Set small beside the figure — "posts", "credits". Part of the phrase. */
  unit?: string
  /** One line under the figure. What it is OF, or what it is waiting for. */
  note?: React.ReactNode
  /** A trailing visual — a sparkline. Only where there is a real series. */
  chart?: React.ReactNode
  /** Where the number can be acted on. The whole card becomes the target. */
  href?: Route
  className?: string
}

function Figure({ value, absent, label }: Pick<StatCardProps, 'value' | 'absent' | 'label'>) {
  if (value !== null) {
    return (
      <span className="type-hero-num num text-ink">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </span>
    )
  }
  if (absent === 'unreadable') return <Unreadable what={label} />
  if (absent === 'not-yet') return <NotYet what={label} />
  return <Unmeasured what={label} />
}

export function StatCard({
  label,
  value,
  absent,
  unit,
  note,
  chart,
  href,
  className,
}: StatCardProps) {
  const body = (
    <>
      <p className="type-eyebrow text-muted">{label}</p>
      {/* `items-baseline` so the unit sits ON the figure's baseline rather than
          centred against a 44px line box — the difference between one phrase
          and two stacked things. */}
      <p className="mt-3 flex min-h-[44px] flex-wrap items-baseline gap-x-2">
        <Figure value={value} absent={absent} label={label} />
        {unit && value !== null ? <span className="type-sm text-muted">{unit}</span> : null}
      </p>
      {note ? <div className="mt-1 type-meta text-muted">{note}</div> : null}
      {chart ? <div className="mt-4">{chart}</div> : null}
    </>
  )

  const shell = cn(
    'surface-ring flex flex-col rounded-card bg-surface p-5',
    // Only an interactive card moves. A hover response is a promise that a
    // click does something — the rule `Card` already states, restated because
    // this primitive does not go through it.
    href &&
      'transition-panel hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
    className,
  )

  if (!href) return <section className={shell}>{body}</section>

  return (
    <Link
      href={href}
      className={cn(
        shell,
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  )
}

/**
 * The strip these sit in. Four across, and it RECOMPOSES rather than shrinking.
 *
 * docs/37 §13: mobile is recomposed, not shrunk. Four 44px figures side by side
 * at 390 would be four 80px columns, so below `narrow` it is two-up — which is
 * the shape Runey's own four-card row takes on a phone, and it keeps each
 * figure at full size instead of scaling the type down to fit a column.
 */
export function StatStrip({
  children,
  cols = 4,
}: {
  children: React.ReactNode
  /**
   * How many cards. Stated rather than counted from `children`, because
   * `Children.count` sees a fragment as one and a conditional card as a `false`
   * — a grid that guesses its own column count is a grid that renders three
   * cards across four columns on the one branch nobody screenshotted.
   */
  cols?: 3 | 4
}) {
  return (
    <div
      className={cn(
        'grid gap-4 max-narrow:gap-3',
        /* THREE AND FOUR BREAK DIFFERENTLY, because three FIT in the middle
           band and four do not. MEASURED at 1024, where the rail costs 72px and
           the content column is ~936: four 44px figures need ~230px each and
           wrap; three have ~300 and read fine. A shared `max-wide:grid-cols-2`
           put /analytics' third card alone on a second row at half width, for
           no reason but sharing a rule with a strip that has one more card. */
        cols === 3 ? 'grid-cols-3 max-narrow:grid-cols-1' : 'grid-cols-4 max-wide:grid-cols-2',
      )}
    >
      {children}
    </div>
  )
}
