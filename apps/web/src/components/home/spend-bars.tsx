import Link from 'next/link'

import { ChevronRight, faceFor } from './action-face'
import { ChartEmpty } from './chart-empty'
import type { SpendRead } from '@/lib/home/spend'

/**
 * Spend by action type. One row per category: what it was, what it was for, how
 * much of the window's spend it took, and a way into the ledger entry.
 *
 * ── THE DENOMINATOR IS THE TOTAL, AND THE REFERENCE'S WAS NOT ────────────────
 * The design this was built from shows "20 / 20" and "3 / 20". That 20 is
 * `peak`, the largest category — so the top row always reads N of N, which a
 * reader parses as "you have used your whole allowance". There is no allowance:
 * `SpendByAction` carries `action`, `label` and `credits`, and nothing in
 * `SpendRead` is a cap. Rendering it would be docs/37 §9's third absence state,
 * the one with no class on purpose — there is no such quantity, so omit it.
 *
 * `spend.total` IS a real measured quantity and it is already printed at the top
 * of this card, so "20 / 23" means "20 of the 23 credits you spent" and the
 * column sums to the figure above it. Same shape, true claim.
 *
 * The bar is scaled to that same total, so the bar and the fraction agree. It
 * used to scale to `peak`, which drew the largest category at 100% of a
 * FULL-WIDTH track — a ~1100px solid orange rectangle, MEASURED at 1024, and
 * the largest orange area on /home. `Bars`, the thirty-day chart above this one
 * in the same card, already refuses that and says why in its own comment.
 *
 * ── A COMPARISON OF ONE THING IS NOT A COMPARISON ────────────────────────────
 * Kept from the previous version, and still load-bearing for any future caller:
 * with exactly one category the bar is the whole track whatever the number is.
 * `SpendCard` never reaches here with one — it names the single category in a
 * sentence instead — but this file may not depend on its caller for that.
 *
 * The label and the amount are unconditional. The FIGURE is real and is never
 * what gets dropped; the bar is a second encoding of it.
 */

const TRACK = 100
const BAR_H = 6

/** Below this there is no ratio to draw, only a number. */
const MIN_FOR_COMPARISON = 2

export function SpendBars({ spend }: { spend: SpendRead }) {
  if (spend.status !== 'ok' || spend.byAction.length === 0) {
    return (
      <ChartEmpty
        status={spend.status === 'unreadable' ? 'unreadable' : 'empty'}
        empty="Nothing spent yet. No actions to break down."
      />
    )
  }

  const comparable = spend.byAction.length >= MIN_FOR_COMPARISON
  // The window's own total, which is the figure at the top of this card. Guarded
  // so a zero total can never divide — `ok` with rows should not produce one,
  // and a NaN width would render as an invisible bar rather than an error.
  const whole = spend.total > 0 ? spend.total : 0

  return (
    <ul
      className="divide-y divide-line-soft overflow-hidden rounded-card border border-line-soft"
      data-testid="spend-breakdown"
    >
      {spend.byAction.map((action) => {
        const { Icon, sub } = faceFor(action.action)
        const share = whole > 0 ? Math.min(action.credits / whole, 1) : 0

        return (
          <li key={action.action}>
            <Link
              href="/wallet"
              className="flex items-center gap-3 p-3 transition-micro hover:bg-surface-2 max-narrow:min-h-[44px]"
            >
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-sm bg-brand-wash text-accent"
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="type-eyebrow block truncate text-ink">{action.label}</span>
                {/* Absent for an action with no entry, rather than guessed. */}
                {sub ? <span className="type-meta block truncate text-muted">{sub}</span> : null}
              </span>

              {comparable ? (
                <svg
                  viewBox={`0 0 ${TRACK} ${BAR_H}`}
                  preserveAspectRatio="none"
                  aria-hidden
                  className="h-[6px] w-32 shrink-0 max-narrow:hidden"
                >
                  <rect x={0} y={0} width={TRACK} height={BAR_H} rx={3} fill="var(--surface-2)" />
                  <rect
                    data-testid={`spend-bar-${action.action}`}
                    x={0}
                    y={0}
                    width={share * TRACK}
                    height={BAR_H}
                    rx={3}
                    fill="var(--brand)"
                  />
                </svg>
              ) : null}

              {/* `.num` is tabular, so equal-width digits only line up if the box
                  holding them is equal too. */}
              {/* `.num` sits on each FIGURE, not on a wrapper. It is what makes
                  the digits tabular, and charts.test.tsx asserts it on the
                  amount itself — an inherited class would satisfy the eye and
                  not the guard, which is the right way round. */}
              <span className="type-sm shrink-0 text-right font-semibold">
                <span className="num" data-testid={`spend-bar-value-${action.action}`}>
                  {action.credits}
                </span>
                {whole > 0 ? <span className="num font-normal text-muted"> / {whole}</span> : null}
              </span>

              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-mute" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
