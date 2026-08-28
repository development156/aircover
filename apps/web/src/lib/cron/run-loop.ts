import 'server-only'

import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, planWeekTask } from '@sahoda/mesh'
import { MESH_TASK_ACTION, toChannelSet, type AutonomyLevel, type Channel } from '@sahoda/shared'

import { previewCost, priceBrief, cycleCost } from '@/lib/loop/cost'
import { countConfirmedFields } from '@/lib/brand/confirmed-count'
import { RING_DENOMINATOR } from '@/lib/brand/fields'
import { LOOP_FACTS_SQL } from '@/lib/cron/loop-facts-sql'
import { assess, explain, type LoopFacts, type LoopRefusalReason } from '@/lib/loop/eligibility'
import { planningWeekFor, reflectionWindow } from '@/lib/loop/iso-week'
import { isLoopRef, newLoopCycleRef } from '@/lib/loop/object-ref'
import { reflect } from '@/lib/loop/reflect'
import * as store from '@/lib/loop/store'
import { normalizeSlot } from '@/lib/planner/slots'
import { reportServerError } from '@/lib/observability/report'

/**
 * ONE SUNDAY TICK — open a cycle for every eligible workspace, plan its week,
 * and stop at the cost preview.
 *
 * ── ELIGIBILITY IS OPT-IN, NOT OPT-OUT ───────────────────────────────────────
 * A workspace is eligible only if it has a `loop_settings` row that is not
 * paused. A workspace that has never opened the Loop screen has NO SUCH ROW and
 * is skipped — so deploying this does not start charging every workspace in the
 * database. Turning the Loop on is a deliberate act with a row behind it, and
 * that row is what this reads.
 *
 * ── WHY THE WORK IS BOUNDED PER TICK ─────────────────────────────────────────
 * Vercel gives a serverless function a wall clock, and each cycle here makes a
 * paid model call that measured 14 seconds. Whatever does not fit is left for
 * the next tick — which for a weekly job is a week away, so the cap is set high
 * enough that it is a backstop and not a schedule. If it ever binds, the count
 * is RETURNED rather than swallowed: a silent truncation reads as "everyone was
 * planned" when it was not.
 */

/** Enough for every workspace this product has, several times over. */
const MAX_WORKSPACES_PER_TICK = 40

/** One workspace's outcome, in the words a person would use. */
export interface LoopWorkspaceOutcome {
  workspaceId: string
  /** `planned` when a cycle opened and was paid for; otherwise why not. */
  outcome: 'planned' | 'failed' | LoopRefusalReason
  /** The sentence /loop should render. Never a code, never a boolean. */
  message: string
}

export interface LoopCronResult {
  eligible: number
  planned: number
  failed: number
  /** Workspaces that did not fit in this tick. Reported, never hidden. */
  deferred: number
  /**
   * EVERY WORKSPACE LOOKED AT, AND WHAT HAPPENED TO IT.
   *
   * The tick used to answer `eligible: 1, planned: 0` and nothing else, which is
   * true and useless: it cannot tell a fleet that is working from a fleet where
   * every workspace is paused. This is the same run, itemised.
   */
  outcomes: LoopWorkspaceOutcome[]
}

export interface LoopTickOptions {
  /**
   * Epoch ms after which no NEW workspace is started. Work already begun is
   * allowed to finish; what was never begun is counted as `deferred`.
   *
   * Passed in by the route rather than read here, because the route is what the
   * platform kills and therefore the only place that knows the real budget.
   * Absent, the tick is unbounded — which is right for a script run by hand.
   */
  deadline?: number
  /** Injectable clock, so the deadline is testable without waiting. */
  monotonicNow?: () => number
}

export async function runScheduledLoopCycles(
  now = new Date(),
  options: LoopTickOptions = {},
): Promise<LoopCronResult> {
  const { databaseUrl } = loadBillingEnv()

  // ── ONE POOL FOR THE WHOLE TICK. ─────────────────────────────────────────
  // `planOneWorkspace` used to call `createPgLedgerPort` itself, once per
  // workspace, and every one of those calls is `new Pool({ max: 10 })` that is
  // never closed. At one workspace that is invisible; at fifty it is fifty-one
  // pools and up to 510 connections opened by a single scheduled request, held
  // until the function is torn down. A long run holding pools is how a cron
  // takes a database down.
  //
  // The port already accepts an existing pool and only ends one it OWNS, so the
  // fix is to make exactly one and hand it down.
  const ledger = createPgLedgerPort({ connectionString: databaseUrl })

  try {
    const week = planningWeekFor(now)

    // ── EVERY WORKSPACE, NOT EVERY loop_settings ROW. ──────────────────────
    // The old query read `loop_settings where paused = false`, so a workspace
    // that has never opened the Loop screen HAS NO ROW and never appeared at
    // all. MEASURED 2026-08-23: that is almost the entire fleet — two
    // workspaces have ever opened it. A function that reads from
    // `loop_settings` cannot answer "why not" for the workspaces that most need
    // asking, which is why this is a LEFT JOIN and why `never_enabled` is a
    // reason of its own rather than being folded into `paused`.
    const rows = (
      await ledger.pool.query<{
        workspace_id: string
        paused: boolean | null
        weekly_budget_credits: number | null
        available_credits: string | null
        open_cycle_id: string | null
        open_cycle_status: string | null
        connections: { platform: string; status: string }[] | null
        dial: { channel: Channel; level: AutonomyLevel }[] | null
        brain_payload: unknown
      }>(LOOP_FACTS_SQL, [week.isoYear, week.isoWeek, MAX_WORKSPACES_PER_TICK + 1])
    ).rows

    const considered = rows.slice(0, MAX_WORKSPACES_PER_TICK)
    const deferred =
      rows.length > MAX_WORKSPACES_PER_TICK ? rows.length - MAX_WORKSPACES_PER_TICK : 0

    const outcomes: LoopWorkspaceOutcome[] = []
    let planned = 0
    let failed = 0
    let eligible = 0

    const clock = options.monotonicNow ?? (() => Date.now())
    let ranOutOfTime = 0

    for (const row of considered) {
      // ── STOP STARTING WHAT CANNOT FINISH. ─────────────────────────────────
      // Checked BEFORE the verdict, so a workspace that is merely being
      // explained still costs nothing, and before any write, so a truncated tick
      // never leaves a half-opened cycle behind. The remainder is COUNTED — a
      // silent truncation reads as "everyone was planned" when they were not.
      if (options.deadline !== undefined && clock() >= options.deadline) {
        ranOutOfTime += 1
        continue
      }

      const facts: LoopFacts = {
        workspaceId: row.workspace_id,
        settings:
          row.paused === null
            ? null
            : { paused: row.paused, weeklyBudgetCredits: row.weekly_budget_credits ?? 0 },
        connections: row.connections ?? [],
        // A workspace with no balance row has no credits, not unlimited ones.
        availableCredits: Number(row.available_credits ?? 0),
        planningWeek: { isoYear: week.isoYear, isoWeek: week.isoWeek },
        openCycle: row.open_cycle_id
          ? { id: row.open_cycle_id, status: row.open_cycle_status ?? 'unknown' }
          : null,
        dial: row.dial ?? [],
        // `brain_payload` is null when no ACTIVE brand_memory row exists, which
        // is exactly what `brain_not_resolved` means. The confirmed count uses
        // the same function /brain's ring uses, so the cron and the screen
        // cannot report different fractions of one brain.
        brain: {
          resolved: row.brain_payload !== null && row.brain_payload !== undefined,
          confirmed: countConfirmedFields(row.brain_payload),
          total: RING_DENOMINATOR,
        },
      }

      const verdict = assess(facts)
      if (!verdict.eligible) {
        outcomes.push({
          workspaceId: row.workspace_id,
          outcome: verdict.reason,
          message: explain(verdict),
        })
        continue
      }

      eligible += 1
      try {
        const ok = await planOneWorkspace(
          ledger,
          verdict.workspaceId,
          verdict.channels,
          verdict.weeklyBudgetCredits,
          now,
        )
        if (ok) {
          planned += 1
          outcomes.push({
            workspaceId: row.workspace_id,
            outcome: 'planned',
            message: explain(verdict),
          })
        } else {
          // Eligible a moment ago and not planned now means something raced or
          // the charge was refused. Named as `failed` rather than reported as
          // one of the refusal reasons, because none of them is true.
          failed += 1
          outcomes.push({
            workspaceId: row.workspace_id,
            outcome: 'failed',
            message: 'Sahoda could not finish planning this week — nothing was charged.',
          })
        }
      } catch (error) {
        failed += 1
        // One workspace's failure must not stop the others. Reported per
        // workspace so a single broken tenant is visible rather than absorbed
        // into a route-level 500 that says nothing about which.
        reportServerError(error, { action: 'cron.loop.workspace', workspaceId: row.workspace_id })
        outcomes.push({
          workspaceId: row.workspace_id,
          outcome: 'failed',
          message: 'Sahoda could not finish planning this week — nothing was charged.',
        })
      }
    }

    return { eligible, planned, failed, deferred: deferred + ranOutOfTime, outcomes }
  } finally {
    // The pool this function made is the pool this function closes.
    await ledger.close()
  }
}

/** Collect → reflect → plan → halt, for one workspace. Returns false when skipped. */
async function planOneWorkspace(
  ledger: ReturnType<typeof createPgLedgerPort>,
  workspaceId: string,
  channels: readonly Channel[],
  budgetCredits: number,
  now: Date,
): Promise<boolean> {
  // The channels arrive already decided. `assess` chose them from the same
  // `status = 'active'` rule this used to apply here — 'active' being the value
  // `upsert_connection` writes, and one of the four the CHECK admits
  // ('active','expired','revoked','error'). An earlier version asked for
  // 'connected', which the column cannot hold, so the scheduled cycle skipped
  // EVERY workspace on every run and looked exactly like a fleet with no
  // channels. Pinned by lib/connections/status-vocabulary.test.ts, which parses
  // the CHECK out of the migration rather than restating it.
  //
  // Reading them here as well would be a second query per workspace AND a second
  // copy of the rule — the two could disagree, and the one that decided the
  // customer's answer would not be the one that decided the charge.

  const week = planningWeekFor(now)
  const opened = await store.openCycle({
    workspaceId,
    isoYear: week.isoYear,
    isoWeek: week.isoWeek,
    triggerSource: 'schedule',
    budgetCredits,
    userId: null,
  })
  // Already open — a duplicated cron delivery, or a person who pressed the
  // button first. Either way this tick does no paid work.
  if (!opened.created) return false

  const cycleId = opened.cycle.id

  // ── COLLECT + REFLECT. Free, and before any charge. ─────────────────────
  const window = reflectionWindow(now)
  const observations = await store.readObservations(workspaceId, window.fromIso, window.toIso)
  const reflection = reflect(observations)
  for (const learning of reflection.learnings) {
    await store.proposeLearning(
      workspaceId,
      {
        kind: 'brand_memory_patch',
        summary: `Your ${learning.leader} posts reached ${learning.lift}× what your ${learning.runnerUp} posts reached.`,
        loop_cycle_id: cycleId,
        evidence: {
          sample_size: learning.sampleSize,
          window_days: learning.windowDays,
          post_ids: [...learning.postIds],
          metric: learning.metric,
        },
        patch: { alignment: { note: `${learning.leader} is currently your strongest channel.` } },
      },
      { loop_cycle_id: cycleId, post_ids: [...learning.postIds] },
    )
  }
  await store.setCycleStatus(cycleId, workspaceId, 'planning', {
    reflectSkipped: reflection.skippedNoHistory,
  })

  // ── PLAN — the only paid step, and the last one this route reaches. ─────
  const objectRef = newLoopCycleRef(cycleId)
  if (!isLoopRef(objectRef)) throw new Error('LOOP_REF_INVARIANT')

  const withCredits = createWithCredits(ledger)
  const mesh = createMesh()
  const charged = await withCredits(
    { workspaceId, action: MESH_TASK_ACTION['plan_week'], objectRef },
    async (ctx) => {
      const result = await mesh.runTask(
        planWeekTask.def,
        // nowIso IS NOT OPTIONAL IN PRACTICE: without it plan-week's
        // buildMessages drops the date line entirely and the model returns
        // slots from an arbitrary era. A live run that omitted it produced
        // slots fourteen months in the past.
        { goals: '', channels: [...channels], nowIso: now.toISOString() },
        {
          workspaceId,
          traceId: cycleId,
          userId: 'cron',
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        },
      )
      if (!result.ok) throw new Error('MESH_ERROR') // → RELEASE, no charge
      if (result.data.briefs.length === 0) throw new Error('MESH_EMPTY') // → RELEASE

      const priced = priceBrief()
      const rows = result.data.briefs.map((brief, index) => {
        const kept = toChannelSet((brief.channels as Channel[]).filter((c) => channels.includes(c)))
        const use = kept.length > 0 ? kept : toChannelSet([...channels])
        const slot = normalizeSlot(brief.suggestedSlot, [...use], now, index)
        return {
          priority: index + 1,
          title: brief.title.slice(0, 120),
          body: brief.body.slice(0, 500),
          channels: use,
          suggestedSlot: slot.scheduledAt,
          rationale: brief.rationale ?? null,
          estimatedCredits: priced,
        }
      })
      const written = await store.writeBriefs(cycleId, workspaceId, rows)
      if (written.length !== rows.length) throw new Error('BRIEF_WRITE_FAILED')
      return { count: written.length }
    },
  )

  if (!charged.ok) {
    await store.setCycleStatus(cycleId, workspaceId, 'failed', { failureReason: 'PLAN_FAILED' })
    return false
  }

  // ── THE HALT. This route goes no further, by design. ────────────────────
  const briefs = await store.readBriefs(cycleId, workspaceId)
  const preview = previewCost(
    briefs.map((b) => ({
      id: b.id,
      priority: b.priority,
      estimated_credits: b.estimated_credits,
      included: b.included,
    })),
    budgetCredits,
  )
  await store.haltForCostApproval(cycleId, workspaceId, preview.creationCredits)
  await store.addSpend(cycleId, workspaceId, cycleCost())
  return true
}
