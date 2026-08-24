import { ChartEmpty } from './chart-empty'
import type { SpendRead } from '@/lib/home/spend'

/**
 * Spend by action type, as horizontal bars. Hand-rolled SVG per bar so the
 * track can be a real, measurable width rather than a percentage guess.
 *
 * Bars paint with `var(--brand)` and re-theme with the tenant. Labels take the
 * mono eyebrow token and amounts take `.num`, so the numbers align down the
 * right edge the way the ledger's do — this is the same figure in a different
 * shape, and it should read as the same kind of thing.
 *
 * At most five actions can appear today (`brand_research`, `loop_cycle`,
 * `post_variants`, `site_generate`, `caption_rewrite` are the only paths that
 * charge), so this list is short by construction and needs no scroll.
 *
 * ── A COMPARISON OF ONE THING IS NOT A COMPARISON ────────────────────────────
 * Every bar is scaled `credits / peak`, and `peak` is the largest category — so
 * with exactly ONE category the bar is `credits / credits`, which is the full
 * track, always, whatever the number is. MEASURED on a workspace with one draft:
 * a ~1000px solid `var(--brand)` rectangle spanning the card, encoding a value
 * already printed at its right-hand end, and the single largest area of solid
 * orange anywhere in the product outside a button. It was the loudest object on
 * /home while carrying no information at all — docs/37 §16's hierarchy failure
 * in its purest form, and docs/37 §9's third absence state ("there is no such
 * quantity — omit the slot") applied to a ratio rather than to a number.
 *
 * So the track appears when there is something to compare against, and not
 * before. The label and the amount are unconditional: the FIGURE is real and is
 * never what gets dropped. `charts.test.tsx` previously asserted the opposite
 * ("a single action still renders a sane bar"); that assertion described the
 * defect, and it is replaced rather than worked around.
 */

const TRACK = 100
const BAR_H = 6

/**
 * ── WHY THE TRACK IS A FIXED COLUMN AND NOT THE ROW'S WIDTH ──────────────────
 * It used to span the row, so the peak category drew a ~1100px solid
 * `var(--brand)` rectangle across the card — MEASURED on a 1024 frame, and the
 * largest orange area on /home. `Bars`, the thirty-day chart directly ABOVE this
 * one, already refuses that: it fills with `bg-ink-mute` and says why in its own
 * comment ("a rectangle is a large object"). The breakdown was contradicting its
 * own sibling three rows down the same card.
 *
 * A fixed column also does the thing the row layout could not: it puts every
 * amount in one right-aligned column, so the figures line up the way the
 * ledger's do, which is what `.num` was already asking for and not getting.
 *
 * ── AND THE BAR IS REINFORCEMENT, NEVER THE ONLY CARRIER ─────────────────────
 * `var(--brand)` on a near-white track measures 2.624:1 in light against 5.484
 * in dark, and it CANNOT be fixed by darkening the track: orange is darker than
 * white, so a darker track moves the two closer together. White is the ceiling
 * and docs/37 §2.2 already prints it — `#ff6600` on `#ffffff` is 2.94:1, which
 * fails the 3:1 UI-boundary floor.
 *
 * That floor applies to a graphical object carrying meaning ALONE. This one
 * never does: the amount is printed beside it and is unconditional, by this
 * file's own rule. The bar is a second encoding of a number already on screen,
 * so the honest fix is to stop it being large rather than to restate it in a
 * hue that cannot hold an edge on white.
 */
const TRACK_W = 'w-20'

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
  // Relative to the biggest, so the largest bar always fills the track. An
  // absolute scale would render a workspace's whole month as slivers.
  const peak = Math.max(...spend.byAction.map((a) => a.credits)) || 1

  return (
    <ul className="space-y-2.5" data-testid="spend-breakdown">
      {spend.byAction.map((action) => (
        <li key={action.action} className="flex items-center gap-3">
          <span className="type-eyebrow min-w-0 flex-1 truncate text-ink-mute">{action.label}</span>
          {comparable ? (
            <svg
              viewBox={`0 0 ${TRACK} ${BAR_H}`}
              preserveAspectRatio="none"
              aria-hidden
              className={`h-[6px] shrink-0 ${TRACK_W}`}
            >
              <rect x={0} y={0} width={TRACK} height={BAR_H} rx={3} fill="var(--surface-2)" />
              <rect
                data-testid={`spend-bar-${action.action}`}
                x={0}
                y={0}
                width={(action.credits / peak) * TRACK}
                height={BAR_H}
                rx={3}
                fill="var(--brand)"
              />
            </svg>
          ) : null}
          <span
            data-testid={`spend-bar-value-${action.action}`}
            /* A fixed, right-aligned column. `.num` is tabular, so equal-width
               digits only line up if the box they sit in is equal too. */
            className="num type-sm w-9 shrink-0 text-right font-semibold"
          >
            {action.credits}
          </span>
        </li>
      ))}
    </ul>
  )
}
