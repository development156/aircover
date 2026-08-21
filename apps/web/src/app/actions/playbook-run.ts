'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { contentVariantsTask, createMesh, type Mesh } from '@sahoda/mesh'
import {
  creditCost,
  isRunnable,
  playbookRecipe,
  PostInsertSchema,
  type AutonomyLevel,
  type Channel,
  type WithCreditsFn,
} from '@sahoda/shared'

import { governingLevel } from '@/lib/loop/governing-level'
import { RUN_ACTION, previewRunCost, shortfallMessage } from '@/lib/playbooks/cost'
import { isPlaybookRef, newPlaybookItemRef, newPlaybookRunRef } from '@/lib/playbooks/object-ref'
import { proposeFestivals } from '@/lib/playbooks/propose'
import * as store from '@/lib/playbooks/store'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * A RUN, IN TWO HALVES, WITH A STORED HALT BETWEEN THEM.
 *
 * `startRun` proposes and stops. `executeRun` spends. Nothing joins them except a
 * column — `playbook_runs.cost_approved_at` — which is set by
 * `public.playbook_approve_cost` and nothing else, and which `executeRun` re-reads
 * from the database as the first thing it does.
 *
 * That shape is the whole feature. It is what makes the cost preview a fact
 * rather than a screen, and it is why the gate can be FORCED in a test: a run can
 * be pushed to `awaiting_cost_approval` with items priced and no approval, and
 * `executeRun` must decline it having charged nothing.
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

export interface StartRunState {
  ok: boolean
  runId?: string
  /** True when the trigger fired and there was genuinely nothing to make. */
  nothingToDo?: boolean
  estimatedCredits?: number
  message?: string
}

/**
 * PROPOSE, PRICE, AND STOP.
 *
 * Charges nothing. Calls no model. Ends either at the halt with a priced list, or
 * at `nothing_to_do` with an honest empty answer.
 */
export async function startRun(playbookId: string, now = new Date()): Promise<StartRunState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const playbook = await store.readPlaybook(playbookId, workspaceId)
    if (!playbook) return { ok: false, message: 'That playbook no longer exists.' }

    const recipe = playbookRecipe(playbook.recipe_key)
    if (!recipe || !isRunnable(recipe)) {
      return {
        ok: false,
        message: recipe ? `Not yet — this one still needs ${recipe.blocker}.` : 'Not offered.',
      }
    }

    const runId = await store.openRun({
      workspaceId,
      playbookId,
      recipeKey: recipe.key,
      triggerSource: 'manual',
      userId,
    })
    // Null means the partial unique index refused: one is already going. That is
    // a normal answer, not a failure, and saying so is better than opening a
    // second run that would charge twice for the same festival.
    if (!runId) {
      return {
        ok: false,
        message: 'This playbook is already running — look below for its preview.',
      }
    }

    const dial = await readDial(workspaceId)
    const proposal = proposeFestivals(playbook.params, dial, recipe.outputAction, now)

    await store.markRan(playbookId, workspaceId)

    if (proposal.items.length === 0) {
      await store.finishNothingToDo(runId, workspaceId)
      revalidatePath('/playbooks')
      return { ok: true, runId, nothingToDo: true }
    }

    await store.writeItems(runId, workspaceId, proposal.items)
    const preview = previewRunCost(
      proposal.items.map((item, index) => ({
        id: String(index),
        position: index + 1,
        estimated_credits: item.estimatedCredits,
        included: true,
      })),
      null,
    )
    await store.haltForCostApproval(
      runId,
      workspaceId,
      preview.totalCredits,
      proposal.triggerDetail,
    )

    revalidatePath('/playbooks')
    return { ok: true, runId, estimatedCredits: preview.totalCredits }
  } catch (error) {
    reportServerError(error, { action: 'startRun', workspaceId })
    return { ok: false, message: 'Could not start that playbook — try again.' }
  }
}

export interface ExecuteRunState {
  ok: boolean
  drafted?: number
  suggested?: number
  spent?: number
  message?: string
}

/**
 * SPEND — but only against a fresh read of the gate.
 *
 * ── THIS FUNCTION NEVER PUBLISHES, AT ANY AUTONOMY LEVEL ────────────────────
 * L0 writes no draft at all and is charged nothing for the item. L1 leaves a
 * draft in the Planner with no schedule. L2 puts a schedule on it and sets
 * `status = 'approved'`, which is where the dispatcher would pick it up — and the
 * dispatcher is behind its own flag. There is no L3 branch, because L3 cannot be
 * stored: `AutonomyLevel` is 0 | 1 | 2 and the column refuses a 3. The absence of
 * that branch is what makes an unattended publish unreachable from here.
 */
export async function executeRun(runId: string): Promise<ExecuteRunState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // ── THE GATE ──────────────────────────────────────────────────────────
    const run = await store.readApprovedRunForExecute(runId, workspaceId)
    if (!run) {
      return { ok: false, message: 'Approve the cost preview first — nothing has been spent.' }
    }

    const recipe = playbookRecipe(run.recipe_key)
    if (!recipe) return { ok: false, message: 'That recipe is no longer offered.' }

    const items = (await store.readItems(runId, workspaceId)).filter((i) => i.included)
    const dial = await readDial(workspaceId)
    const supabase = createServerSupabase()

    // ── THE PER-RUN CHARGE ────────────────────────────────────────────────
    // Taken FIRST, and its failure ends the run before a single draft is
    // written. A run that charged per item and then failed to take its own fee
    // would have spent the expensive half and skipped the cheap one.
    const runRef = newPlaybookRunRef(runId)
    if (!isPlaybookRef(runRef)) throw new Error('PLAYBOOK_REF_INVARIANT')
    const runCharge = await getWithCredits()(
      { workspaceId, action: RUN_ACTION, objectRef: runRef },
      async () => ({ ok: true }),
    )
    if (!runCharge.ok) {
      await store.setRunStatus(runId, workspaceId, 'failed', 'CREDITS')
      const available = (await store.availableCredits(workspaceId)) ?? 0
      const needed = (run.approved_credits ?? 0) + creditCost(RUN_ACTION)
      return { ok: false, message: shortfallMessage(needed, available) }
    }
    await store.setRunStatus(runId, workspaceId, 'running')
    await store.addSpend(runId, workspaceId, creditCost(RUN_ACTION))

    let drafted = 0
    let suggested = 0
    let spent = creditCost(RUN_ACTION)

    for (const item of items) {
      const level = governingLevel([...item.channels], dial)

      // ── L0: SUGGEST ONLY. No draft, no model call, no charge. ───────────
      // The item itself is the suggestion and it already exists. Writing a draft
      // here would be doing the thing L0 exists to not do.
      if (level === 0) {
        await store.linkItemToPost(item.id, workspaceId, null, 'suggested')
        suggested += 1
        continue
      }

      const objectRef = newPlaybookItemRef(item.id)
      if (!isPlaybookRef(objectRef)) throw new Error('PLAYBOOK_REF_INVARIANT')

      let postId: string | null = null
      const charged = await getWithCredits()(
        { workspaceId, action: recipe.outputAction, objectRef },
        async (ctx) => {
          // What the charge actually buys: per-channel adaptation grounded in the
          // Brand Brain. The proposal's body is a plain first draft with no voice
          // in it; this is where the voice arrives.
          const result = await getMesh().runTask(
            contentVariantsTask.def,
            { body: item.body, channels: [...item.channels] },
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

          const row = PostInsertSchema.parse({
            workspace_id: workspaceId,
            title: item.title,
            body: item.body,
            status: level === 2 ? 'approved' : 'draft',
            channels: [...item.channels],
            scheduled_at: level === 2 ? item.suggested_slot : null,
            origin: 'playbook',
            created_by: userId,
          })
          const { data, error } = await supabase.from('posts').insert(row).select('id').single()
          if (error || !data) throw new Error('INSERT_FAILED') // → RELEASE, no charge
          postId = data.id as string
          await store.writeVariants(workspaceId as string, postId, result.data.variants)
          return { postId }
        },
      )

      if (!charged.ok || !postId) {
        await store.linkItemToPost(item.id, workspaceId, null, 'failed')
        continue
      }

      await store.linkItemToPost(
        item.id,
        workspaceId,
        postId,
        level === 2 ? 'awaiting_approval' : 'drafted',
      )
      drafted += 1
      spent += creditCost(recipe.outputAction)
      await store.addSpend(runId, workspaceId, creditCost(recipe.outputAction))
    }

    await store.finishRun(runId, workspaceId)

    revalidatePath('/playbooks')
    revalidatePath('/planner')
    revalidatePath('/posts')
    return { ok: true, drafted, suggested, spent }
  } catch (error) {
    reportServerError(error, { action: 'executeRun', workspaceId })
    return { ok: false, message: 'Could not finish that run — try again.' }
  }
}
