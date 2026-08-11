'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, planWeekTask, PlanWeekInputSchema, type Mesh } from '@sahoda/mesh'
import {
  creditCost,
  MESH_TASK_ACTION,
  PostInsertSchema,
  toChannelSet,
  type WithCreditsFn,
} from '@sahoda/shared'

import {
  BRIEF_BODY_MAX_CHARS,
  BRIEF_TITLE_MAX_CHARS,
  clampBriefText,
  clampChannels,
} from '@/lib/planner/briefs'
import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { newPlanWeekRef } from '@/lib/planner/object-ref'
import { normalizeSlot } from '@/lib/planner/slots'
import type { PlanWeekState } from '@/lib/planner/state'
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/** Goals are model input — cap what one click can stuff into a paid prompt. */
const GOALS_MAX_CHARS = 500

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

/**
 * One click → five Brand-Brain-grounded drafts in the Planner (Roadmap §Alpha
 * item 11 — the Loop's seed, not the scheduled cycle). Charged as `loop_cycle`
 * (20 cr) via `withCredits`: the model call AND the five inserts run inside the
 * callback, so any failure before the drafts exist throws → the HOLD is
 * RELEASED and "you were not charged" is verifiably true. The DEBIT only lands
 * once the drafts are rows. Brand context is attached by the mesh engine from
 * `workspaceId` — the caller passes only goals + channels.
 */
export async function planMyWeek(goals: unknown, channels: unknown): Promise<PlanWeekState> {
  const action = MESH_TASK_ACTION['plan_week']
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: 'Sign in to plan your week.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) {
      return { ok: false, insufficient: false, message: 'Create a workspace first.' }
    }
    workspaceId = workspace.id

    // Parse BEFORE the withCredits callback: runTask does not validate input,
    // and reserving credits for garbage would burn a paid provider call.
    const parsedInput = PlanWeekInputSchema.safeParse({
      goals: typeof goals === 'string' ? goals.trim().slice(0, GOALS_MAX_CHARS) : goals,
      channels,
      // Anchor the model in real time. Without it every suggested slot lands
      // outside [earliest .. horizon] and `normalizeSlot` clamps all five to
      // the fallback ladder — the plan reads as "5 suggested times were
      // unusable" every single run.
      nowIso: new Date().toISOString(),
    })
    if (!parsedInput.success) {
      return { ok: false, insufficient: false, message: 'Pick at least one channel first.' }
    }
    // De-dupe: `PlanWeekInputSchema` has `.min(1)` but no upper bound or
    // de-dupe (upstream ask filed), and the array is joined into the paid model
    // prompt — a hand-rolled call posting 500k repeats of 'x' would amplify our
    // provider spend against a flat 20-credit charge. Four distinct values max.
    //
    // Through `toChannelSet` rather than a local `new Set`, so this shares the one
    // implementation the posts row boundary uses. It was a hand-rolled copy, and
    // hand-rolled copies of this exact expression are what shipped three separate
    // duplicate-channel defects (see packages/shared/src/db/channel-set.ts).
    const requested = toChannelSet(parsedInput.data.channels)
    // A plain array for the mesh call — `PlanWeekInputSchema` types it mutable, and
    // `ChannelSet` is readonly. The copy is still the distinct list; the spread only
    // drops the brand at the package seam.
    const taskInput = { goals: parsedInput.data.goals, channels: [...requested] }

    // SERVER-DERIVED ledger key, fresh per invocation — a stable ref would
    // replay a spent HOLD+DEBIT. See lib/planner/object-ref.ts.
    const objectRef = newPlanWeekRef(workspace.id)
    const traceId = randomUUID()

    // TODO(owner ruling #5): entitlements are a SEPARATE gate called BEFORE
    // withCredits at every AI entry point. Mount it here once @sahoda/billing
    // ships the gate helper — today only the credit balance limits this action.
    let failure: string | null = null
    let delivered = false
    let created = 0
    let clamped = 0

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(planWeekTask.def, taskInput, {
          workspaceId: workspace.id,
          traceId,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        })
        if (!result.ok) {
          // Our own copy, never `result.error.message` — that can carry provider text.
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }

        const briefs = result.data.briefs
        if (briefs.length === 0) {
          failure = FAILURE_REASON.NO_PLAN
          throw new Error('MESH_EMPTY') // → RELEASE: nothing usable is not a delivery
        }

        // From here to the insert, any throw (schema parse included) is a
        // save failure — stashed BEFORE the work so an unexpected throw claims
        // the specific vetted reason instead of degrading to the generic line.
        failure = FAILURE_REASON.SAVE_FAILED

        // `rationale` is deliberately dropped: posts carry no planning-metadata
        // column, and appending it to `body` would leak plan notes into
        // published captions. Title/body are code-point-capped — model text is
        // unbounded upstream (REQUESTS.md).
        const now = new Date()
        const rows = briefs.map((brief, index) => {
          const briefChannels = clampChannels(brief.channels, requested)
          const slot = normalizeSlot(brief.suggestedSlot, briefChannels, now, index)
          if (slot.clamped) clamped += 1
          return PostInsertSchema.parse({
            workspace_id: workspace.id,
            title: clampBriefText(brief.title, BRIEF_TITLE_MAX_CHARS),
            body: clampBriefText(brief.body, BRIEF_BODY_MAX_CHARS),
            status: 'draft',
            channels: briefChannels,
            scheduled_at: slot.scheduledAt,
            origin: 'plan_week',
            created_by: userId,
          })
        })

        const supabase = createServerSupabase()
        const { data, error } = await supabase.from('posts').insert(rows).select('id')
        if (error || !data || data.length !== rows.length) {
          throw new Error('INSERT_FAILED') // → RELEASE: no drafts, no charge
        }

        created = data.length
        // Last statement before the return: from here on the wrapper owns the
        // outcome, and any failure it reports may still have debited.
        delivered = true
        return { created }
      },
    )

    // Revalidate whenever the drafts EXIST — including the lost-ack branch
    // where the wrapper failed after delivery. There the user reads "we could
    // not confirm whether it was charged" — if the page under that warning
    // still showed no drafts, the obvious move is to click again, and a retry
    // with a fresh objectRef is a second charge. Seeing the five drafts is what
    // makes the warning actionable.
    if (delivered) {
      revalidatePath('/planner')
      revalidatePath('/posts')
    }
    // The credit chip lives in the layout, which a page-scoped revalidate
    // never reaches.
    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('plan-week', credits.error)
      // A mesh config throw inside the callback released the hold, so the
      // not-charged claim is verifiable. Never on the delivered path — there
      // the unconfirmed-charge warning must survive.
      if (!delivered && isDeploymentConfigCause(credits.error)) {
        return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
      }
      return chargeFailureState({ error: credits.error, action, delivered, reason: failure })
    }

    return {
      ok: true,
      created,
      clamped,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch (error) {
    reportServerError(error, { action: 'planMyWeek', workspaceId })
    reportPaidActionFailure('plan-week', error)
    // The billing env loader throws before any HOLD exists — config failures
    // caught here are verifiably uncharged, and a retry cannot fix them.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, insufficient: false, message: 'Could not plan your week — try again.' }
  }
}
