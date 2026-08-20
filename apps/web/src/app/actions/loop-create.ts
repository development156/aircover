'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import {
  creditCost,
  PostInsertSchema,
  type AutonomyLevel,
  type Channel,
  type WithCreditsFn,
} from '@sahoda/shared'

import { BRIEF_ACTION } from '@/lib/loop/cost'
import { governingLevel } from '@/lib/loop/governing-level'
import { isLoopRef, newLoopBriefRef } from '@/lib/loop/object-ref'
import * as store from '@/lib/loop/store'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * STAGE 4-6 — CREATE, TEST, STAGE. The half that spends money.
 *
 * ── THE GATE IS RE-READ FROM THE DATABASE, NOT INHERITED ─────────────────────
 * `public.loop_approve_cost` refuses to advance a cycle nobody approved, and
 * that refusal protects the SCREEN. It does not protect this function, which
 * writes over an owner connection and could set `status = 'creating'` itself.
 *
 * So the first thing that happens below is `readApprovedCycleForCreate`, whose
 * WHERE clause carries `cost_approved_at is not null` — a fresh read of the row
 * about to be spent against, not a belief about the row that was fetched a
 * moment ago in another request. If it returns null, nothing is charged and
 * nothing is written.
 *
 * ── THIS FUNCTION NEVER PUBLISHES, AT ANY AUTONOMY LEVEL ─────────────────────
 * L0 writes no draft at all. L1 leaves a draft in the Planner with no schedule.
 * L2 puts a schedule on it and sets `status = 'approved'`, which is where the
 * dispatcher would pick it up — and the dispatcher is behind its own flag.
 * There is no L3 branch, because L3 cannot be stored: `AutonomyLevel` is 0 | 1 |
 * 2 and the column refuses a 3. The absence of that branch is not an oversight
 * to be filled in later; it is what makes an unattended publish unreachable
 * from here.
 */

let withCreditsSingleton: WithCreditsFn | undefined
function getWithCredits(): WithCreditsFn {
  if (withCreditsSingleton) return withCreditsSingleton
  const { databaseUrl } = loadBillingEnv()
  withCreditsSingleton = createWithCredits(createPgLedgerPort({ connectionString: databaseUrl }))
  return withCreditsSingleton
}

export interface CreateStageState {
  ok: boolean
  created?: number
  skipped?: number
  spent?: number
  message?: string
}

/** The dial for each channel, defaulting to L1 for any channel with no row. */
async function readDial(workspaceId: string): Promise<Map<Channel, AutonomyLevel>> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('loop_channel_autonomy')
    .select('channel, level')
    .eq('workspace_id', workspaceId)
  const dial = new Map<Channel, AutonomyLevel>()
  for (const row of data ?? []) dial.set(row.channel as Channel, row.level as AutonomyLevel)
  return dial
}

export async function runCreateStage(cycleId: string): Promise<CreateStageState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to run this.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // ── THE GATE ──────────────────────────────────────────────────────────
    const cycle = await store.readApprovedCycleForCreate(cycleId, workspaceId)
    if (!cycle) {
      return {
        ok: false,
        message: 'Approve the cost preview first — nothing has been spent.',
      }
    }

    const briefs = (await store.readBriefs(cycleId, workspaceId)).filter((b) => b.included)
    const dial = await readDial(workspaceId)
    const supabase = createServerSupabase()

    let created = 0
    let skipped = 0
    let spent = 0

    for (const brief of briefs) {
      const level = governingLevel([...brief.channels], dial)

      // ── L0: SUGGEST ONLY. No draft, no charge. ─────────────────────────
      // The brief itself is the suggestion, and it already exists. Writing a
      // draft here would be doing the thing L0 exists to not do.
      if (level === 0) {
        await store.linkBriefToPost(brief.id, workspaceId, null, 'suggested')
        skipped += 1
        continue
      }

      const objectRef = newLoopBriefRef(brief.id)
      if (!isLoopRef(objectRef)) throw new Error('LOOP_REF_INVARIANT')

      let postId: string | null = null
      const charged = await getWithCredits()(
        { workspaceId: workspaceId as string, action: BRIEF_ACTION, objectRef },
        async () => {
          // L1 leaves it in the Planner unscheduled. L2 puts it on the calendar
          // as `approved`, which is the state the dispatcher reads — and the
          // dispatcher is behind its own flag, so this schedules and does not send.
          const row = PostInsertSchema.parse({
            workspace_id: workspaceId,
            title: brief.title,
            body: brief.body,
            status: level === 2 ? 'approved' : 'draft',
            channels: [...brief.channels],
            scheduled_at: level === 2 ? brief.suggested_slot : null,
            origin: 'plan_week',
            created_by: userId,
          })
          const { data, error } = await supabase.from('posts').insert(row).select('id').single()
          if (error || !data) throw new Error('INSERT_FAILED') // → RELEASE, no charge
          postId = data.id as string
          return { postId: data.id as string }
        },
      )

      if (!charged.ok || !postId) {
        await store.linkBriefToPost(brief.id, workspaceId, null, 'failed')
        continue
      }

      await store.linkBriefToPost(
        brief.id,
        workspaceId,
        postId,
        level === 2 ? 'awaiting_approval' : 'drafted',
      )
      created += 1
      spent += creditCost(BRIEF_ACTION)
      await store.addSpend(cycleId, workspaceId, creditCost(BRIEF_ACTION))
    }

    await store.setCycleStatus(cycleId, workspaceId, 'staging')
    await store.finishCycle(cycleId, workspaceId)

    revalidatePath('/loop')
    revalidatePath('/report')
    revalidatePath('/planner')
    revalidatePath('/posts')
    return { ok: true, created, skipped, spent }
  } catch (error) {
    reportServerError(error, { action: 'runCreateStage', workspaceId })
    return { ok: false, message: 'Could not create this week — try again.' }
  }
}
