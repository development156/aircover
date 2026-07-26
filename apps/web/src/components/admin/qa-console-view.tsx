'use client'

import { useMemo, useState } from 'react'
import type { OpsQaRun } from '@sahoda/shared'

import { QaRunRow } from '@/components/admin/qa-run-row'
import {
  applyQaFilters,
  buildFeed,
  facetsOf,
  NO_QA_FILTERS,
  type DateWindow,
  type QaFilters,
} from '@/lib/ops/qa-console'
import { cn } from '@/lib/utils'

/**
 * D4 · QA console (doc 13 §11) — two feeds, one table.
 *
 * The manual-run composer, screenshots and JSON export/import are SL-019 and
 * SL-020. Nothing here hints at them, because a disabled compose button is a
 * promise the page cannot keep today.
 */

const CHIP =
  'rounded-pill px-2.5 py-1 text-[12px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const WINDOW_LABEL: Record<DateWindow, string> = {
  today: 'Last 24 h',
  week: 'Last 7 days',
  all: 'All time',
}

function Facet<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  value: T | null
  onChange: (next: T | null) => void
}) {
  if (options.length < 2) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          CHIP,
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
            CHIP,
            value === option ? 'bg-tint-50 text-accent dark:bg-s2' : 'text-muted hover:bg-s2',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

export function QaConsoleView({ runs }: { runs: readonly OpsQaRun[] }) {
  const [filters, setFilters] = useState<QaFilters>(NO_QA_FILTERS)

  const facets = useMemo(() => facetsOf(runs), [runs])
  // One clock per render for the date window — see the roadmap card.
  const visible = useMemo(() => applyQaFilters(runs, filters, new Date()), [runs, filters])
  const feed = useMemo(() => buildFeed(visible), [visible])

  const patch = (next: Partial<QaFilters>) => setFilters((current) => ({ ...current, ...next }))

  return (
    <div className="space-y-grid">
      <div className="flex flex-col gap-2 rounded-card border border-line bg-bg p-4 shadow-card">
        <Facet
          label="Suite"
          options={facets.suites}
          value={filters.suite}
          onChange={(suite) => patch({ suite })}
        />
        <Facet
          label="Status"
          options={facets.statuses}
          value={filters.status}
          onChange={(status) => patch({ status })}
        />
        <Facet
          label="Who"
          options={facets.actors}
          value={filters.actor}
          onChange={(actor) => patch({ actor })}
        />
        <Facet
          label="Card"
          options={facets.taskCodes}
          value={filters.taskCode}
          onChange={(taskCode) => patch({ taskCode })}
        />

        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
            When
          </span>
          {(['today', 'week', 'all'] as const).map((window) => (
            <button
              key={window}
              type="button"
              onClick={() => patch({ window })}
              aria-pressed={filters.window === window}
              className={cn(
                CHIP,
                filters.window === window
                  ? 'bg-tint-50 text-accent dark:bg-s2'
                  : 'text-muted hover:bg-s2',
              )}
            >
              {WINDOW_LABEL[window]}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-muted tabular-nums">
            {visible.length === runs.length
              ? `${runs.length} run${runs.length === 1 ? '' : 's'}`
              : `Showing ${visible.length} of ${runs.length}`}
          </span>
        </div>
      </div>

      {feed.pinned.length > 0 ? (
        <section aria-labelledby="qa-standing" className="space-y-2">
          <h2 id="qa-standing" className="text-[13px] font-bold text-danger">
            Still failing
            <span className="ml-2 font-normal text-muted tabular-nums">{feed.pinned.length}</span>
          </h2>
          {/* Pinned until a LATER run of the same suite on the same card
              answers. A green run elsewhere is not an answer. */}
          {feed.pinned.map((run) => (
            <QaRunRow key={run.id} run={run} pinned />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="qa-history" className="space-y-2">
        <h2 id="qa-history" className="text-[13px] font-bold">
          History
        </h2>

        {feed.history.length === 0 ? (
          <p className="rounded-input border border-dashed border-line px-3 py-6 text-center text-[13px] text-faint">
            {runs.length === 0
              ? 'No runs recorded yet. The hooks log one every time a check runs.'
              : 'No runs match these filters.'}
          </p>
        ) : (
          feed.history.map((run) => <QaRunRow key={run.id} run={run} />)
        )}
      </section>
    </div>
  )
}
