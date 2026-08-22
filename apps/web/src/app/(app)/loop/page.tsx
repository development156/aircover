import Link from 'next/link'
import {
  DEFAULT_AUTONOMY_LEVEL,
  creditCost,
  type AutonomyLevel,
  type LoopCycleStatus,
} from '@sahoda/shared'

import { AutonomyDial } from '@/components/loop/autonomy-dial'
import { CostPreview } from '@/components/loop/cost-preview'
import { CycleStrip } from '@/components/loop/cycle-strip'
import { KillSwitch } from '@/components/loop/kill-switch'
import { PendingLearnings } from '@/components/loop/learnings'
import { LoopControls } from '@/components/loop/controls'
import { PageTitle } from '@/components/page-title'
import { readLoop, type LoopSnapshot } from '@/lib/loop/read'

export const metadata = { title: 'The Loop' }

/**
 * THE LOOP — the weekly cycle, running.
 *
 * ── WHAT CHANGED FROM THE ROADMAP VERSION, AND WHY THE OLD COPY HAD TO GO ────
 * wt-ia drew this page whole and said, in four separate places, that nothing on
 * it was real: no cycle, no Sunday job, no Monday report, and "no autonomy level
 * is stored anywhere". Every one of those sentences was true and every one is
 * now false. Leaving them would have been the same failure in the other
 * direction — a page understating what the product does is as wrong as one
 * overstating it, and it is the kind of wrong that survives longer because
 * nobody complains about it.
 *
 * The DESIGN is wt-ia's throughout: the seven-stage line, the ladder, the
 * reading-measure prose. What is new is state.
 *
 * ── STILL NOT ONE INVENTED FIGURE ────────────────────────────────────────────
 * Every number on this page is a credit price out of pricing.config.json, a
 * count of rows, or a sum of the two. There is no predicted reach, no expected
 * engagement, no score — each would be a claim about the reader's business that
 * no query behind this page has earned.
 */
export default async function LoopPage() {
  const read = await readLoop()

  // Two answers, two sentences, two remedies. `getActiveWorkspace()` collapsed
  // them into one null and this page said "Finish setting up your workspace" to
  // both — which, on the arm where the read failed, tells a customer who has a
  // workspace to make another one.
  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <PageTitle sub="A weekly cycle that plans, writes, tests and reports — as far as you let it go on its own.">
          The Loop
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          {read.status === 'no-workspace'
            ? 'Finish setting up your workspace and the Loop appears here.'
            : 'Sahoda couldn’t read your Loop just now, so nothing below would be true. Try again in a moment — your cycle and its settings are unchanged.'}
        </p>
      </div>
    )
  }

  const snapshot = read.snapshot
  const cycle = snapshot.cycle
  const atHalt = cycle?.status === 'awaiting_cost_approval'

  const chosen: Record<string, AutonomyLevel> = {}
  for (const [channel, level] of snapshot.dial) chosen[channel] = level

  return (
    <div className="space-y-grid">
      <PageTitle sub="A weekly cycle that plans, writes, tests and reports — as far as you let it go on its own.">
        The Loop
      </PageTitle>

      <CycleStrip status={cycle?.status as LoopCycleStatus | undefined} />

      <LoopControls
        paused={snapshot.paused}
        weeklyBudgetCredits={snapshot.weeklyBudgetCredits}
        cycleCost={creditCost('loop_cycle')}
        hasChannels={snapshot.connected.length > 0}
        cycleRunning={Boolean(cycle) && !atHalt && !isOver(cycle?.status)}
      />

      {/* The cost preview is the whole point of the halt, so it sits above
          everything else the moment there is one to look at. */}
      {atHalt && cycle ? (
        <CostPreview
          cycleId={cycle.id}
          briefs={snapshot.briefs}
          budgetCredits={cycle.budgetCredits}
          spentCredits={cycle.spentCredits}
        />
      ) : null}

      {cycle && !atHalt ? <CycleSummary cycle={cycle} briefCount={snapshot.briefs.length} /> : null}

      <PendingLearnings learnings={snapshot.learnings} />

      <AutonomyDial
        connected={snapshot.connected}
        lapsed={snapshot.lapsed}
        chosen={chosen}
        defaultLevel={DEFAULT_AUTONOMY_LEVEL}
      />

      <KillSwitch />
    </div>
  )
}

function isOver(status: string | undefined): boolean {
  return status === 'reported' || status === 'cancelled' || status === 'failed'
}

/**
 * Where the current cycle got to, in sentences.
 *
 * ── THE REFLECT LINE IS THREE DIFFERENT SENTENCES ────────────────────────────
 * "Sahoda had nothing to reflect on" and "Sahoda reflected and found nothing
 * worth saying" are different claims, and only one of them is an admission that
 * the product has no history yet. `reflect_skipped_no_history` is a stored
 * column precisely so this line is a lookup rather than an inference.
 */
function CycleSummary({
  cycle,
  briefCount,
}: {
  cycle: NonNullable<LoopSnapshot['cycle']>
  briefCount: number
}) {
  const failed = cycle.status === 'failed'
  const cancelled = cycle.status === 'cancelled'

  return (
    <section aria-labelledby="loop-current" className="surface-ring rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="loop-current" className="type-h2">
          {cancelled
            ? 'This week was stopped'
            : failed
              ? 'This week did not run'
              : cycle.status === 'reported'
                ? 'This week is done'
                : 'This week is running'}
        </h2>
        <p className="type-sm num text-muted">
          Week {cycle.isoWeek}, {cycle.isoYear}
        </p>
      </div>

      {failed && cycle.failureReason === 'CHANNELS_UNREADABLE' ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda couldn’t check which channels you have connected, so it stopped rather than
          planning for the wrong ones. Nothing was charged. Run it again.
        </p>
      ) : failed && cycle.failureReason === 'NO_CHANNELS' ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda has nowhere to plan for.{' '}
          <Link href="/connections" className="font-[550] text-accent underline underline-offset-2">
            Connect a channel
          </Link>{' '}
          and run it again. Nothing was charged.
        </p>
      ) : failed ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda could not finish planning this week, and you were not charged for the part that
          failed.
        </p>
      ) : cancelled ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          You stopped this cycle. Anything it had written is still in your Planner.
        </p>
      ) : (
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Sahoda planned <span className="num">{briefCount}</span>{' '}
          {briefCount === 1 ? 'post' : 'posts'} for this week.
        </p>
      )}

      {!failed && !cancelled ? (
        <p className="type-sm mt-2 text-muted">
          {cycle.reflectSkippedNoHistory
            ? 'It had nothing to reflect on — no post of yours has been measured yet, so there was nothing to learn from.'
            : 'It read last week’s numbers before planning.'}
        </p>
      ) : null}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex gap-2">
          <dt className="type-sm text-muted">Spent this cycle</dt>
          <dd className="type-sm num text-ink">{cycle.spentCredits} cr</dd>
        </div>
        {cycle.budgetCredits !== null ? (
          <div className="flex gap-2">
            <dt className="type-sm text-muted">Weekly budget</dt>
            <dd className="type-sm num text-ink">{cycle.budgetCredits} cr</dd>
          </div>
        ) : null}
      </dl>

      {cycle.status === 'reported' ? (
        <p className="type-sm mt-3">
          <Link href="/report" className="font-[550] text-accent underline underline-offset-2">
            Read the report for this week
          </Link>
        </p>
      ) : null}
    </section>
  )
}
