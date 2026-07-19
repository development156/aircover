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
  type CreditInsufficientDetails,
  type WithCreditsFn,
} from '@sahoda/shared'

import { hasLink } from '@/lib/posts/detect-link'
import { getPost } from '@/lib/posts/read'
import { filterVariants } from '@/lib/posts/filter-variants'
import { newCaptionRewriteRef, newVariantsObjectRef } from '@/lib/posts/object-ref'
import type { GenerateState, GeneratedVariant, RewriteState } from '@/lib/posts/state'
import { getActiveWorkspace } from '@/lib/workspaces'

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
 * any failure throws inside the wrapper so the HOLD is RELEASED and the user is
 * not charged.
 *
 * The action string comes from `MESH_TASK_ACTION`, not a literal: the mesh task
 * is `content_variants` but the pricing/ledger action is `post_variants`, and
 * hardcoding either invites a silent mismatch.
 */
export async function generateVariants(postId: string, channels: unknown): Promise<GenerateState> {
  const action = MESH_TASK_ACTION['content_variants']
  try {
    const { userId } = await auth()
    if (!userId) {
      return { ok: false, insufficient: false, message: 'Sign in to generate variants.' }
    }

    const workspace = await getActiveWorkspace()
    if (!workspace) {
      return { ok: false, insufficient: false, message: 'Create a workspace first.' }
    }

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
    const requested = parsedInput.data.channels

    // SERVER-DERIVED ledger key, fresh per invocation. A stable ref (posts.id)
    // would let the second generate replay the spent HOLD+DEBIT — no charge, but
    // the paid model call still runs. See lib/posts/object-ref.ts.
    const objectRef = newVariantsObjectRef(workspace.id)
    const traceId = randomUUID()

    // TODO(owner ruling #5): entitlements are a SEPARATE gate called BEFORE
    // withCredits at every AI entry point. Mount it here once @sahoda/billing
    // ships the gate helper — today only the credit balance limits this action.
    let failure: string | null = null
    let generated: GeneratedVariant[] = []
    let missing: ReturnType<typeof filterVariants>['missing'] = []

    const credits = await getWithCredits()(
      { workspaceId: workspace.id, action, objectRef },
      async (ctx) => {
        const result = await getMesh().runTask(contentVariantsTask.def, parsedInput.data, {
          workspaceId: workspace.id,
          traceId,
          userId,
          actionType: ctx.actionType,
          creditsCharged: ctx.creditsCharged,
        })
        if (!result.ok) {
          failure = result.error.message
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }

        // The output schema has no channel cross-check and no .min() — {"variants": []}
        // parses clean. Filter to what was asked for and surface any gap honestly.
        const filtered = filterVariants(requested, result.data)
        if (filtered.variants.length === 0) {
          failure = 'The model returned no usable variants.'
          throw new Error('MESH_EMPTY') // → RELEASE: nothing usable is not a delivery
        }

        generated = filtered.variants.map((v) => ({
          channel: v.channel,
          body: v.body,
          charCount: charCountFor(CONSTRAINTS[v.channel], {
            body: v.body,
            hashtags: v.extras?.hashtags,
            hasLink: hasLink(v.body),
          }),
        }))
        missing = filtered.missing
        return filtered
      },
    )

    if (!credits.ok) return chargeFailure(credits.error, action, failure)

    return {
      ok: true,
      variants: generated,
      missing,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch {
    return { ok: false, insufficient: false, message: 'Could not generate variants — try again.' }
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
  try {
    const { userId } = await auth()
    if (!userId) {
      return { ok: false, insufficient: false, message: 'Sign in to rewrite this caption.' }
    }

    const workspace = await getActiveWorkspace()
    if (!workspace) {
      return { ok: false, insufficient: false, message: 'Create a workspace first.' }
    }

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

    // TODO(owner ruling #5): entitlement gate goes here, before withCredits.
    let failure: string | null = null
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
          failure = result.error.message
          throw new Error('MESH_ERROR') // → RELEASE, no charge
        }
        if (result.data.text.trim() === '') {
          failure = 'The model returned an empty rewrite.'
          throw new Error('MESH_EMPTY') // → RELEASE: empty is not a rewrite
        }
        rewritten = result.data.text
        return result.data
      },
    )

    if (!credits.ok) return chargeFailure(credits.error, action, failure)

    return {
      ok: true,
      text: rewritten,
      balanceAfter: credits.data.balanceAfter,
      creditsCharged: creditCost(action),
    }
  } catch {
    return {
      ok: false,
      insufficient: false,
      message: 'Could not rewrite this caption — try again.',
    }
  }
}

/**
 * Shared failure mapping. An insufficient balance is the one expected rejection
 * and gets the top-up path; every other failure carries the honest reason the
 * callback stashed (which survives the RELEASE) and states no charge was made.
 */
function chargeFailure(
  error: { code: string; message: string; details?: unknown },
  action: Parameters<typeof creditCost>[0],
  failure: string | null,
):
  | { ok: false; insufficient: true; required: number; available: number }
  | {
      ok: false
      insufficient: false
      message: string
    } {
  if (error.code === 'CREDIT_INSUFFICIENT') {
    const details = error.details as CreditInsufficientDetails | undefined
    return {
      ok: false,
      insufficient: true,
      required: details?.required ?? creditCost(action),
      available: details?.available ?? 0,
    }
  }
  return {
    ok: false,
    insufficient: false,
    message: failure
      ? "That didn't work, so you were not charged — try again."
      : 'Could not complete this action — you were not charged.',
  }
}
