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
 */

const TRACK = 100
const BAR_H = 6

export function SpendBars({ spend }: { spend: SpendRead }) {
  if (spend.status !== 'ok' || spend.byAction.length === 0) {
    return (
      <ChartEmpty
        status={spend.status === 'unreadable' ? 'unreadable' : 'empty'}
        empty="Nothing spent yet — no actions to break down."
      />
    )
  }

  // Relative to the biggest, so the largest bar always fills the track. An
  // absolute scale would render a workspace's whole month as slivers.
  const peak = Math.max(...spend.byAction.map((a) => a.credits)) || 1

  return (
    <ul className="space-y-3">
      {spend.byAction.map((action) => (
        <li key={action.action}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-eyebrow truncate text-ink-mute">{action.label}</span>
            <span
              data-testid={`spend-bar-value-${action.action}`}
              className="num shrink-0 text-[13px] font-semibold"
            >
              {action.credits}
            </span>
          </div>
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
        </li>
      ))}
    </ul>
  )
}
