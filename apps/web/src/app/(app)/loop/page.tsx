import Link from 'next/link'
import {
  DEFAULT_AUTONOMY_LEVEL,
  creditCost,
  type AutonomyLevel,
  type LoopCycleStatus,
} from '@sahoda/shared'

import { AutonomyDial } from '@/components/loop/autonomy-dial'
import { AutopilotLimits } from '@/components/loop/autopilot-limits'
import { CostPreview } from '@/components/loop/cost-preview'
import { CycleStrip } from '@/components/loop/cycle-strip'
import { GoingOut } from '@/components/loop/going-out'
import { KillSwitch } from '@/components/loop/kill-switch'
import { PendingLearnings } from '@/components/loop/learnings'
import { LoopControls } from '@/components/loop/controls'
import { LoopStatus } from '@/components/loop/loop-status'
import { PageTitle } from '@/components/page-title'
import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import { explain, remedy } from '@/lib/loop/eligibility'
import { readLoop, type LoopSnapshot } from '@/lib/loop/read'
import { readGoingOut } from '@/lib/loop/autopilot/going-out'
import { GOING_OUT_UNREADABLE } from '@/lib/loop/autopilot/going-out-copy'
import { reflectSentence } from '@/lib/loop/reflect'
import {
  LOOP_SCHEDULE_SENTENCE,
  cycleDuration,
  formatRunMoment,
  formatStoredMoment,
  nextLoopRun,
} from '@/lib/loop/schedule'
import { loopVerdict } from '@/lib/loop/verdict'

export const metadata = { title: 'The Loop' }

/**
 * THE LOOP — the weekly cycle, running.
 *
 * ── STILL NOT ONE INVENTED FIGURE ────────────────────────────────────────────
 * Every number on this page is a credit price out of pricing.config.json, a
 * count of rows, a stored timestamp, or the deployment's own cron expression.
 * There is no predicted reach, no expected engagement, no score — each would be
 * a claim about the reader's business that no query behind this page has earned.
 *
 * ── THE 2026-08-29 REDRAW ────────────────────────────────────────────────────
 * Six sections each wearing the same bordered card made a page with no shape:
 * the seven-step cycle, which is the product, carried exactly the weight of the
 * budget field. So the strip became the hero, the controls absorbed the separate
 * cycle-summary card, pause moved up beside the title where "is this running" is
 * actually asked, and the stop switch is the only thing on the page wearing a
 * different colour.
 *
 * Nothing was removed. Every sentence, remedy, refusal and empty state on the
 * old page is still on this one — checked against `no-impossible-remedy` and the
 * component tests, which pin the claims rather than the wording.
 *
 * One thing was ADDED, and it is information rather than decoration: the page
 * never said WHEN the weekly plan happens. It does now, from the same cron the
 * deployment runs, pinned by `lib/loop/schedule.test.ts`.
 */
export default async function LoopPage() {
  // Read alongside the Loop, not inside it. `readLoop`'s dial is typed with
  // `AutonomyLevel`, which admits only 0-2, so an armed channel is invisible
  // through it; `readGoingOut` reads the stored integer. Its own failures
  // resolve to a state rather than throwing, so this cannot take the page down.
  const [read, goingOut] = await Promise.all([readLoop(), readGoingOut()])

  // Two answers, two sentences, two remedies. `getActiveWorkspace()` collapsed
  // them into one null and this page said "Finish setting up your workspace" to
  // both — which, on the arm where the read failed, tells a customer who has a
  // workspace to make another one.
  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <PageTitle sub="A weekly cycle that plans, writes, tests and reports, as far as you let it go on its own.">
          The Loop
        </PageTitle>
        <p className="surface-ring rounded-card bg-surface p-5 type-body text-muted max-narrow:p-4">
          {read.status === 'no-workspace'
            ? 'Finish setting up your workspace and the Loop appears here.'
            : 'Sahoda couldn’t read your Loop just now, so nothing below would be true. Try again in a moment. Your cycle and its settings are unchanged.'}
        </p>
      </div>
    )
  }

  const snapshot = read.snapshot
  const cycle = snapshot.cycle
  const atHalt = cycle?.status === 'awaiting_cost_approval'
  const running = Boolean(cycle) && !atHalt && !isOver(cycle?.status)

  const chosen: Record<string, AutonomyLevel> = {}
  for (const [channel, level] of snapshot.dial) chosen[channel] = level

  // ── WHY THE LOOP WILL OR WILL NOT PLAN, IN A SENTENCE ─────────────────────
  // The same `assess()` the Sunday cron uses, so the screen and the schedule
  // cannot disagree. An eligible workspace gets no notice here — the button is
  // enabled and its own line already says where the cycle stops.
  //
  // The verdict answers "would the Loop plan for this business". It cannot
  // answer "is anything going to ask it on Sunday", and for as long as nothing
  // here consulted the switch, this screen promised a weekly plan to workspaces
  // in an environment where the Sunday job returns before reading anything. The
  // switch defaults OFF because that job spends 20 credits per workspace.
  const autoSchedule = loopCronEnabled() ? ('armed' as const) : ('off' as const)
  const verdict = loopVerdict(snapshot, new Date())
  const refusal =
    verdict.eligible && autoSchedule === 'armed'
      ? null
      : { sentence: explain(verdict, { autoSchedule }), remedy: remedy(verdict) }

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <PageTitle sub="A weekly cycle that plans, writes, tests and reports, as far as you let it go on its own.">
          The Loop
        </PageTitle>
        <LoopStatus enabled={snapshot.enabled} paused={snapshot.paused} running={running} />
      </div>

      <CycleStrip status={cycle?.status as LoopCycleStatus | undefined} />

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

      <LoopControls
        paused={snapshot.paused}
        weeklyBudgetCredits={snapshot.weeklyBudgetCredits}
        cycleCost={creditCost('loop_cycle')}
        hasChannels={snapshot.connected.length > 0}
        cycleRunning={running}
        refusal={refusal}
        /* ── THE FACET HAD TO MOVE WITH THE SENTENCE ──────────────────────
           These were passed unconditionally, so with the cron off the same card
           read "Sahoda is not planning weeks automatically at the moment" in one
           column and "Schedule: Every Sunday / Next run 7 Sept 2026" in the
           next. The fix reached the refusal sentence and left the facet making
           the same promise, more concretely.

           The facet STAYS rather than disappearing: "when does this run" is a
           question the reader still has, and a missing row answers it with
           nothing. There is no next run to name, so none is claimed. */
        scheduleSentence={
          autoSchedule === 'armed' ? LOOP_SCHEDULE_SENTENCE : 'Not running automatically'
        }
        nextRunAt={autoSchedule === 'armed' ? formatRunMoment(nextLoopRun(new Date())) : undefined}
        run={
          cycle
            ? {
                spentCredits: cycle.spentCredits,
                budgetCredits: cycle.budgetCredits,
                startedAt: formatStoredMoment(cycle.startedAt),
                duration: cycleDuration(cycle.startedAt, cycle.reportedAt),
              }
            : null
        }
      >
        {cycle && !atHalt ? (
          <CycleSummary cycle={cycle} briefCount={snapshot.briefs.length} />
        ) : null}
      </LoopControls>

      <PendingLearnings learnings={snapshot.learnings} />

      <AutonomyDial
        connected={snapshot.connected}
        lapsed={snapshot.lapsed}
        chosen={chosen}
        defaultLevel={DEFAULT_AUTONOMY_LEVEL}
      />

      {/* Directly under the dial, because these two numbers only mean anything
          once a channel is set to L3, and a reader who has just chosen that
          needs to see them before anything else. Shown whether or not one is
          armed: they are what WOULD hold, and a limit nobody can see before
          they need it is a limit set on their behalf. */}
      <AutopilotLimits
        dailyCap={snapshot.autopilotDailyCap}
        cancelMinutes={snapshot.autopilotCancelMinutes}
        armed={[...snapshot.dial.values()].some((level) => level === 3)}
      />

      {/* Between the dial that grants the permission and the switch that
          revokes everything: what that permission means right now. A reader who
          has armed nothing learns the setting exists; a reader who has armed
          something sees exactly what is in the window. */}
      {goingOut.status === 'no-workspace' ? null : (
        <GoingOut
          view={goingOut.status === 'ready' ? goingOut.view : GOING_OUT_UNREADABLE}
          waiting={goingOut.status === 'ready' ? goingOut.waiting : []}
        />
      )}

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
 *
 * It sits INSIDE the controls panel now rather than in a card of its own. The
 * card was the same shape as the panel above it and said, by that shape, that
 * these were two unrelated things; they are the same thing — what the Loop is
 * doing, and the controls for it.
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
    <div className="border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* `already_planned`'s remedy links here by id. Deleting it made
            "Review this week" scroll nowhere — a remedy that cannot work. */}
        <h3 id="loop-current" className="type-h3 text-ink">
          {cancelled
            ? 'This week was stopped'
            : failed
              ? 'This week did not run'
              : cycle.status === 'reported'
                ? 'This week is done'
                : 'This week is running'}
        </h3>
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
        <p className="type-sm mt-2 max-w-[68ch] text-muted">
          {/*
            The stored reason first, because it is the specific one. The
            boolean is the fallback for cycles that ran before `reflect_reason`
            existed, and the last sentence is for a cycle that DID produce a
            learning — three different facts, and the screen used to have two
            sentences for all three.
          */}
          {reflectSentence(cycle.reflectReason) ??
            (cycle.reflectSkippedNoHistory
              ? 'It had nothing to reflect on. No post of yours has been measured yet, so there was nothing to learn from.'
              : 'It read last week’s numbers before planning.')}
        </p>
      ) : null}

      {cycle.status === 'reported' ? (
        <p className="type-sm mt-3">
          <Link href="/report" className="font-[550] text-accent underline underline-offset-2">
            Read the report for this week
          </Link>
        </p>
      ) : null}
    </div>
  )
}
