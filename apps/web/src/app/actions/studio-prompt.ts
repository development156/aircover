'use server'

import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, promptRefineTask, type Mesh } from '@sahoda/mesh'
import { creditCost, type BrandSignal, type WithCreditsFn } from '@sahoda/shared'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'
import {
  describeRefineContext,
  resolveRefineContext,
  type BrainState,
} from '@/lib/studio/prompt-refine'
import { workspaceForWrite } from '@/lib/workspaces'

/** This action's own pricing key: 1 credit, the same flat price `caption_rewrite` charges for a same-shape, same-tier text task. */
const ACTION = 'studio_prompt_refine' as const

/**
 * REFINE WHAT A PERSON TYPED, WITHOUT TOUCHING WHAT THEY TYPED.
 *
 * ── REVERSIBLE, BY CONSTRUCTION ──────────────────────────────────────────────
 * This action writes NOTHING. It reads the workspace's Brand Brain, asks the
 * mesh for a refined version of `wanted`, and hands back BOTH the original and
 * the refinement in the same response. There is no field this action could
 * overwrite even by accident — the person's typed words live in the screen's
 * own state until THEY decide to keep the refinement, which is a separate,
 * later action this file does not perform.
 *
 * ── THREE STATES, NEVER TWO ──────────────────────────────────────────────────
 * `resolveRefineContext` keeps "nothing in the Brand Brain" and "could not
 * read the Brand Brain" apart all the way through, and `describeRefineContext`
 * turns that into the sentence a person reads before they accept a
 * refinement. Both ride on the response so the screen never has to guess.
 *
 * ── PRICED, LIKE `caption_rewrite` ───────────────────────────────────────────
 * `pricing.config.json` now carries `studio_prompt_refine: 1`, the flat price
 * of its nearest sibling, a same-shape, same-tier text task. The hold, the
 * task and the debit run through the same `withCredits` wrapper every other
 * priced mesh call in this codebase uses (`posts-ai.ts`'s `rewriteCaption` is
 * the pattern copied here): a HOLD before the model runs, a RELEASE if the
 * callback throws, a DEBIT only once a real refinement is in hand.
 */

const RefineInputSchema = z.object({
  /** Same bound the image-conditioning prompt box already carries. */
  wanted: z.string().trim().min(3).max(1000),
})

export type RefinePromptState =
  | {
      ok: true
      /** Exactly what was typed. The screen keeps this so a rejected refinement is a no-op. */
      original: string
      refined: string
      headline: string
      body: string
      brainState: BrainState
      usedSignals: BrandSignal[]
      balanceAfter: number
      creditsCharged: number
    }
  | { ok: false; insufficient: true; required: number; available: number }
  | { ok: false; insufficient: false; message: string }

const REFUSALS = {
  signedOut: 'Sign in to refine a prompt.',
  malformed: 'Describe the picture you want, in a few words at least.',
  failed: 'Sahoda could not refine that prompt. Nothing was changed.',
} as const

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

/** Fresh ref per press, never a stable one: `withCredits` keys idempotency on `(action, objectRef)`, and a stable ref would let a second press replay the first charge for a fresh model call. */
function newRefineRef(workspaceId: string): string {
  return `${workspaceId}:studio-prompt-refine:${randomUUID()}`
}

export async function refineStudioPrompt(input: unknown): Promise<RefinePromptState> {
  let workspaceId: string | undefined

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, insufficient: false, message: REFUSALS.signedOut }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    workspaceId = ws.workspace.id
    const workspace = ws.workspace

    const parsed = RefineInputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, insufficient: false, message: REFUSALS.malformed }

    // Read before anything is spent: a brain that cannot be read produces an
    // unconditioned refinement, which is a worse result and not a failure, and
    // the response says which happened.
    const refineContext = await resolveRefineContext(workspace.id)
    const { headline, body } = describeRefineContext(refineContext)

    const objectRef = newRefineRef(workspace.id)
    const traceId = randomUUID()

    let failure: string | null = null
    let delivered = false
    let refined = ''

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action: ACTION, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(
          promptRefineTask.def,
          { wanted: parsed.data.wanted, signals: refineContext.signals },
          {
            workspaceId: workspace.id,
            traceId,
            userId,
            actionType: ctx.actionType,
            creditsCharged: ctx.creditsCharged,
          },
        )
        if (!result.ok) {
          // Our own copy, never `result.error.message`: that can carry provider text.
          failure = FAILURE_REASON.MESH_ERROR
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }
        refined = result.data.refined
        delivered = true
        return result.data
      },
    )

    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('studio-prompt.refineStudioPrompt', credits.error)
      if (!delivered && isDeploymentConfigCause(credits.error)) {
        return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
      }
      return chargeFailureState({
        error: credits.error,
        action: ACTION,
        delivered,
        reason: failure,
      })
    }

    return {
      ok: true,
      original: parsed.data.wanted,
      refined,
      headline,
      body,
      brainState: refineContext.brainState,
      usedSignals: refineContext.signals,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(ACTION),
    }
  } catch (error) {
    reportServerError(error, { action: 'refineStudioPrompt', workspaceId })
    reportPaidActionFailure('studio-prompt.refineStudioPrompt', error)
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, insufficient: false, message: REFUSALS.failed }
  }
}
