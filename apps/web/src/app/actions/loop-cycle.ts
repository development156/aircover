'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, planWeekTask, PlanWeekInputSchema, type Mesh } from '@sahoda/mesh'
import {
  creditCost,
  MESH_TASK_ACTION,
  toChannelSet,
  type Channel,
  type WithCreditsFn,
  ChannelSchema,
} from '@sahoda/shared'

import { reportPaidActionFailure } from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { BRIEF_BODY_MAX_CHARS, BRIEF_TITLE_MAX_CHARS, clampBriefText } from '@/lib/planner/briefs'
import { CYCLE_ACTION, priceBrief, previewCost } from '@/lib/loop/cost'
import { planningWeekFor, reflectionWindow } from '@/lib/loop/iso-week'
import { newLoopCycleRef, isLoopRef } from '@/lib/loop/object-ref'
import { reflect } from '@/lib/loop/reflect'
import * as store from '@/lib/loop/store'
import { normalizeSlot } from '@/lib/planner/slots'
import { reportServerError } from '@/lib/observability/report'
import { CHANNELS_UNREADABLE_MESSAGE, noChannelsMessage } from '@/lib/loop/refusal-copy'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * ONE CYCLE, UP TO THE HALT — collect, reflect, plan, then STOP.
 *
 * ── WHY THIS FUNCTION ENDS IN THE MIDDLE OF THE MACHINE ──────────────────────
 * FSD M2 says every credit the cycle will spend is shown "in the plan's cost
 * preview BEFORE stage 4 runs". So there is no function in this codebase that
 * runs a cycle end to end, and there must not be: this one produces briefs and
 * a total and parks at `awaiting_cost_approval`, and `runCreateStage` below
 * refuses to move until a person has approved that total.
 *
 * A cycle that surprises someone with a bill is the worst failure this feature
 * can have, and the halt is the mechanism that makes it impossible rather than
 * unlikely.
 *
 * ── WHAT IS CHARGED HERE, AND WHAT IS NOT ────────────────────────────────────
 * 20 credits, once, for the orchestration — collect, reflect, plan and report.
 * That is the `loop_cycle` price in pricing.config.json, and the plan stage's
 * model call is what it pays for. The creations inside stage 4 are NOT charged
 * here; they are what the preview is previewing.
 *
 * A resumed cycle is not charged again. `openCycle` reports whether it created
 * the row, and only a fresh cycle takes the charge — a second Sunday tick, or
 * someone pressing the button twice, finds the cycle already open and does no
 * paid work.
 */

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

export interface CycleState {
  ok: boolean
  cycleId?: string
  message?: string
  /** True when nothing was charged and nothing could be. */
  insufficient?: boolean
}

/**
 * Which channels this workspace can actually publish to, and which ones it
 * connected and then lost.
 *
 * `connections.status` is CHECK-constrained to ('active','expired','revoked',
 * 'error') and `upsert_connection` writes 'active'. This filtered on
 * 'connected', which the column cannot hold, so it matched nothing for every
 * workspace and the cycle took its zero-channel path unconditionally. It failed
 * as NO_CHANNELS and told people to connect a channel they had already
 * connected. `lib/repo/check-constraints.test.ts` now refuses the whole class.
 *
 * AND `null` is not `{ live: [], lapsed: [] }`. A read that FAILED is not a
 * workspace with no channels: returning an empty list makes the caller write
 * NO_CHANNELS into `loop_cycles.failure_reason`, where /loop renders it back as
 * a statement about the customer’s account for weeks. Two lanes fixed this
 * function for different reasons and both fixes are here.
 *
 * `lapsed` is returned because the refusal message differs: a workspace that
 * never connected needs to connect, and a workspace whose authorisation expired
 * needs to reconnect, and sending the second one to do the first is the action
 * telling them something untrue about their own account.
 */
async function connectedChannels(
  workspaceId: string,
): Promise<{ live: Channel[]; lapsed: Channel[] } | null> {
  const supabase = createServerSupabase()
  // 'active', not 'connected' — see the CHECK on connections.status
  // (20260718000005_connections.sql:9). The old value matched nothing, so every
  // cycle on every workspace ended `failure_reason = 'NO_CHANNELS'` and told the
  // customer to connect a channel they had already connected.
  const { data, error } = await supabase
    .from('connections')
    .select('platform, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'expired', 'revoked', 'error'])
  // A read we could not complete is NOT an empty channel list — see the note
  // above. Checked BEFORE anything is derived from `data`.
  if (error) return null
  // FILTERED THROUGH THE SCHEMA, not through a literal list restated here.
  // This was `['x','gbp','linkedin','instagram'] as const`, a fifth copy of the
  // channel vocabulary — and when facebook and telegram were added it silently
  // dropped both from every Loop decision while typechecking cleanly against a
  // `Channel` that no longer matched it. `ChannelSchema.options` cannot drift
  // from the enum it is.
  const rows = (data ?? []).filter((row) =>
    (ChannelSchema.options as readonly string[]).includes(row.platform as string),
  )
  const pick = (match: (status: string) => boolean): Channel[] => [
    ...toChannelSet(
      rows.filter((r) => match(r.status as string)).map((r) => r.platform as Channel),
    ),
  ]
  const live = pick((status) => status === 'active')
  return { live, lapsed: pick((status) => status !== 'active').filter((c) => !live.includes(c)) }
}

/**
 * Run collect → reflect → plan and park at the cost preview.
 *
 * `now` is a parameter rather than a clock read inside, so the same instant
 * always produces the same ISO week and the same reflection window — a stage
 * that read its own clock would answer differently on a Sunday night than on a
 * Monday morning for what is meant to be one cycle.
 */
export async function runCycleToPreview(
  triggerSource: 'schedule' | 'manual' = 'manual',
  nowIso?: string,
): Promise<CycleState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to plan your week.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    workspaceId = ws.workspace.id

    const now = nowIso ? new Date(nowIso) : new Date()
    if (Number.isNaN(now.getTime())) return { ok: false, message: 'Could not read the time.' }

    // ── PAUSE, checked before anything happens ────────────────────────────
    // FSD M2: "pause Loop (skips cycles, no charge)". Checked first so a paused
    // workspace does no work at all, rather than doing it and discarding it.
    const supabase = createServerSupabase()
    const { data: settings } = await supabase
      .from('loop_settings')
      .select('paused, weekly_budget_credits')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (settings?.paused) {
      return { ok: false, message: 'The Loop is paused. Turn it back on to plan a week.' }
    }
    const budget = (settings?.weekly_budget_credits as number | undefined) ?? null

    const { isoYear, isoWeek } = planningWeekFor(now)
    const opened = await store.openCycle({
      workspaceId,
      isoYear,
      isoWeek,
      triggerSource,
      budgetCredits: budget,
      userId,
    })
    const cycle = opened.cycle

    // A cycle that is already past the halt is not re-run. Pressing the button
    // twice must not plan the week twice or charge twice.
    if (!opened.created) {
      return {
        ok: true,
        cycleId: cycle.id,
        message: 'A cycle for this week is already running.',
      }
    }

    // ── STAGE 1-2: COLLECT and REFLECT ────────────────────────────────────
    // Both before the charge, and both free: reading rows costs nothing and
    // `reflect` calls no model. So a workspace with nothing to reflect on has
    // spent nothing at this point.
    await store.setCycleStatus(cycle.id, workspaceId, 'reflecting')
    const window = reflectionWindow(now)
    const observations = await store.readObservations(workspaceId, window.fromIso, window.toIso)
    const reflection = reflect(observations)

    // Each learning is PROPOSED, never applied. `proposeLearning` writes a
    // pending memory_events row and touches brand_memory nowhere; accepting is
    // `public.resolve_memory_event`, which only a person's click reaches.
    for (const learning of reflection.learnings) {
      await store.proposeLearning(
        workspaceId,
        {
          kind: 'brand_memory_patch',
          summary: `Your ${learning.leader} posts reached ${learning.lift}× what your ${learning.runnerUp} posts reached.`,
          loop_cycle_id: cycle.id,
          evidence: {
            sample_size: learning.sampleSize,
            window_days: learning.windowDays,
            post_ids: [...learning.postIds],
            metric: learning.metric,
          },
          patch: { alignment: { note: `${learning.leader} is currently your strongest channel.` } },
        },
        { loop_cycle_id: cycle.id, post_ids: [...learning.postIds] },
      )
    }

    await store.setCycleStatus(cycle.id, workspaceId, 'planning', {
      reflectSkipped: reflection.skippedNoHistory,
      // Null when a learning WAS produced. Storing a reason then would be a
      // record of a refusal that did not happen.
      reflectReason: reflection.reason,
    })

    // ── STAGE 3: PLAN — the one paid step before the halt ─────────────────
    const connected = await connectedChannels(workspaceId)
    if (connected === null) {
      // We could not read the connections. That is not zero channels, and
      // writing NO_CHANNELS here would put a claim about the customer’s account
      // into loop_cycles.failure_reason where /loop reads it back for weeks.
      await store.setCycleStatus(cycle.id, workspaceId, 'failed', {
        failureReason: 'CHANNELS_UNREADABLE',
      })
      return {
        ok: false,
        cycleId: cycle.id,
        insufficient: false,
        message: CHANNELS_UNREADABLE_MESSAGE,
      }
    }
    const { live: channels, lapsed } = connected
    if (channels.length === 0) {
      // FSD M2 edge case: zero connected channels. The cycle does not charge and
      // does not pretend — it fails honestly and says what to do.
      await store.setCycleStatus(cycle.id, workspaceId, 'failed', {
        failureReason: 'NO_CHANNELS',
      })
      return {
        ok: false,
        cycleId: cycle.id,
        insufficient: false,
        message: noChannelsMessage(lapsed),
      }
    }

    const action = MESH_TASK_ACTION['plan_week']
    const objectRef = newLoopCycleRef(cycle.id)
    // Asserted rather than assumed: a ref without this prefix is a hold the kill
    // switch cannot find, which is the exact case it exists for. Checked at the
    // charge site so the failure is loud rather than invisible.
    if (!isLoopRef(objectRef)) throw new Error('LOOP_REF_INVARIANT')

    let planned = false
    const credits = await getWithCredits()({ workspaceId, action, objectRef }, async (ctx) => {
      const parsed = PlanWeekInputSchema.safeParse({
        goals: '',
        channels,
        nowIso: now.toISOString(),
      })
      if (!parsed.success) throw new Error('PLAN_INPUT')

      const result = await getMesh().runTask(
        planWeekTask.def,
        { goals: parsed.data.goals, channels },
        {
          workspaceId: workspaceId as string,
          traceId: cycle.id,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        },
      )
      if (!result.ok) throw new Error('MESH_ERROR') // → RELEASE, no charge
      const briefs = result.data.briefs
      if (briefs.length === 0) throw new Error('MESH_EMPTY') // → RELEASE

      const priced = priceBrief()
      const rows = briefs.map((brief, index) => {
        // A ChannelSet at the boundary — the same de-duplication `plan-week.ts`
        // does, through the same shared helper, and the column's own check
        // refuses a duplicate behind it.
        const briefChannels = toChannelSet(
          (brief.channels as Channel[]).filter((c) => channels.includes(c)),
        )
        const slot = normalizeSlot(brief.suggestedSlot, [...briefChannels], now, index)
        return {
          priority: index + 1,
          title: clampBriefText(brief.title, BRIEF_TITLE_MAX_CHARS),
          body: clampBriefText(brief.body, BRIEF_BODY_MAX_CHARS),
          channels: briefChannels.length > 0 ? briefChannels : toChannelSet(channels),
          suggestedSlot: slot.scheduledAt,
          rationale: brief.rationale ?? null,
          estimatedCredits: priced,
        }
      })

      const written = await store.writeBriefs(cycle.id, workspaceId as string, rows)
      if (written.length !== rows.length) throw new Error('BRIEF_WRITE_FAILED')
      planned = true
      return { count: written.length }
    })

    if (!credits.ok) {
      reportPaidActionFailure('loop-cycle', credits.error)
      if (!planned) {
        await store.setCycleStatus(cycle.id, workspaceId, 'failed', {
          failureReason: 'PLAN_FAILED',
        })
      }
      revalidateBalance()
      return {
        ok: false,
        cycleId: cycle.id,
        insufficient: credits.error.code === 'CREDIT_INSUFFICIENT',
        message:
          credits.error.code === 'CREDIT_INSUFFICIENT'
            ? 'Not enough credits to plan this week.'
            : 'Could not plan this week. You were not charged.',
      }
    }

    // ── THE HALT ──────────────────────────────────────────────────────────
    const briefs = await store.readBriefs(cycle.id, workspaceId)
    const preview = previewCost(
      briefs.map((b) => ({
        id: b.id,
        priority: b.priority,
        estimated_credits: b.estimated_credits,
        included: b.included,
      })),
      budget,
    )
    const halted = await store.haltForCostApproval(cycle.id, workspaceId, preview.creationCredits)
    // The orchestration is charged either way: it ran, and the plan it produced
    // is on the row. What changes is what the screen may say next.
    await store.addSpend(cycle.id, workspaceId, creditCost(CYCLE_ACTION))

    revalidateBalance()
    revalidatePath('/loop')
    revalidatePath('/report')

    if (!halted) {
      // The cycle went terminal while the plan stage was waiting on the model —
      // the kill switch, pressed during exactly the window it exists for.
      // Without this the halt wrote `awaiting_cost_approval` over `cancelled`
      // and put the approve button back in front of the person who had just
      // pressed stop.
      return {
        ok: false,
        cycleId: cycle.id,
        insufficient: false,
        message:
          'This week was stopped while Sahoda was planning it, so nothing is waiting for your approval.',
      }
    }
    return { ok: true, cycleId: cycle.id }
  } catch (error) {
    reportServerError(error, { action: 'runCycleToPreview', workspaceId })
    return { ok: false, message: 'Could not run the cycle. Try again.' }
  }
}
