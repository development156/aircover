'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { moveTask } from '@/app/actions/ops-board'
import { AddCard } from '@/components/admin/add-card'
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
  type Column,
} from '@/lib/ops/board'
import { cn } from '@/lib/utils'

/**
 * D3 · Scrum board (doc 13 §10).
 *
 * Writes go through `public.ops_task_*` SECURITY DEFINER functions, which call
 * `app.ops_writer()` and raise 42501 unless the caller is an active owner or
 * admin. `canWrite` here only decides what to RENDER — a viewer gets no drag, no
 * select and no buttons, because a control that lifts under the cursor and then
 * refuses is worse than no control. The database is what actually says no.
 *
 * Drop targets are the columns themselves. A drop onto the column a card is
 * already in is a no-op that never reaches the server.
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

export function BoardView({
  cards,
  canWrite = false,
}: {
  cards: readonly BoardCard[]
  canWrite?: boolean
}) {
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Column | null>(null)
  const [, startTransition] = useTransition()

  function drop(column: Column, code: string) {
    setDragging(null)
    setOver(null)

    const card = cards.find((candidate) => candidate.code === code)
    // Already there, or not a card we know: nothing to say and nothing to send.
    if (!card || card.column === column) return

    startTransition(async () => {
      const result = await moveTask({ code, column })
      if (result.ok) toast.success(`${code} → ${COLUMN_LABEL[column]}`)
      else toast.error(result.message)
    })
  }

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
            <div
              key={column}
              onDragOver={(event) => {
                if (!canWrite || !dragging) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setOver(column)
              }}
              onDragLeave={() => setOver((current) => (current === column ? null : current))}
              onDrop={(event) => {
                if (!canWrite) return
                event.preventDefault()
                drop(column, event.dataTransfer.getData('text/plain'))
              }}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-card p-1 transition-micro',
                over === column ? 'bg-tint-50 dark:bg-s2' : 'bg-transparent',
              )}
            >
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
                columnCards.map((card) => (
                  <BoardCardTile
                    key={card.code}
                    card={card}
                    canWrite={canWrite}
                    onDragStart={setDragging}
                  />
                ))
              )}

              {canWrite && column === 'todo' ? <AddCard /> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
