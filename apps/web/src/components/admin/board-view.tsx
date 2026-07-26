'use client'

import { useMemo, useState } from 'react'

import { BoardCardTile } from '@/components/admin/board-card'
import {
  applyFilters,
  COLUMNS,
  COLUMN_LABEL,
  groupByColumn,
  NO_FILTERS,
  stagesOn,
  WIP_NUDGE_AT,
  type BoardCard,
  type BoardFilters,
} from '@/lib/ops/board'
import { cn } from '@/lib/utils'

/**
 * D3 · Scrum board (doc 13 §10) — read-only in this card.
 *
 * DRAG, INLINE EDIT AND ARCHIVE ARE NOT HERE, and their absence is deliberate
 * rather than forgotten. Every one of them is a WRITE to `ops_tasks`, and the
 * tables carry no write policies at all by design — mutations go through
 * `public.ops_*` SECURITY DEFINER functions, of which exactly one exists today
 * (`ops_ingest`, token-authed, agent-only). Adding human writes needs a new
 * migration plus server actions, and applying a migration needs an explicit ask.
 * A drag handle that silently did nothing would be worse than no drag handle.
 *
 * Filters are client state, not URL state: they are a way of looking at the
 * board for a moment, not a place to link someone to.
 */

const FILTER_BUTTON =
  'rounded-pill px-2.5 py-1 text-[12px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  format = (option: T) => option,
}: {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (next: T | null) => void
  format?: (option: T) => string
}) {
  if (options.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          FILTER_BUTTON,
          value === null ? 'bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:bg-s2',
        )}
      >
        All
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(value === option ? null : option)}
          aria-pressed={value === option}
          className={cn(
            FILTER_BUTTON,
            value === option ? 'bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:bg-s2',
          )}
        >
          {format(option)}
        </button>
      ))}
    </div>
  )
}

export function BoardView({ cards }: { cards: readonly BoardCard[] }) {
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS)

  const stages = useMemo(() => stagesOn(cards), [cards])
  const assignees = useMemo(() => [...new Set(cards.map((card) => card.assignee))].sort(), [cards])
  const visible = useMemo(() => applyFilters(cards, filters), [cards, filters])
  const grouped = useMemo(() => groupByColumn(visible), [visible])

  const filtered = visible.length !== cards.length
  const blockedCount = cards.filter((card) => card.blocked).length

  return (
    <section id="board" aria-labelledby="board-heading" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="board-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Board
        </h2>

        <FilterGroup
          label="Stage"
          options={stages}
          value={filters.stage}
          onChange={(stage) => setFilters((current) => ({ ...current, stage }))}
        />
        <FilterGroup
          label="Who"
          options={assignees}
          value={filters.assignee}
          onChange={(assignee) => setFilters((current) => ({ ...current, assignee }))}
          format={(who) => (who === 'claude' ? 'Claude' : who[0]!.toUpperCase() + who.slice(1))}
        />

        <button
          type="button"
          onClick={() =>
            setFilters((current) => ({ ...current, blockedOnly: !current.blockedOnly }))
          }
          aria-pressed={filters.blockedOnly}
          className={cn(
            FILTER_BUTTON,
            filters.blockedOnly
              ? 'bg-danger-bg text-danger'
              : 'text-muted hover:bg-s2 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={blockedCount === 0}
          title={blockedCount === 0 ? 'Nothing is blocked' : undefined}
        >
          Blocked{blockedCount > 0 ? ` (${blockedCount})` : ''}
        </button>

        {filtered ? (
          <span className="text-[12px] text-muted tabular-nums">
            Showing {visible.length} of {cards.length}
          </span>
        ) : null}
      </div>

      <div className="grid gap-grid narrow:grid-cols-2 wide:grid-cols-4">
        {COLUMNS.map((column) => {
          const columnCards = grouped[column]
          const nudge = column === 'in_progress' && columnCards.length > WIP_NUDGE_AT

          return (
            <div key={column} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[13px] font-semibold">{COLUMN_LABEL[column]}</h3>
                <span className="text-[12px] text-muted tabular-nums">{columnCards.length}</span>
              </div>

              {/* A nudge, never a block (§10) — it says what it noticed and
                  stops there. */}
              {nudge ? (
                <p className="rounded-input bg-warn-bg px-2 py-1 text-[12px] text-warn tabular-nums">
                  {columnCards.length} cards in progress. Finishing beats starting.
                </p>
              ) : null}

              {columnCards.length === 0 ? (
                <p className="rounded-input border border-dashed border-line px-3 py-4 text-center text-[12px] text-faint">
                  {filtered ? 'Nothing here matches the filters' : 'Nothing here'}
                </p>
              ) : (
                columnCards.map((card) => <BoardCardTile key={card.code} card={card} />)
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
