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

/** Below this there is no ratio to draw, only a number. */
const MIN_FOR_COMPARISON = 2

export function SpendBars({ spend }: { spend: SpendRead }) {
  if (spend.status !== 'ok' || spend.byAction.length === 0) {
    return (
      <ChartEmpty
        status={spend.status === 'unreadable' ? 'unreadable' : 'empty'}
        empty="Nothing spent yet — no actions to break down."
      />
    )
  }

  const comparable = spend.byAction.length >= MIN_FOR_COMPARISON
  // Relative to the biggest, so the largest bar always fills the track. An
  // absolute scale would render a workspace's whole month as slivers.
  const peak = Math.max(...spend.byAction.map((a) => a.credits)) || 1

  return (
    <ul className={comparable ? 'space-y-3' : 'space-y-2'} data-testid="spend-breakdown">
      {spend.byAction.map((action) => (
        <li key={action.action}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-eyebrow truncate text-ink-mute">{action.label}</span>
            <span
              data-testid={`spend-bar-value-${action.action}`}
              className="num type-sm shrink-0 font-semibold"
            >
              {action.credits}
            </span>
          </div>
          {comparable ? (
            <svg
              viewBox={`0 0 ${TRACK} ${BAR_H}`}
              preserveAspectRatio="none"
              aria-hidden
              className="mt-1.5 h-[6px] w-full"
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
        </li>
      ))}
    </ul>
  )
}
