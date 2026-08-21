'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { ChannelSchema, RemixKindSchema, type Channel, type RemixKind } from '@sahoda/shared'

import { channelsForKind, formatForKind } from '@/lib/remix/catalogue'
import { previewBatch } from '@/lib/remix/cost'
import * as store from '@/lib/remix/store'
import { getPost } from '@/lib/posts/read'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * PLANNING A REMIX BATCH — the half that spends nothing.
 *
 * ── WHY PLANNING IS FREE, AND WHY THAT IS NOT AN OVERSIGHT ───────────────────
 * The Loop charges its orchestration fee at preview time because its plan stage
 * makes a real model call. Remix's plan stage makes none: it reads the
 * catalogue, works out which channel can carry which format, and writes rows.
 * Charging for that would bill for nothing, and it would break the promise the
 * whole screen is built around — that the total is shown BEFORE anything is
 * spent. `remix-run.ts` is where the money is, and it refuses to start on a
 * batch nobody approved.
 */

export interface PlanState {
  ok: boolean
  batchId?: string
  message?: string
}

/** How many derivatives one batch may hold. The catalogue's own ceiling. */
const MAX_DERIVATIVES = 32

/**
 * Turn one post into a plan.
 *
 * `kinds` and `channels` arrive as `unknown` across the server-action boundary,
 * so both are parsed rather than trusted. A hand-rolled call with the same
 * channel four times would otherwise plan four identical drafts — the shape of
 * the duplicate-channel defect this repo has already fixed three times, so the
 * dedupe happens on the way in, once, where both the count and the write can see
 * it.
 */
export async function planRemix(
  sourcePostId: string,
  kinds: unknown,
  channels: unknown,
): Promise<PlanState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to remix a post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const wantedKinds = parseUnique(kinds, (v) => RemixKindSchema.safeParse(v))
    const wantedChannels = parseUnique(channels, (v) => ChannelSchema.safeParse(v))
    if (wantedKinds.length === 0 || wantedChannels.length === 0) {
      return { ok: false, message: 'Pick at least one thing to make, and one channel.' }
    }

    const post = await getPost(sourcePostId)
    if (!post) return { ok: false, message: "You don't have access to this post." }
    if ((post.body ?? '').trim() === '') {
      return { ok: false, message: 'This post has no words in it yet, so there is nothing to remix.' }
    }

    const derivatives = planDerivatives(wantedKinds, wantedChannels)
    if (derivatives.length === 0) {
      return {
        ok: false,
        message: 'None of those channels can carry any of those, so there is nothing to make.',
      }
    }
    if (derivatives.length > MAX_DERIVATIVES) {
      // Unreachable with four kinds and four channels, and asserted anyway: a
      // fifth kind must be a decision somebody takes here rather than a batch
      // that quietly grows past what a person can read.
      return { ok: false, message: 'That is more than one batch can hold.' }
    }

    const created = await store.createBatch({
      workspaceId,
      createdBy: userId,
      sourcePostId: post.id,
      sourceTitle: post.title,
      // The attribution line, copied at plan time so it survives the source
      // being edited or deleted. See the migration header.
      sourceCredit: sourceCreditFor(post.title, post.created_by),
      derivatives,
    })
    if (!created) return { ok: false, message: 'Could not start this batch — try again.' }

    revalidatePath('/remix')
    return { ok: true, batchId: created.batch.id }
  } catch (error) {
    reportServerError(error, { action: 'planRemix', workspaceId })
    return { ok: false, message: 'Could not start this batch — try again.' }
  }
}

/** Trim a draft out of the batch, or put it back. Free, and only before the run. */
export async function setDerivativeIncluded(
  derivativeId: string,
  batchId: string,
  included: boolean,
): Promise<{ ok: boolean; message?: string }> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this batch.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // Trimming after the approval would change what the person agreed to pay
    // for AFTER they agreed to it. The runner re-prices and would refuse, but
    // refusing here is the honest place — the button should not appear to work.
    const batch = await store.readBatch(batchId, workspaceId)
    if (!batch) return { ok: false, message: 'That batch is not here any more.' }
    if (batch.status !== 'planned') {
      return { ok: false, message: 'This batch has been approved, so it cannot be changed.' }
    }

    const done = await store.setIncluded(derivativeId, workspaceId, included)
    if (!done) return { ok: false, message: 'Could not change that — try again.' }
    revalidatePath('/remix')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setDerivativeIncluded', workspaceId })
    return { ok: false, message: 'Could not change that — try again.' }
  }
}

export interface ApproveState {
  ok: boolean
  approvedCredits?: number
  message?: string
}

/**
 * THE APPROVAL — recording, in the database, the total a person was looking at.
 *
 * This is what `remix-run.ts` reads. It writes no credit and calls no model; it
 * is the halt made into a stored fact so that "nothing spends without an
 * approval" can be TESTED by forcing the state and watching the balance stay
 * put, rather than being an `if` inside the function that spends the money.
 */
export async function approveRemixBatch(batchId: string): Promise<ApproveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to approve this.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const derivatives = await store.readDerivatives(batchId, workspaceId)
    if (derivatives.length === 0) return { ok: false, message: 'That batch is not here any more.' }

    const cost = previewBatch(derivatives)
    if (cost.includedCount === 0) {
      return { ok: false, message: 'Everything is trimmed out, so there is nothing to make.' }
    }

    const approved = await store.approveBatch({
      batchId,
      workspaceId,
      approvedBy: userId,
      approvedCredits: cost.totalCredits,
    })
    if (!approved) {
      return { ok: false, message: 'This batch has already been approved.' }
    }

    revalidatePath('/remix')
    return { ok: true, approvedCredits: cost.totalCredits }
  } catch (error) {
    reportServerError(error, { action: 'approveRemixBatch', workspaceId })
    return { ok: false, message: 'Could not approve this — try again.' }
  }
}

/** Every (kind, channel) pair that is genuinely producible, in catalogue order. */
function planDerivatives(
  kinds: readonly RemixKind[],
  channels: readonly Channel[],
): store.NewDerivative[] {
  const out: store.NewDerivative[] = []
  for (const kind of kinds) {
    for (const channel of channelsForKind(kind)) {
      if (!channels.includes(channel)) continue
      const format = formatForKind(kind, channel)
      // Unreachable — `channelsForKind` is derived from the same function — and
      // written as a guard rather than a `!` so a change to one of them fails
      // by producing fewer drafts rather than a row the column refuses.
      if (format === null) continue
      out.push({ kind, channel, format })
    }
  }
  return out
}

/**
 * The credit line stored on every derivative.
 *
 * Deliberately plain and deliberately not a claim about ownership: Sahoda knows
 * who pressed the button on the source post inside this workspace, and nothing
 * more than that. A line reading "original work of X" would be a claim nobody
 * here can support.
 */
function sourceCreditFor(title: string | null, createdBy: string | null): string {
  const named = title?.trim() ? `“${title.trim()}”` : 'an untitled post'
  return createdBy ? `Remixed from ${named} in this workspace.` : `Remixed from ${named}.`
}

/** Parse a list of `unknown` into a de-duplicated list of valid values. */
function parseUnique<T>(
  raw: unknown,
  parse: (value: unknown) => { success: true; data: T } | { success: false },
): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const value of raw) {
    const parsed = parse(value)
    if (!parsed.success) continue
    if (!out.includes(parsed.data)) out.push(parsed.data)
  }
  return out
}
