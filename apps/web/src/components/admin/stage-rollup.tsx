'use client'

import { ChevronRight, OctagonAlert } from 'lucide-react'

import { BoardCardTile } from '@/components/admin/board-card'
import type { StageRollup } from '@/lib/ops/rollup'
import { cn } from '@/lib/utils'

/**
 * The default, rolled-up view of the board (SL-062 §3) — 6–10 stage summaries
 * instead of 62 cards. "Show all" reveals the full four-column board; no card
 * is deleted or merged to get here.
 *
 * THE RED RULE (§5). A stage containing a blocked or failing card renders its
 * red line ON THE COLLAPSED FACE, in crimson, whether or not the stage is
 * expanded. The line is `stage.redSummary`, which `rollup()` derives from the
 * cards themselves — this component cannot make a red stage look clean, because
 * it is not given the option.
 */

function Bar({ percent, red }: { percent: number; red: boolean }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-s2"
    >
      <div
        className={cn('h-full rounded-pill transition-micro', red ? 'bg-danger' : 'bg-primary')}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function StageSummaryRow({
  stage,
  expanded,
  onToggle,
  canWrite,
}: {
  stage: StageRollup
  expanded: boolean
  onToggle: () => void
  canWrite: boolean
}) {
  const panelId = `stage-panel-${stage.key}`

  return (
    <section
      className={cn(
        'rounded-card border bg-bg shadow-card transition-micro',
        // The border carries the red too, so a scan down the page finds it
        // without reading a word.
        stage.hasRed ? 'border-danger' : 'border-line',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full rounded-card px-4 py-3 text-left transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            size={14}
            strokeWidth={2.2}
            aria-hidden
            className={cn('shrink-0 text-muted transition-micro', expanded && 'rotate-90')}
          />
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {stage.label}
          </h3>
          <span className="shrink-0 text-[12px] text-muted tabular-nums">
            {stage.done} of {stage.total} done
          </span>
          <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums">
            {stage.percent}%
          </span>
        </div>

        <div className="mt-2 pl-[22px]">
          <Bar percent={stage.percent} red={stage.hasRed} />
        </div>

        {/* Never conditional on `expanded`. This is the whole rule. */}
        {stage.redSummary ? (
          <p className="mt-2 flex items-start gap-1.5 pl-[22px] text-[12px] font-medium text-danger">
            <OctagonAlert size={13} strokeWidth={2} aria-hidden className="mt-[2px] shrink-0" />
            <span>{stage.redSummary}</span>
          </p>
        ) : null}

        {stage.inProgress > 0 ? (
          <p className="mt-1.5 pl-[22px] text-[12px] text-muted tabular-nums">
            {stage.inProgress} in progress
          </p>
        ) : null}
      </button>

      {expanded ? (
        <div id={panelId} className="grid gap-2 border-t border-line p-3 narrow:grid-cols-2">
          {stage.cards.map((card) => (
            /* `draggable={false}`: this view has no drop zones, so a card that
               lifted here could never land. The select in the card's controls
               still moves it — see BoardCardTile's note on the two props. */
            <BoardCardTile key={card.code} card={card} canWrite={canWrite} draggable={false} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function StageRollupView({
  stages,
  expandedKeys,
  onToggle,
  canWrite = false,
}: {
  stages: readonly StageRollup[]
  /** Which stages are open. Collapsed is the default everywhere (SL-062 §4). */
  expandedKeys: ReadonlySet<string>
  onToggle: (key: string) => void
  canWrite?: boolean
}) {
  if (stages.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
        No cards on the board yet.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {stages.map((stage) => (
        <StageSummaryRow
          key={stage.key}
          stage={stage}
          expanded={expandedKeys.has(stage.key)}
          onToggle={() => onToggle(stage.key)}
          canWrite={canWrite}
        />
      ))}
    </div>
  )
}
