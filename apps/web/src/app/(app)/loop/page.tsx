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
import { CycleSummary } from '@/components/loop/cycle-summary'
import { LoopStatus } from '@/components/loop/loop-status'
import { ResumeCreate } from '@/components/loop/resume-create'
import { PageTitle } from '@/components/page-title'
import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import { explain, remedy } from '@/lib/loop/eligibility'
import { readLoop } from '@/lib/loop/read'
import { readGoingOut } from '@/lib/loop/autopilot/going-out'
import { GOING_OUT_UNREADABLE } from '@/lib/loop/autopilot/going-out-copy'
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
  // Read alongside the Loop, not inside it: `readGoingOut` has its own failure
  // state, so a broken autopilot read cannot take the page down with it.
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
  // Approved and never finished: the create stage was refused, crashed, or the
  // tab closed between approving and writing. Without a control for this the
  // page showed "Running now" for ever (MEASURED 2026-09-06).
  const unfinished = cycle?.status === 'creating' || cycle?.status === 'staging'
  const unwrittenBriefs = unfinished
    ? snapshot.briefs.filter((b) => b.included && b.postId === null)
    : []
  const writtenBriefs = unfinished ? snapshot.briefs.filter((b) => b.postId !== null) : []

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
  // The same expression `LoopControls` disables its button with, plus the halt:
  // a week waiting for approval is not one to plan again.
  const canPlanByHand =
    !snapshot.paused && snapshot.connected.length > 0 && !running && !atHalt && !unfinished
  const refusal =
    verdict.eligible && autoSchedule === 'armed'
      ? null
      : {
          sentence: explain(verdict, { autoSchedule, canPlanByHand }),
          remedy: remedy(verdict),
        }

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <PageTitle sub="A weekly cycle that plans, writes, tests and reports, as far as you let it go on its own.">
          The Loop
        </PageTitle>
        <LoopStatus
          enabled={snapshot.enabled}
          paused={snapshot.paused}
          running={running}
          autoSchedule={autoSchedule}
        />
      </div>

      <CycleStrip status={cycle?.status as LoopCycleStatus | undefined} />

      {/* The cost preview is the whole point of the halt, so it sits above
          everything else the moment there is one to look at. */}
      {/* `already_planned`'s remedy links to `#loop-current`; at the halt this
          preview IS the current week, so it carries the anchor. */}
      {atHalt && cycle ? (
        <div id="loop-current">
          <CostPreview
            cycleId={cycle.id}
            briefs={snapshot.briefs}
            budgetCredits={cycle.budgetCredits}
            spentCredits={cycle.spentCredits}
          />
        </div>
      ) : null}

      {unfinished && cycle ? (
        <ResumeCreate
          cycleId={cycle.id}
          unwritten={unwrittenBriefs.length}
          unwrittenCredits={unwrittenBriefs.reduce((sum, b) => sum + b.estimatedCredits, 0)}
          written={writtenBriefs.length}
        />
      ) : null}

      <LoopControls
        paused={snapshot.paused}
        weeklyBudgetCredits={snapshot.weeklyBudgetCredits}
        cycleCost={creditCost('loop_cycle')}
        hasChannels={snapshot.connected.length > 0}
        cycleRunning={running || unfinished}
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
        {/* An unfinished cycle has its own panel above; "This week is running"
            under it would be the sentence this page showed for ever. */}
        {cycle && !atHalt && !unfinished ? (
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
