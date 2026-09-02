import { AlertTriangle, CircleDot, ListChecks } from 'lucide-react'

import { AlphaChip } from '@/components/admin/alpha-chip'
import {
  BlockedPanel,
  CannotProvePanel,
  FreshnessLine,
  NextPanel,
  Panel,
  ShippedPanel,
  WaitingPanel,
} from '@/components/admin/hero-sections'
import { cannotProve } from '@/lib/ops/cannot-prove'
import { freshnessOf } from '@/lib/ops/freshness'
import { blockedNow, shippedThisWeek, whatsNext } from '@/lib/ops/hero'
import {
  GATE_SUITES,
  readGateRuns,
  readLastSyncedAt,
  readRoadmapItems,
  readTasks,
} from '@/lib/ops/read'
import {
  currentStage,
  daysRemaining,
  JOURNEY_LABEL,
  journeyPercent,
  summarise,
  toReachDone,
  urgencyOf,
  type StageSummary,
  type ToReachDone,
  type Urgency,
} from '@/lib/ops/roadmap-progress'
import { gateChips, redSuitesFrom } from '@/lib/ops/session-pulse'
import { WAITING_ON } from '@/lib/ops/waiting'
import { cn } from '@/lib/utils'

/**
 * THE HERO CARD (SL-062 §1) — progress leads the page.
 *
 * It is the one region that is never collapsed, because it is the answer to
 * "where are we" and everything else on the page is detail underneath it. It
 * carries, in this order: how far along, which stage, days left, the Alpha
 * verdict as a red chip, what stands between here and Done, what shipped, what
 * is blocked and why, what is next, who is waiting on whom, and what we cannot
 * yet prove — with the last-synced figure top-right, because a stale board
 * makes every other number on it untrustworthy.
 *
 * DELIBERATELY ABSENT: velocity, burndown, raw test counts.
 */

const URGENCY_STYLE: Record<Urgency, string> = {
  none: 'text-muted',
  calm: 'text-muted',
  soon: 'text-warn',
  overdue: 'text-danger',
}

function daysLabel(days: number | null): string {
  if (days === null) return 'No target date'
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
  if (days === 0) return 'Due today'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}

const KIND_ICON = { gate: AlertTriangle, blocked: CircleDot, roadmap: ListChecks } as const

function ToReachDoneList({ entries }: { entries: readonly ToReachDone[] }) {
  if (entries.length === 0) {
    return <p className="text-[12px] text-muted">Nothing is in the way of this stage.</p>
  }

  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => {
        const Icon = KIND_ICON[entry.kind]
        return (
          <li key={entry.key} className="flex items-start gap-2 text-[12px] leading-[17px]">
            <Icon
              size={13}
              strokeWidth={1.9}
              aria-hidden
              className={cn(
                'mt-[2px] shrink-0',
                entry.kind === 'roadmap' ? 'text-muted' : 'text-danger',
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
      aria-labelledby="hero-heading"
      className="rounded-card border border-line bg-bg p-5 shadow-card"
    >
      {children}
    </section>
  )
}

function StageDots({ stages }: { stages: readonly StageSummary[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Stages">
      {stages.map((stage) => (
        <li
          key={stage.stage}
          title={`${stage.label}: ${stage.percent}%`}
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

export async function HeroCard() {
  const [items, tasks, gates, syncedAt] = await Promise.all([
    readRoadmapItems(),
    readTasks(),
    readGateRuns(),
    readLastSyncedAt(),
  ])

  // One clock for the whole card: the deadline, the gate age and the freshness
  // figure must not be read milliseconds apart and disagree about what day it is.
  const now = new Date()
  const freshness = freshnessOf(syncedAt.status === 'ok' ? syncedAt.data : null, now)

  if (items.status !== 'ok') {
    return (
      <Shell>
        <h2 id="hero-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Progress
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          We couldn&apos;t read the roadmap just now. Nothing is wrong with the plan. This is our
          read failing. Reload to try again.
        </p>
        {items.eventId ? (
          <p className="mt-2 font-mono text-[11px] text-muted">Reference {items.eventId}</p>
        ) : null}
      </Shell>
    )
  }

  const stages = summarise(items.data)
  const stage = stages.find((entry) => entry.stage === currentStage(items.data)) ?? null
  const journey = journeyPercent(items.data)

  const target =
    stage?.openItems
      .map((item) => item.target_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null
  const days = daysRemaining(target, now)

  // A failed tasks/gates read must not blank the card — the progress bar is
  // still true. It DOES mean the lists below are incomplete, and that is stated
  // rather than left to look like "nothing is in the way".
  const partial = tasks.status !== 'ok' || gates.status !== 'ok'
  const allTasks = tasks.status === 'ok' ? tasks.data : []

  const blocked = blockedNow(allTasks)
  const shipped = shippedThisWeek(allTasks, now)
  const { next, remaining } = whatsNext(allTasks)

  // The same definition of "red" the gates strip uses, from the same function.
  const redSuites =
    gates.status === 'ok' ? redSuitesFrom(gateChips([...GATE_SUITES], gates.data)) : []

  const entries = toReachDone({
    stage,
    blockedTasks: allTasks
      .filter((task) => task.blocked)
      .map(({ code, title, blocked_reason }) => ({ code, title, blocked_reason })),
    redSuites,
  })

  // Only the entries whose card is still on the board. A recorded list rots,
  // and one naming a card that has closed would send somebody chasing a person
  // who is no longer holding anything up.
  const liveCodes = new Set(allTasks.map((task) => task.code))
  const waiting = WAITING_ON.filter((entry) => liveCodes.has(entry.code))

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="hero-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          {stage ? stage.label : 'Roadmap'}
        </h2>
        <span className="text-[12px] text-muted">
          {stage ? 'current stage' : 'every stage is complete'}
        </span>
        <span className={cn('text-[12px] tabular-nums', URGENCY_STYLE[urgencyOf(days)])}>
          · {daysLabel(days)}
        </span>
        {/* Top-right, on the same line as the stage — the first thing read
            after the headline, because it decides whether the headline is
            worth reading (SL-061). */}
        <span className="ml-auto">
          <FreshnessLine freshness={freshness} />
        </span>
      </div>

      {/* THE NUMBER. Whole-roadmap, not this stage: nobody reads a figure this
          size as "we are 60% through this stage" — they read it as "the product
          is 60% done" (doc 16 §6). */}
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums">
          {journey}%
        </span>
        <p className="max-w-[26rem] pb-1 text-[13px] leading-[18px] text-muted">{JOURNEY_LABEL}</p>
      </div>

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
        <StageDots stages={stages} />
      </div>

      {stage ? (
        <p className="mt-1.5 text-[12px] text-muted tabular-nums">
          {stage.label} stage: {stage.percent}% · {stage.doneWeight} of {stage.totalWeight} by
          weight · {stage.openItems.length} item{stage.openItems.length === 1 ? '' : 's'} open
        </p>
      ) : null}

      {/* Demoted to a chip, still crimson, still here. */}
      <div className="mt-4">
        {/* Read HERE, in the server component, and passed down: `AlphaChip`
            stays pure so its tests are deterministic, and the env read stays
            off the client. Turbo passes VERCEL_GIT_COMMIT_SHA through as a
            system var — see `turbo-env-wiring.test.ts`, which deliberately
            keeps it OUT of the build allowlist so it cannot bust the cache. */}
        <AlphaChip items={items.data} today={now} deployedSha={process.env.VERCEL_GIT_COMMIT_SHA} />
      </div>

      <div className="mt-4 grid gap-3 narrow:grid-cols-2 wide:grid-cols-3">
        <Panel
          title="To reach Done"
          icon={ListChecks}
          red={entries.some((e) => e.kind !== 'roadmap')}
        >
          <ToReachDoneList entries={entries} />
          {partial ? (
            <p className="mt-2 text-[11px] text-warn">
              This list is incomplete. We couldn&apos;t read{' '}
              {tasks.status !== 'ok' ? 'the board' : 'the test record'} just now.
            </p>
          ) : null}
        </Panel>

        <BlockedPanel cards={blocked} />
        <WaitingPanel entries={waiting} />
        <ShippedPanel cards={shipped} />
        <NextPanel cards={next} remaining={remaining} />
        <CannotProvePanel claims={cannotProve(gates.status === 'ok' ? gates.data : null)} />
      </div>

      <div className="mt-4">
        <a
          href="#board"
          className="inline-flex items-center rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-primary-strong-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[.97]"
        >
          Open board
        </a>
      </div>
    </Shell>
  )
}
