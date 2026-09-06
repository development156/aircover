'use server'

import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import {
  captionRewriteTask,
  contentVariantsTask,
  createMesh,
  ContentVariantsInputSchema,
  type Mesh,
} from '@sahoda/mesh'
import {
  CaptionRewriteInputSchema,
  CONSTRAINTS,
  charCountFor,
  creditCost,
  MESH_TASK_ACTION,
  normalizeKeywords,
  toChannelSet,
  type WithCreditsFn,
} from '@sahoda/shared'

import {
  DEPLOYMENT_CONFIG_MESSAGE,
  isDeploymentConfigCause,
  reportPaidActionFailure,
} from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { chargeFailureState, FAILURE_REASON } from '@/lib/posts/charge-failure'
import { hasLink } from '@/lib/posts/detect-link'
import { getPost } from '@/lib/posts/read'
import { filterVariants } from '@/lib/posts/filter-variants'
import { newCaptionRewriteRef, newVariantsObjectRef } from '@/lib/posts/object-ref'
import type { GenerateState, GeneratedVariant, RewriteState } from '@/lib/posts/state'
import { workspaceForWrite } from '@/lib/workspaces'

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
 * Generate per-channel variants from the canonical body. `withCredits` reserves
 * the 3 credits, runs `content_variants`, and DEBITs only on a real result —
 * a failure thrown inside the callback RELEASES the HOLD, so the user is not
 * charged. `delivered` records whether the callback got that far: once it
 * returns, a later wrapper failure may still have charged, and only the caller
 * knows the difference (see lib/posts/charge-failure.ts).
 *
 * The action string comes from `MESH_TASK_ACTION`, not a literal: the mesh task
 * is `content_variants` but the pricing/ledger action is `post_variants`, and
 * hardcoding either invites a silent mismatch.
 */
export async function generateVariants(postId: string, channels: unknown): Promise<GenerateState> {
  const action = MESH_TASK_ACTION['content_variants']
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) {
      return { ok: false, insufficient: false, message: 'Sign in to generate variants.' }
    }

    const ws = await workspaceForWrite()
    if (!ws.ok) {
      // `insufficient: false` because nothing was charged and nothing could be —
      // there is no wallet to charge. The MESSAGE is the part that was wrong: on
      // an unreadable read it told someone with a workspace to make another.
      return { ok: false, insufficient: false, message: ws.message }
    }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const post = await getPost(postId)
    if (!post) {
      return { ok: false, insufficient: false, message: "You don't have access to this post." }
    }

    // Parse BEFORE the withCredits callback: mesh's runTask does NOT validate
    // input against def.inputSchema, so an unparsed bad input would reserve
    // credits and burn a paid provider call on garbage.
    const parsedInput = ContentVariantsInputSchema.safeParse({
      body: post.body ?? '',
      channels,
    })
    if (!parsedInput.success) {
      return {
        ok: false,
        insufficient: false,
        message: 'Write some body copy and pick at least one channel first.',
      }
    }
    // A SET, because this list is a cost driver. `channels` arrives as `unknown`
    // across a server-action boundary, so the editor now sending a `ChannelSet` is
    // not a guarantee: a hand-rolled call with `['x','x','x']` asks the model for
    // three X variants against one flat charge, and `plan-week.ts` already guards
    // its twin for exactly that reason.
    //
    // `taskInput` — not `parsedInput.data` — is what reaches the model. Deduping
    // only the local `requested` while the raw array went on to `runTask` would be
    // the same half-fix that let the duplicate-channel defect move three times:
    // the check reads the clean list, the expensive path reads the dirty one.
    const requested = toChannelSet(parsedInput.data.channels)
    const taskInput = { ...parsedInput.data, channels: [...requested] }

    // SERVER-DERIVED ledger key, fresh per invocation. A stable ref (posts.id)
    // would let the second generate replay the spent HOLD+DEBIT — no charge, but
    // the paid model call still runs. See lib/posts/object-ref.ts.
    const objectRef = newVariantsObjectRef(workspace.id)
    const traceId = randomUUID()

    // NO ENTITLEMENT GATE HERE, deliberately — no PLAN_CATALOG dimension covers
    // generating variants. See the long note in plan-week.ts for the full reasoning
    // and for why an argument-less `checkEntitlement` call was rejected rather than
    // added. Credits are the real limit; `withCredits` below applies them.
    //
    // The CHANNELS limit is enforced where channels are acquired (the Zernio return
    // route), not here: this action writes variants for channels the workspace has
    // already connected, and refusing at composition time would block a customer
    // from using a connection they legitimately hold.
    let failure: string | null = null
    let delivered = false
    let generated: GeneratedVariant[] = []
    let missing: ReturnType<typeof filterVariants>['missing'] = []

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(contentVariantsTask.def, taskInput, {
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

        // The output schema has no channel cross-check and no .min() — {"variants": []}
        // parses clean. Filter to what was asked for and surface any gap honestly.
        const filtered = filterVariants(requested, result.data)
        if (filtered.variants.length === 0) {
          failure = FAILURE_REASON.NO_VARIANTS
          throw new Error('MESH_EMPTY') // → RELEASE: nothing usable is not a delivery
        }

        generated = filtered.variants.map((v) => {
          const spec = CONSTRAINTS[v.channel]
          // Carry the model's keywords through instead of throwing them away.
          // Bare and deduped (the store holds them un-bracketed; `keywordTail`
          // brackets them at publish), a stray `#` stripped, and capped at the
          // channel's own limit where it has one so an over-eager list can never
          // arrive already failing `validateVariant`.
          const keywords = normalizeKeywords(v.extras?.hashtags, false)
          const hashtags =
            spec.maxHashtags !== undefined ? keywords.slice(0, spec.maxHashtags) : keywords
          return {
            channel: v.channel,
            body: v.body,
            charCount: charCountFor(spec, {
              body: v.body,
              hashtags,
              hasLink: hasLink(v.body),
            }),
            hashtags,
          }
        })
        missing = filtered.missing
        // Last statement before the return: from here on the wrapper owns the
        // outcome, and any failure it reports may still have debited.
        delivered = true
        return filtered
      },
    )

    // The balance moved (or may have, on the delivered-but-failed path).
    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('posts-ai.generateVariants', credits.error)
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
      variants: generated,
      missing,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch (error) {
    // The tag is the SERVER ACTION name, deliberately not the local `action`
    // const — that one is the ledger/pricing key (`post_variants`), and tagging
    // by it would merge two different code paths under one billing label.
    reportServerError(error, { action: 'generateVariants', workspaceId })
    reportPaidActionFailure('posts-ai.generateVariants', error)
    // The billing env loader throws before any HOLD exists — config failures
    // caught here are verifiably uncharged, and a retry cannot fix them.
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return { ok: false, insufficient: false, message: 'Could not generate variants. Try again.' }
  }
}

/**
 * Rewrite the caption (or the selected fragment) for 1 credit. The task returns
 * only the rewritten fragment — splicing it back into the body is the caller's
 * job (`spliceSelection`), so this action returns the fragment alone.
 */
export async function rewriteCaption(
  text: string,
  instruction: unknown,
  selection?: string,
): Promise<RewriteState> {
  const action = MESH_TASK_ACTION['caption_rewrite']
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) {
      return { ok: false, insufficient: false, message: 'Sign in to rewrite this caption.' }
    }

    const ws = await workspaceForWrite()
    if (!ws.ok) {
      // `insufficient: false` because nothing was charged and nothing could be —
      // there is no wallet to charge. The MESSAGE is the part that was wrong: on
      // an unreadable read it told someone with a workspace to make another.
      return { ok: false, insufficient: false, message: ws.message }
    }
    const workspace = ws.workspace
    workspaceId = workspace.id

    // captionRewriteTask's schemas are not re-exported from @sahoda/mesh — the
    // contract lives in @sahoda/shared. Parse before spending anything.
    const parsedInput = CaptionRewriteInputSchema.safeParse({
      text,
      instruction,
      ...(selection ? { selection } : {}),
    })
    if (!parsedInput.success) {
      return { ok: false, insufficient: false, message: 'Write something to rewrite first.' }
    }

    const objectRef = newCaptionRewriteRef(workspace.id)
    const traceId = randomUUID()

    // NO ENTITLEMENT GATE HERE, deliberately — rewriting a caption maps to no
    // PLAN_CATALOG dimension. Same reasoning as generateVariants above.
    let failure: string | null = null
    let delivered = false
    let rewritten = ''

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(captionRewriteTask.def, parsedInput.data, {
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
        if (result.data.text.trim() === '') {
          failure = FAILURE_REASON.EMPTY_REWRITE
          throw new Error('MESH_EMPTY') // → RELEASE: empty is not a rewrite
        }
        rewritten = result.data.text
        delivered = true
        return result.data
      },
    )

    // The balance moved (or may have, on the delivered-but-failed path).
    if (credits.ok || delivered) revalidateBalance()

    if (!credits.ok) {
      reportPaidActionFailure('posts-ai.rewriteCaption', credits.error)
      if (!delivered && isDeploymentConfigCause(credits.error)) {
        return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
      }
      return chargeFailureState({ error: credits.error, action, delivered, reason: failure })
    }

    return {
      ok: true,
      text: rewritten,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch (error) {
    reportServerError(error, { action: 'rewriteCaption', workspaceId })
    reportPaidActionFailure('posts-ai.rewriteCaption', error)
    if (isDeploymentConfigCause(error)) {
      return { ok: false, insufficient: false, message: DEPLOYMENT_CONFIG_MESSAGE }
    }
    return {
      ok: false,
      insufficient: false,
      message: 'Could not rewrite this caption. Try again.',
    }
  }
}
