'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { moveTask } from '@/app/actions/ops-board'
import { AddCard } from '@/components/admin/add-card'
import { BoardCardTile } from '@/components/admin/board-card'
import { StageRollupView } from '@/components/admin/stage-rollup'
import { isRed, rollup } from '@/lib/ops/rollup'
import { useHashTarget } from '@/lib/ops/use-hash-target'
import {
  applyFilters,
  COLUMNS,
  COLUMN_LABEL,
  groupByColumn,
  NO_FILTERS,
  stagesOn,
  capColumn,
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
  stageLabels = {},
}: {
  cards: readonly BoardCard[]
  canWrite?: boolean
  /** Roadmap item code → its title, so a rolled-up stage reads as words. */
  stageLabels?: Readonly<Record<string, string>>
}) {
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Column | null>(null)
  // The rolled-up summary is the DEFAULT (SL-062 §3): 62 cards in four columns
  // is a view for the person who wrote them.
  const [showAll, setShowAll] = useState(false)
  // Done holds 35 of 62 cards and only grows, so it is capped until asked.
  const [showAllDone, setShowAllDone] = useState(false)
  const [expandedStages, setExpandedStages] = useState<ReadonlySet<string>>(new Set())
  const [, startTransition] = useTransition()

  // A link to a card (from the hero card's blocked list, or "To reach Done")
  // has to reach it. In the default view the card sits inside a collapsed
  // stage, so the anchor is in no DOM and the browser scrolls nowhere.
  const hashTarget = useHashTarget()

  function toggleStage(key: string) {
    setExpandedStages((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
  // Always from the FULL card list, never from the filtered one: a summary that
  // reflected the current filter could read clean because a filter hid the
  // blocked card, which is the rule this whole view exists to keep (§5).
  const rolledUp = useMemo(() => rollup(cards, stageLabels), [cards, stageLabels])
  const assignees = useMemo(() => [...new Set(cards.map((card) => card.assignee))].sort(), [cards])
  const visible = useMemo(() => applyFilters(cards, filters), [cards, filters])
  const grouped = useMemo(() => groupByColumn(visible), [visible])

  // Two effects, and they have to be two: the first opens the stage, the second
  // runs after that render has put the card in the DOM. Scrolling in the first
  // would look for an element that does not exist yet.
  useEffect(() => {
    if (!hashTarget) return
    const stage = rolledUp.find((entry) => entry.cards.some((c) => c.code === hashTarget))
    if (!stage) return
    setExpandedStages((current) =>
      current.has(stage.key) ? current : new Set(current).add(stage.key),
    )
  }, [hashTarget, rolledUp])

  useEffect(() => {
    if (!hashTarget) return
    // `scroll-mt-24` on the tile keeps it clear of the sticky header.
    document.getElementById(`task-${hashTarget}`)?.scrollIntoView({ block: 'start' })
  }, [hashTarget, expandedStages, showAll])

  const filtered = visible.length !== cards.length
  const blockedCount = cards.filter((card) => card.blocked).length
  // From the whole board, never from `visible` — see the note beside `rolledUp`.
  const redCount = cards.filter(isRed).length

  return (
    <section id="board" aria-labelledby="board-heading" className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="board-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Board
        </h2>

        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          aria-pressed={showAll}
          className={cn(
            FILTER_BUTTON,
            'border border-line',
            showAll ? 'bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:bg-s2',
          )}
        >
          {showAll ? 'Show summary' : `Show all ${cards.length} cards`}
        </button>

        {showAll ? (
          <>
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
          </>
        ) : null}

        {/* Red on the face of the board itself, in BOTH views and regardless of
            any filter — the count comes from `cards`, not from `visible`. In
            the summary view the stage rows name the cards; here we only make
            sure the number is never absent (§5). */}
        {redCount > 0 ? (
          <span className="ml-auto text-[12px] font-medium text-danger tabular-nums">
            {redCount} blocked or failing
          </span>
        ) : null}
      </div>

      {!showAll ? (
        <StageRollupView
          stages={rolledUp}
          expandedKeys={expandedStages}
          onToggle={toggleStage}
          canWrite={canWrite}
        />
      ) : (
        <div className="grid gap-grid narrow:grid-cols-2 wide:grid-cols-4">
          {COLUMNS.map((column) => {
            const all = grouped[column]
            // Only Done is capped, and only until the reader asks for the rest.
            // `capColumn` never truncates a red card (§5).
            const capped =
              column === 'done' && !showAllDone ? capColumn(all) : { shown: all, hidden: 0 }
            const columnCards = capped.shown
            const nudge = column === 'in_progress' && all.length > WIP_NUDGE_AT

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
                  {/* The FULL count, always. A capped column showing its
                      capped count would understate the board. */}
                  <span className="text-[12px] text-muted tabular-nums">{all.length}</span>
                </div>

                {/* A nudge, never a block (§10) — it says what it noticed and
                  stops there. */}
                {nudge ? (
                  <p className="rounded-input bg-warn-bg px-2 py-1 text-[12px] text-warn tabular-nums">
                    {all.length} cards in progress. Finishing beats starting.
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

                {capped.hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllDone(true)}
                    className="rounded-input border border-dashed border-line px-3 py-2 text-[12px] text-muted tabular-nums transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Show {capped.hidden} more finished
                  </button>
                ) : null}

                {canWrite && column === 'todo' ? <AddCard /> : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
