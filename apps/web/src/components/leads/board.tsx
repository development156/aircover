'use client'

import { useMemo, useState, useTransition } from 'react'

import { setLeadStatus } from '@/app/actions/leads'
import { STAGES, nextStatus, type Stage } from '@/lib/leads/stages'
import type { LeadView } from '@/lib/leads/read'

/**
 * THE PIPELINE — four columns, and not one invented figure in any of them.
 *
 * ── WHAT A NUMBER HERE IS ALLOWED TO BE ──────────────────────────────────────
 * A count of the rows in a column, and nothing else. No conversion rate, no lead
 * score, no estimated value: every one of those is a claim about the reader's
 * business dressed as a measurement, and nothing behind this screen has earned
 * one. `board.test.tsx` walks the rendered text and fails on any digit that is
 * not a count this file can name.
 *
 * ── AND A COLUMN WITH NOTHING IN IT SAYS WHAT WOULD LAND THERE ───────────────
 * Rather than a bare zero. "New 0" is a true count and a useless sentence; what
 * a person needs from an empty column is what it is FOR.
 */

export interface BoardProps {
  leads: readonly LeadView[]
}

type Filter = 'all' | 'unanswered' | 'week'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function Board({ leads }: BoardProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const cutoff = Date.now() - WEEK_MS
    return leads.filter((lead) => {
      if (filter === 'unanswered' && lead.status !== 'new') return false
      if (filter === 'week' && Date.parse(lead.createdAt) < cutoff) return false
      if (needle === '') return true
      return [lead.name, lead.email, lead.phone, lead.message]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [leads, query, filter])

  function move(lead: LeadView, status: Stage['status']) {
    setError(null)
    startTransition(async () => {
      const result = await setLeadStatus(lead.id, status)
      if (!result.ok) setError(result.message ?? 'Could not move that lead.')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex-1 min-w-[220px]">
          <span className="sr-only">Search a name, a number or an email</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a name, a number or an email"
            className="h-input w-full rounded-input border border-line bg-bg px-3 type-body text-ink"
          />
        </label>
        {(
          [
            ['all', 'All'],
            ['unanswered', 'Needs a reply'],
            ['week', 'This week'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={[
              'rounded-input px-3 py-2 type-sm transition-colors',
              filter === value ? 'bg-ink text-bg' : 'bg-subtle text-muted',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="type-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2 wide:grid-cols-4 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {STAGES.map((stage) => {
          const inStage = shown.filter((lead) => lead.status === stage.status)
          return (
            <section
              key={stage.status}
              aria-label={stage.name}
              className="surface-ring flex flex-col gap-2 rounded-card bg-surface p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="type-h3 text-ink">{stage.name}</h3>
                {inStage.length > 0 ? (
                  <span className="type-sm num text-muted">{inStage.length}</span>
                ) : null}
              </div>
              {inStage.length === 0 ? (
                <p className="type-sm text-muted">{stage.what}</p>
              ) : (
                <ul className="grid gap-2">
                  {inStage.map((lead) => (
                    <li key={lead.id} className="rounded-input bg-subtle p-2.5">
                      <p className="type-body text-ink">{lead.name?.trim() || 'No name given'}</p>
                      {lead.email ? <p className="type-sm text-muted">{lead.email}</p> : null}
                      {lead.phone ? <p className="type-sm num text-muted">{lead.phone}</p> : null}
                      {lead.message ? (
                        <p className="type-sm mt-1 text-muted">{lead.message}</p>
                      ) : null}
                      <p className="type-sm mt-1 text-muted">{lead.from}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {nextStatus(stage.status) ? (
                          <MoveButton
                            label={STAGES.find((s) => s.status === nextStatus(stage.status))!.name}
                            disabled={pending}
                            onClick={() => move(lead, nextStatus(stage.status)!)}
                          />
                        ) : null}
                        {stage.status !== 'lost' ? (
                          <MoveButton
                            label="Lost"
                            disabled={pending}
                            onClick={() => move(lead, 'lost')}
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function MoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-input bg-bg px-2.5 py-1.5 type-sm text-ink transition-colors disabled:opacity-60"
    >
      {label}
    </button>
  )
}
