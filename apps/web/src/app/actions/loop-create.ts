'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { contentVariantsTask, createMesh, type Mesh } from '@sahoda/mesh'
import {
  creditCost,
  PostInsertSchema,
  type AutonomyLevel,
  type Channel,
  type WithCreditsFn,
} from '@sahoda/shared'

import { BRIEF_ACTION } from '@/lib/loop/cost'
import { draftShapeFor } from '@/lib/loop/draft-shape'
import { governingLevel } from '@/lib/loop/governing-level'
import { isLoopRef, newLoopBriefRef } from '@/lib/loop/object-ref'
import * as store from '@/lib/loop/store'
import { reportServerError } from '@/lib/observability/report'
import { filterVariants } from '@/lib/posts/filter-variants'
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
 * ── WHAT THE CHARGE BUYS, AND WHY IT IS INSIDE THE HOLD ──────────────────────
 * Each brief is charged `post_variants`, and that price is for per-channel
 * bodies grounded in the Brand Brain. Until 2026-09-02 this function charged it
 * and then inserted one post with one body for every channel and no
 * `post_variants` row at all: the dispatcher held each post as 'no-variants'
 * for an hour past its slot and expired it, and the customer had paid three
 * credits per brief for nothing. The model call, the per-channel filter and
 * the variant insert now happen INSIDE the same `withCredits` block, so a
 * failure at any of them releases the hold and the brief is marked failed.
 * One body per channel, never one body across all of them.
 *
 * ── THIS FUNCTION NEVER PUBLISHES, AT ANY AUTONOMY LEVEL ─────────────────────
 * `draftShapeFor` decides the row per rung, and its own header says why. L0
 * writes no draft at all. L1 leaves a draft in the Planner with no schedule.
 * L2 writes `review` with the slot attached, which is the one status that is
 * on the approvals queue AND outside the sweep's gate, so a person's Approve is
 * what turns it into `approved`. L3 leaves a plain draft with no time on it,
 * because only the autopilot dispatcher may schedule an autopilot post, after
 * its cancel window. Nothing this function writes is in
 * `DISPATCHABLE_STATUSES`; `draft-shape.test.ts` pins that against the list.
 *
 * ── ENTERING TWICE WRITES NOTHING TWICE ──────────────────────────────────────
 * Briefs that already carry a `post_id` are skipped before anything is charged,
 * and `linkBriefToPost` refuses to overwrite one. Two tabs at the halt screen
 * can both reach this function (the approve RPC replays as success), and
 * `withCredits` replays the DEBIT without charging but still runs the wrapped
 * function, so the read is the idempotency boundary and not the ledger.
 */

// 'use server' modules may export only async functions — these singletons stay
// module-private. Built lazily so a missing key surfaces as a typed error inside
// the action rather than an import-time crash that 500s every route.
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

export interface CreateStageState {
  ok: boolean
  created?: number
  skipped?: number
  spent?: number
  /**
   * The cycle went terminal — cancelled or failed — while this stage was
   * running. The drafts that were written are kept and were paid for, so this is
   * not a failure; what it is NOT is a reported week, and the screen must not
   * say one.
   */
  cancelledMidRun?: boolean
  /**
   * A brief could not be created because the workspace ran out of credits
   * mid-stage. The cycle is LEFT in `creating` (not advanced to staging) so the
   * resume panel offers a way back once credits are topped up, and the week is
   * not reported as done when some posts were never made.
   */
  insufficient?: boolean
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
        message: 'Approve the cost preview first. Nothing has been spent.',
      }
    }

    // ── CONCURRENCY CLAIM ───────────────────────────────────────────────────
    // One create run per cycle. A second concurrent request is turned away here,
    // before it charges or inserts, so it cannot write a duplicate orphan post.
    const claimed = await store.claimCreateStage(cycleId, workspaceId)
    if (!claimed) {
      return { ok: true, message: 'This week is already being created.' }
    }

    // Included, and not yet turned into a post. The second half is what makes
    // a second entry harmless: a brief with a post is done, whatever else
    // happens to the request that wrote it.
    const briefs = (await store.readBriefs(cycleId, workspaceId)).filter(
      (b) => b.included && b.post_id === null,
    )
    const dial = await readDial(workspaceId)
    const supabase = createServerSupabase()

    let created = 0
    let skipped = 0
    let spent = 0

    for (const brief of briefs) {
      const level = governingLevel([...brief.channels], dial)

      // ── L0: SUGGEST ONLY. No draft, no model call, no charge. ───────────
      // The brief itself is the suggestion, and it already exists. Writing a
      // draft here would be doing the thing L0 exists to not do.
      if (level === 0) {
        await store.linkBriefToPost(brief.id, workspaceId, null, 'suggested')
        skipped += 1
        continue
      }

      const objectRef = newLoopBriefRef(brief.id)
      if (!isLoopRef(objectRef)) throw new Error('LOOP_REF_INVARIANT')

      const shape = draftShapeFor(level, brief.suggested_slot)
      const channels = [...brief.channels]

      let postId: string | null = null
      const charged = await getWithCredits()(
        { workspaceId: workspaceId as string, action: BRIEF_ACTION, objectRef },
        async (ctx) => {
          // What the charge actually buys: per-channel adaptation grounded in
          // the Brand Brain. The brief's body is a plain first draft with no
          // voice in it; this is where the voice arrives.
          const result = await getMesh().runTask(
            contentVariantsTask.def,
            { body: brief.body, channels },
            {
              workspaceId: workspaceId as string,
              traceId: objectRef,
              userId,
              actionType: ctx.actionType,
              creditsCharged: ctx.creditsCharged,
            },
          )
          // Our own vocabulary, never the provider's text.
          if (!result.ok) throw new Error('MESH_ERROR') // → RELEASE, no charge

          // `ContentVariantsOutputSchema` has no `.min()` and no channel
          // cross-check, so `{"variants": []}` parses clean. `filterVariants`
          // is the guard `actions/posts-ai.ts` and `playbook-run.ts` already
          // put in front of this task at this price; a third copy of the
          // check is how sibling defects ship.
          const filtered = filterVariants(channels, result.data)
          if (filtered.variants.length === 0) throw new Error('NO_VARIANTS') // → RELEASE

          const row = PostInsertSchema.parse({
            workspace_id: workspaceId,
            title: brief.title,
            body: brief.body,
            // Draft capture (REQUESTS.md §22). `loop_briefs` holds the brief;
            // this holds the body as generated, so the customer's later edit
            // can be measured against it without a join to the brief table.
            generated_body: brief.body,
            status: shape.status,
            channels,
            scheduled_at: shape.scheduledAt,
            origin: 'plan_week',
            created_by: userId,
          })
          const { data, error } = await supabase.from('posts').insert(row).select('id').single()
          if (error || !data) throw new Error('INSERT_FAILED') // → RELEASE, no charge
          postId = data.id as string
          await store.writeVariants(workspaceId as string, postId, filtered.variants)
          return { postId }
        },
      )

      if (!charged.ok || !postId) {
        // Out of credits is not the same as this one brief failing: every brief
        // after it will fail the same way. Stop, mark this brief failed, and
        // leave the cycle in `creating` so nothing reports the week as done and
        // the resume panel can pick it up after a top-up.
        if (!charged.ok && charged.error.code === 'CREDIT_INSUFFICIENT') {
          await store.linkBriefToPost(brief.id, workspaceId, null, 'failed')
          revalidatePath('/loop')
          revalidatePath('/planner')
          revalidatePath('/posts')
          revalidatePath('/approvals')
          return {
            ok: false,
            created,
            skipped,
            spent,
            insufficient: true,
            message:
              created > 0
                ? `Created ${created} before credits ran out. Top up, then resume this week.`
                : 'Not enough credits to create this week. Top up, then resume.',
          }
        }
        await store.linkBriefToPost(brief.id, workspaceId, null, 'failed')
        continue
      }

      await store.linkBriefToPost(brief.id, workspaceId, postId, shape.outcome)
      created += 1
      spent += creditCost(BRIEF_ACTION)
      await store.addSpend(cycleId, workspaceId, creditCost(BRIEF_ACTION))
    }

    await store.setCycleStatus(cycleId, workspaceId, 'staging')
    // False means the cycle reached `cancelled` or `failed` while this stage was
    // running — the kill switch, almost always. The drafts that were written are
    // KEPT (they are in the Planner and the customer paid for them) and the
    // cancellation stands; what must not happen is reporting the week as done.
    const reported = await store.finishCycle(cycleId, workspaceId)

    revalidatePath('/loop')
    revalidatePath('/report')
    revalidatePath('/planner')
    revalidatePath('/posts')
    revalidatePath('/approvals')
    if (!reported) {
      return {
        ok: true,
        created,
        skipped,
        spent,
        cancelledMidRun: true,
      }
    }
    return { ok: true, created, skipped, spent }
  } catch (error) {
    reportServerError(error, { action: 'runCreateStage', workspaceId })
    return { ok: false, message: 'Could not create this week. Try again.' }
  }
}
