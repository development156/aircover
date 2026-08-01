import { AlertTriangle, CircleDot, ListChecks } from 'lucide-react'

import { AlphaReadiness } from '@/components/admin/alpha-readiness'
import { JOURNEY_LABEL, journeyPercent } from '@/lib/ops/roadmap-progress'
import { GATE_SUITES, readGateRuns, readRoadmapItems, readTasks } from '@/lib/ops/read'
import { gateChips, redSuitesFrom } from '@/lib/ops/session-pulse'
import {
  currentStage,
  daysRemaining,
  summarise,
  toReachDone,
  urgencyOf,
  type StageSummary,
  type ToReachDone,
  type Urgency,
} from '@/lib/ops/roadmap-progress'
import { cn } from '@/lib/utils'

/**
 * D1 · Roadmap progress card (doc 13 §7).
 *
 * Read-mostly and full-width at the top of `/admin/dev`. Editing items happens
 * in a side sheet later; nothing here mutates.
 */

const URGENCY_STYLE: Record<Urgency, string> = {
  none: 'text-muted',
  calm: 'text-muted',
  soon: 'text-warn',
  // Crimson, never orange, for something already missed (docs/08 §6).
  overdue: 'text-danger',
}

function daysLabel(days: number | null): string {
  if (days === null) return 'No target date'
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

function StageDots({ stages }: { stages: readonly StageSummary[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Stages">
      {stages.map((stage) => (
        <li
          key={stage.stage}
          title={`${stage.label} — ${stage.percent}%`}
          className={cn(
            'size-2 rounded-pill',
            stage.state === 'done' && 'bg-ok',
            stage.state === 'active' && 'bg-primary ring-2 ring-tint-300',
            stage.state === 'todo' && 'bg-line',
          )}
        >
          <span className="sr-only">{`${stage.label}: ${stage.state}`}</span>
        </li>
      ))}
    </ol>
  )
}

const KIND_ICON = {
  gate: AlertTriangle,
  blocked: CircleDot,
  roadmap: ListChecks,
} as const

function ToReachDoneList({ entries }: { entries: readonly ToReachDone[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Nothing is in the way — the stage is done once its items are.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => {
        const Icon = KIND_ICON[entry.kind]
        return (
          <li key={entry.key} className="flex items-start gap-2 text-[13px]">
            <Icon
              size={15}
              strokeWidth={1.9}
              aria-hidden
              className={cn(
                'mt-[3px] shrink-0',
                entry.kind === 'gate' && 'text-danger',
                entry.kind === 'blocked' && 'text-danger',
                entry.kind === 'roadmap' && 'text-muted',
              )}
            />
            {entry.href ? (
              <a
                href={entry.href}
                className="rounded-input text-ink underline decoration-line underline-offset-2 transition-micro hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {entry.label}
              </a>
            ) : (
              <span className="text-ink">{entry.label}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="roadmap-heading"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
    >
      {children}
    </section>
  )
}

export async function RoadmapCard() {
  const [items, tasks, gates] = await Promise.all([readRoadmapItems(), readTasks(), readGateRuns()])

  if (items.status !== 'ok') {
    return (
      <Shell>
        <h2 id="roadmap-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Roadmap progress
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          We couldn&apos;t read the roadmap just now. Nothing is wrong with the plan — this is our
          read failing. Reload to try again.
        </p>
        {items.eventId ? (
          <p className="mt-2 font-mono text-[11px] text-faint">Reference {items.eventId}</p>
        ) : null}
      </Shell>
    )
  }

  const stages = summarise(items.data)
  const currentCode = currentStage(items.data)
  const stage = stages.find((entry) => entry.stage === currentCode) ?? null
  const journey = journeyPercent(items.data)

  // The nearest deadline in the current stage. Items carry their own targets and
  // most carry none; the soonest is the one that bites first.
  const target =
    stage?.openItems
      .map((item) => item.target_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null
  // One clock for the whole card: the deadline and the gate age must not be
  // read a few milliseconds apart and disagree about what day it is.
  const now = new Date()
  const days = daysRemaining(target, now)

  // A failed tasks/gates read must not blank the card — the progress bar above
  // is still true. It DOES mean the checklist below is incomplete, and that is
  // stated rather than left to look like "nothing is in the way".
  const partial = tasks.status !== 'ok' || gates.status !== 'ok'
  const blockedTasks =
    tasks.status === 'ok'
      ? tasks.data
          .filter((task) => task.blocked)
          .map(({ code, title, blocked_reason }) => ({ code, title, blocked_reason }))
      : []
  // Same definition of "red" the gates strip uses, from the same function. Two
  // places deciding independently what counts as a failing suite is how the
  // strip and the checklist end up disagreeing on screen.
  const redSuites =
    gates.status === 'ok' ? redSuitesFrom(gateChips([...GATE_SUITES], gates.data)) : []

  const entries = toReachDone({ stage, blockedTasks, redSuites })

  return (
    <Shell>
      {/* Leads the card. This is the number that decides whether anything else
          on this page matters, and it was previously findable only by reading a
          comment in the seed script. */}
      <div className="mb-4">
        <AlphaReadiness items={items.data} today={now} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="roadmap-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          {stage ? stage.label : 'Roadmap'}
        </h2>
        <span className="text-[13px] text-muted">
          {stage ? 'current stage' : 'every stage is complete'}
        </span>
        <span className={cn('ml-auto text-[13px] tabular-nums', URGENCY_STYLE[urgencyOf(days)])}>
          {daysLabel(days)}
        </span>
      </div>

      {stage ? (
        <>
          {/* Doc 16 §6: the headline answers "can a customer complete a
              journey and pay", so it is the WHOLE roadmap, not this stage. It
              used to be stage.percent, which read 60% while the roadmap stood
              at 22% — a bar past halfway when the answer is a quarter, which
              doc 15 §2 rule 3 forbids. The stage figure is still shown below,
              where its denominator is visible. */}
          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-valuenow={journey}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${journey}% ${JOURNEY_LABEL}`}
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-s2"
            >
              <div
                className="h-full rounded-pill bg-primary transition-micro"
                style={{ width: `${journey}%` }}
              />
            </div>
            <span className="text-[13px] font-semibold tabular-nums">{journey}%</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">{JOURNEY_LABEL}</p>
          <p className="mt-1.5 text-[12px] text-muted tabular-nums">
            {stage.label} stage: {stage.percent}% · {stage.doneWeight} of {stage.totalWeight} by
            weight · {stage.openItems.length} item
            {stage.openItems.length === 1 ? '' : 's'} open
          </p>
        </>
      ) : null}

      <div className="mt-4">
        <StageDots stages={stages} />
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-[13px] font-semibold">To reach Done</h3>
        <div className="mt-2">
          <ToReachDoneList entries={entries} />
        </div>
        {partial ? (
          <p className="mt-2 text-[12px] text-warn">
            This list is incomplete — we couldn&apos;t read{' '}
            {tasks.status !== 'ok' ? 'blocked cards' : 'test gates'} just now.
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <a
          href="#board"
          className="inline-flex items-center rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[.97]"
        >
          Open board
        </a>
      </div>
    </Shell>
  )
}
