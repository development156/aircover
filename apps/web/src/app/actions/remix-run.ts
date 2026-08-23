'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, createWithCredits, loadBillingEnv } from '@sahoda/billing'
import { createMesh, type Mesh } from '@sahoda/mesh'
import {
  CONSTRAINTS,
  PostInsertSchema,
  charCountFor,
  creditCost,
  type Channel,
  type RemixDerivative,
  type RemixKind,
  type WithCreditsFn,
} from '@sahoda/shared'

import { reportPaidActionFailure } from '@/lib/actions/paid-failure'
import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { hasLink } from '@/lib/posts/detect-link'
import { ComposeError, composeKind } from '@/lib/remix/compose'
import { plannedCharges, previewBatch } from '@/lib/remix/cost'
import { newRemixBatchRef, newRemixChargeRef } from '@/lib/remix/object-ref'
import * as store from '@/lib/remix/store'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { readBalance } from '@/lib/wallet/read'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * RUNNING A BATCH — the half that spends money.
 *
 * ── THE GATE IS RE-READ FROM THE DATABASE ────────────────────────────────────
 * `approveRemixBatch` writes `approved_at` and `approved_credits`. This function
 * READS them back, from the row it is about to spend against, and refuses if
 * either is absent — whatever the batch's status string says. A batch forced to
 * `running` by hand still has no approval, so it still spends nothing, and
 * `remix-run.refusal.test.ts` proves that by doing exactly that and asserting
 * the ledger was never touched.
 *
 * ── AND THE PRICE IS RE-CHECKED AGAINST WHAT WAS AGREED ──────────────────────
 * A preview that can be overtaken by a price change is not a preview. If the
 * batch re-prices to anything other than `approved_credits`, this refuses and
 * asks for a fresh approval rather than charging a number nobody saw.
 *
 * ── THE BALANCE IS CHECKED BEFORE THE FIRST CHARGE, NOT DURING ───────────────
 * "Show the cost of the whole batch before spending any of it" means the refusal
 * has to happen before charge one, not on charge four with three already spent.
 * So the wallet is read and the WHOLE total is compared against it first.
 *
 * That read is not the enforcement — `withCredits`' HOLD is, and it is the only
 * thing that can be trusted, because a balance can move between the read and the
 * charge. It is what lets the refusal be honest and complete: both numbers, one
 * sentence, and nothing spent.
 *
 * ── EVERY KIND IS ITS OWN `withCredits` CALL ─────────────────────────────────
 * One charge per kind, each releasing its own failure. A single batch-wide
 * charge would bill for twelve drafts when four of the calls failed, and "users
 * never pay for failures" is not a per-batch promise.
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

export type RunState =
  | { ok: true; drafts: number; failedKinds: number; spent: number }
  | { ok: false; insufficient: true; required: number; available: number }
  | { ok: false; insufficient: false; message: string }

export async function runRemixBatch(batchId: string): Promise<RunState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) {
      return { ok: false, insufficient: false, message: 'Sign in to make these drafts.' }
    }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, insufficient: false, message: ws.message }
    workspaceId = ws.workspace.id

    const batch = await store.readBatch(batchId, workspaceId)
    if (!batch) {
      return { ok: false, insufficient: false, message: 'That batch is not here any more.' }
    }

    // ── THE GATE ──────────────────────────────────────────────────────────
    if (batch.approved_at === null || batch.approved_credits === null) {
      return {
        ok: false,
        insufficient: false,
        message: 'Approve the cost first. Nothing has been spent.',
      }
    }
    if (batch.status === 'done') {
      return {
        ok: false,
        insufficient: false,
        message: 'This batch has already been made — nothing was charged again.',
      }
    }
    if (batch.status === 'running') {
      // ── A RUN THAT NEVER FINISHED, AND THE SENTENCE IT MUST NOT SAY ────────
      // Nothing resumes a batch: a request cut off mid-spend leaves this row at
      // `running` for ever. Saying "already made" here would be a claim about
      // work that may have half happened, on a screen whose only button is this
      // one — a dead end wearing a reassurance. `readCurrentBatch` treats
      // `running` as terminal for exactly this reason, so the screen offers a
      // fresh batch and says what became of this one.
      return {
        ok: false,
        insufficient: false,
        message:
          'This batch stopped part-way through. Whatever was written is in your posts, and ' +
          'nothing more will be charged for it — start a new batch when you are ready.',
      }
    }

    const derivatives = await store.readDerivatives(batchId, workspaceId)
    const cost = previewBatch(derivatives)
    if (cost.includedCount === 0) {
      return {
        ok: false,
        insufficient: false,
        message: 'Everything is trimmed out, so there is nothing to make.',
      }
    }
    if (cost.totalCredits !== batch.approved_credits) {
      return {
        ok: false,
        insufficient: false,
        message:
          'The price has changed since this was approved. Approve it again to see the new ' +
          'total. Nothing has been spent.',
      }
    }

    // ── REFUSE BEFORE SPENDING ANY OF IT ──────────────────────────────────
    const wallet = await readBalance()
    if (wallet.status !== 'ok') {
      return {
        ok: false,
        insufficient: false,
        message: 'Sahoda could not read your credit balance, so nothing was started or charged.',
      }
    }
    if (wallet.balance.available < cost.totalCredits) {
      return {
        ok: false,
        insufficient: true,
        required: cost.totalCredits,
        available: wallet.balance.available,
      }
    }

    const source = batch.source_post_id
      ? await readSourceBody(batch.source_post_id, workspaceId)
      : null
    if (source === null || source.trim() === '') {
      return {
        ok: false,
        insufficient: false,
        message: 'The post this came from is gone, so nothing was started or charged.',
      }
    }

    await store.setBatchStatus(batchId, workspaceId, 'running')

    const outcome = await spend({
      batchId,
      workspaceId,
      userId,
      sourceBody: source,
      derivatives,
    })

    await store.setBatchStatus(batchId, workspaceId, outcome.drafts > 0 ? 'done' : 'failed')

    revalidateBalance()
    revalidatePath('/remix')
    revalidatePath('/posts')
    return { ok: true, ...outcome }
  } catch (error) {
    reportServerError(error, { action: 'runRemixBatch', workspaceId })
    reportPaidActionFailure('remix-run.runRemixBatch', error)
    return {
      ok: false,
      insufficient: false,
      message: 'Could not make these drafts. Try again.',
    }
  }
}

/** Charge and write, kind by kind. Every failure releases its own hold. */
async function spend(input: {
  batchId: string
  workspaceId: string
  userId: string
  sourceBody: string
  derivatives: readonly RemixDerivative[]
}): Promise<{ drafts: number; failedKinds: number; spent: number }> {
  const { batchId, workspaceId, userId, sourceBody, derivatives } = input
  const charges = plannedCharges(derivatives)

  let drafts = 0
  let failedKinds = 0
  let spent = 0

  for (const charge of charges) {
    // The batch fee. It buys the run itself — planning is free and this is what
    // the pack price is for. It is FIRST so a wallet that empties mid-batch has
    // paid for the run it got.
    if (charge.kind === null) {
      const fee = await getWithCredits()(
        { workspaceId, action: charge.action, objectRef: newRemixBatchRef(batchId) },
        // The fee buys the run, so the callback records that it started and
        // nothing more. It cannot fail, which is correct: a fee that could
        // "fail" would be a fee for work nobody can point at.
        async () => ({ started: true }),
      )
      if (fee.ok) spent += creditCost(charge.action)
      continue
    }

    const mine = derivatives.filter((d) => charge.derivativeIds.includes(d.id))
    const channels = mine.map((d) => d.channel)
    let failure: string | null = null
    let postId: string | null = null
    let written: RemixDerivative[] = []

    const charged = await getWithCredits()(
      {
        workspaceId,
        action: charge.action,
        objectRef: newRemixChargeRef(batchId, charge.kind),
      },
      async (ctx) => {
        let bodies
        try {
          bodies = await composeKind({
            mesh: getMesh(),
            kind: charge.kind as RemixKind,
            sourceBody,
            channels,
            ctx: {
              workspaceId,
              traceId: randomUUID(),
              userId,
              actionType: ctx.actionType,
              creditsCharged: ctx.creditsCharged,
            },
          })
        } catch (error) {
          // Our own copy, carried on the typed error — never a provider message.
          failure = error instanceof ComposeError ? error.reason : null
          throw new Error('COMPOSE_FAILED') // → RELEASE, no charge
        }

        const saved = await writeDraft({
          workspaceId,
          userId,
          kind: charge.kind as RemixKind,
          sourceBody,
          bodies: bodies.bodies,
          derivatives: mine,
        })
        if (!saved) throw new Error('SAVE_FAILED') // → RELEASE, no charge
        postId = saved.postId
        written = saved.written
        return saved
      },
    )

    if (!charged.ok || postId === null) {
      failedKinds += 1
      for (const derivative of mine) {
        await store.markFailed(derivative.id, workspaceId, failure)
      }
      continue
    }

    // `creditCost(action)` is the same lookup `withCredits` charged — never a
    // number carried back from the callback, which would be a second source of
    // truth about what moved.
    spent += creditCost(charge.action)
    const writtenIds = new Set(written.map((d) => d.id))
    for (const derivative of mine) {
      if (writtenIds.has(derivative.id)) {
        drafts += 1
        await store.markWritten(derivative.id, workspaceId, postId)
        continue
      }
      // A channel the model skipped is SKIPPED and says so — never a blank draft
      // that reads as one nobody has written yet.
      await store.markSkipped(derivative.id, workspaceId)
    }
  }

  return { drafts, failedKinds, spent }
}

/** One draft post per kind, with one channel version per draft it produced. */
async function writeDraft(input: {
  workspaceId: string
  userId: string
  kind: RemixKind
  sourceBody: string
  bodies: ReadonlyMap<Channel, string>
  derivatives: readonly RemixDerivative[]
}): Promise<{ postId: string; written: RemixDerivative[] } | null> {
  const supabase = createServerSupabase()
  const produced = input.derivatives.filter((d) => input.bodies.has(d.channel))
  if (produced.length === 0) return null

  // ── THE CANONICAL BODY ────────────────────────────────────────────────────
  // For `adaptation` the channels genuinely diverge, so the canonical body stays
  // the SOURCE — that is what the per-channel versions are adaptations of. Every
  // other kind produced one new text, and that text is the post.
  const canonical =
    input.kind === 'adaptation'
      ? input.sourceBody
      : (input.bodies.get(produced[0]!.channel) ?? input.sourceBody)

  const row = PostInsertSchema.parse({
    workspace_id: input.workspaceId,
    title: null,
    body: canonical,
    // A DRAFT. Never scheduled, never approved, never published — Remix has no
    // branch that writes any other status, which is what makes "every derivative
    // is a draft a person approves" a property rather than a promise.
    status: 'draft',
    channels: produced.map((d) => d.channel),
    // `manual` because the CHECK has two values and neither is `remix`. The
    // batch tables are what record where this came from, exactly as
    // `loop_briefs` does for the Loop — see the migration header.
    origin: 'manual',
    created_by: input.userId,
  })

  const { data, error } = await supabase.from('posts').insert(row).select('id').single()
  if (error || !data) return null
  const postId = data.id as string

  const { error: variantError } = await supabase.from('post_variants').insert(
    produced.map((derivative) => {
      const body = input.bodies.get(derivative.channel) as string
      return {
        workspace_id: input.workspaceId,
        post_id: postId,
        channel: derivative.channel,
        body,
        format: derivative.format,
        char_count: charCountFor(CONSTRAINTS[derivative.channel], {
          body,
          hasLink: hasLink(body),
        }),
        // Each version carries its OWN words, so it is unlinked — the same call
        // `saveVariant` makes when a person edits one by hand. A linked version
        // would be silently overwritten by the next canonical edit.
        is_linked: false,
      }
    }),
  )
  if (variantError) return null

  return { postId, written: [...produced] }
}

async function readSourceBody(postId: string, workspaceId: string): Promise<string | null> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('posts')
    .select('body')
    .eq('id', postId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  const body = (data as { body?: unknown } | null)?.body
  return typeof body === 'string' ? body : null
}
