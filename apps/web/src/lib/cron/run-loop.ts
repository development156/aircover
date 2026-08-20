import 'server-only'

import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, planWeekTask } from '@sahoda/mesh'
import { MESH_TASK_ACTION, toChannelSet, type Channel } from '@sahoda/shared'

import { previewCost, priceBrief, cycleCost } from '@/lib/loop/cost'
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

export interface LoopCronResult {
  eligible: number
  planned: number
  failed: number
  /** Workspaces that did not fit in this tick. Reported, never hidden. */
  deferred: number
}

export async function runScheduledLoopCycles(now = new Date()): Promise<LoopCronResult> {
  const { databaseUrl } = loadBillingEnv()
  const ledger = createPgLedgerPort({ connectionString: databaseUrl })

  const eligible = await ledger.pool.query<{ workspace_id: string; weekly_budget_credits: number }>(
    `select workspace_id, weekly_budget_credits
       from loop_settings
      where paused = false
      order by workspace_id
      limit $1`,
    [MAX_WORKSPACES_PER_TICK + 1],
  )
  const rows = eligible.rows.slice(0, MAX_WORKSPACES_PER_TICK)
  const deferred =
    eligible.rows.length > MAX_WORKSPACES_PER_TICK
      ? eligible.rows.length - MAX_WORKSPACES_PER_TICK
      : 0

  let planned = 0
  let failed = 0
  for (const row of rows) {
    try {
      const ok = await planOneWorkspace(row.workspace_id, row.weekly_budget_credits, now)
      if (ok) planned += 1
    } catch (error) {
      failed += 1
      // One workspace's failure must not stop the others. Reported per
      // workspace so a single broken tenant is visible rather than absorbed
      // into a route-level 500 that says nothing about which.
      reportServerError(error, { action: 'cron.loop.workspace', workspaceId: row.workspace_id })
    }
  }
  return { eligible: rows.length, planned, failed, deferred }
}

/** Collect → reflect → plan → halt, for one workspace. Returns false when skipped. */
async function planOneWorkspace(
  workspaceId: string,
  budgetCredits: number,
  now: Date,
): Promise<boolean> {
  const { databaseUrl } = loadBillingEnv()
  const ledger = createPgLedgerPort({ connectionString: databaseUrl })

  // Only channels the workspace has actually connected. With none, FSD M2 says
  // the cycle produces suggestions rather than a plan — and charging 20 credits
  // to plan for nowhere is the wrong half of that, so it does not open at all.
  const connections = await ledger.pool.query<{ platform: string }>(
    `select distinct platform from connections
      where workspace_id = $1 and status = 'connected'`,
    [workspaceId],
  )
  const channels = toChannelSet(
    connections.rows
      .map((c) => c.platform as Channel)
      .filter((p): p is Channel => ['x', 'gbp', 'linkedin', 'instagram'].includes(p)),
  )
  if (channels.length === 0) return false

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
        const use = kept.length > 0 ? kept : channels
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
