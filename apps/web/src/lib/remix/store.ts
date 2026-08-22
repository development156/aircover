import 'server-only'

import {
  RemixBatchSchema,
  RemixDerivativeSchema,
  type RemixBatch,
  type RemixDerivative,
  type RemixDerivativeStatus,
} from '@sahoda/shared'
import { isPostFormat } from '@sahoda/publishing/format'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * READING AND WRITING A REMIX BATCH, under the caller's own RLS.
 *
 * ── WHY THIS IS NOT A DIRECT POSTGRES POOL LIKE THE LOOP'S STORE ─────────────
 * `lib/loop/store.ts` opens an owner connection because `loop_cycles` carries a
 * READ-ONLY tenant policy — a member may look at what the Loop did and may not
 * edit it, so the RLS client cannot write those rows at all.
 *
 * Remix is not like that. `remix_batches` and `remix_derivatives` take the
 * standard `app.apply_tenant_policies` set, because nothing in them is money and
 * nothing in them is PII: they hold which derivatives a person asked for and
 * which ones got written. So every statement below runs under the member's own
 * policy, which means the tenant boundary is enforced by the database rather
 * than by a `workspace_id` this module remembered to put in a WHERE clause.
 *
 * The workspace id is still passed and still filtered on. That is a CORRECTNESS
 * filter, not an authorization one: the member policy admits every workspace the
 * user belongs to, so a second membership would otherwise fold two tenants'
 * batches into one screen.
 */

/** A row that does not parse is DROPPED, never rendered as a half-row. */
function parseDerivative(row: unknown): RemixDerivative | null {
  const parsed = RemixDerivativeSchema.safeParse(row)
  if (!parsed.success) return null
  // The format vocabulary lives in @sahoda/publishing and the schema carries a
  // plain string (see RemixDerivativeSchema). This is where it is narrowed: a
  // stored format the vocabulary does not know is a derivative nothing can
  // publish, and showing it would offer a format that does not exist.
  if (!isPostFormat(parsed.data.format)) return null
  return parsed.data
}

export interface NewDerivative {
  readonly kind: RemixDerivative['kind']
  readonly channel: RemixDerivative['channel']
  readonly format: string
}

export interface CreatedBatch {
  readonly batch: RemixBatch
  readonly derivatives: readonly RemixDerivative[]
}

/**
 * Write a planned batch. CHARGES NOTHING — see `lib/remix/cost.ts` for why the
 * batch fee waits for the run.
 */
export async function createBatch(input: {
  workspaceId: string
  createdBy: string
  sourcePostId: string | null
  sourceTitle: string | null
  sourceCredit: string | null
  derivatives: readonly NewDerivative[]
}): Promise<CreatedBatch | null> {
  const supabase = createServerSupabase()

  const { data: batchRow, error: batchError } = await supabase
    .from('remix_batches')
    .insert({
      workspace_id: input.workspaceId,
      created_by: input.createdBy,
      source_post_id: input.sourcePostId,
      source_title: input.sourceTitle,
      source_credit: input.sourceCredit,
    })
    .select('*')
    .single()
  if (batchError || !batchRow) return null

  const batch = RemixBatchSchema.safeParse(batchRow)
  if (!batch.success) return null

  const { data: rows, error } = await supabase
    .from('remix_derivatives')
    .insert(
      input.derivatives.map((d) => ({
        workspace_id: input.workspaceId,
        batch_id: batch.data.id,
        kind: d.kind,
        channel: d.channel,
        format: d.format,
      })),
    )
    .select('*')
  if (error) return null

  const derivatives = (rows ?? []).flatMap((row) => {
    const parsed = parseDerivative(row)
    return parsed ? [parsed] : []
  })
  return { batch: batch.data, derivatives }
}

export async function readBatch(batchId: string, workspaceId: string): Promise<RemixBatch | null> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('remix_batches')
    .select('*')
    .eq('id', batchId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  const parsed = RemixBatchSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function readDerivatives(
  batchId: string,
  workspaceId: string,
): Promise<RemixDerivative[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('remix_derivatives')
    .select('*')
    .eq('batch_id', batchId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  return (data ?? []).flatMap((row) => {
    const parsed = parseDerivative(row)
    return parsed ? [parsed] : []
  })
}

/** Trim, or put back. Only legal while the batch is still `planned`. */
export async function setIncluded(
  derivativeId: string,
  workspaceId: string,
  included: boolean,
): Promise<boolean> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('remix_derivatives')
    .update({ included })
    .eq('id', derivativeId)
    .eq('workspace_id', workspaceId)
  return !error
}

/**
 * THE APPROVAL — the only way a batch reaches a state the runner will act on.
 *
 * `approved_credits` is the total the person was looking at. The runner
 * re-prices the batch and refuses if the two disagree, so a price change between
 * the approval and the run cannot charge a number nobody saw.
 *
 * Conditional on `status = 'planned'`, so approving twice does not move a batch
 * that is already running, and so a race between two tabs settles in the
 * database rather than in whichever request happened to arrive second.
 */
export async function approveBatch(input: {
  batchId: string
  workspaceId: string
  approvedBy: string
  approvedCredits: number
}): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('remix_batches')
    .update({
      status: 'approved',
      approved_credits: input.approvedCredits,
      approved_at: new Date().toISOString(),
      approved_by: input.approvedBy,
    })
    .eq('id', input.batchId)
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'planned')
    .select('id')
  return !error && (data ?? []).length === 1
}

export async function setBatchStatus(
  batchId: string,
  workspaceId: string,
  status: RemixBatch['status'],
): Promise<void> {
  const supabase = createServerSupabase()
  await supabase
    .from('remix_batches')
    .update({ status })
    .eq('id', batchId)
    .eq('workspace_id', workspaceId)
}

async function settleDerivative(input: {
  derivativeId: string
  workspaceId: string
  status: RemixDerivativeStatus
  postId: string | null
  failure: string | null
}): Promise<void> {
  const supabase = createServerSupabase()
  await supabase
    .from('remix_derivatives')
    .update({ status: input.status, post_id: input.postId, failure: input.failure })
    .eq('id', input.derivativeId)
    .eq('workspace_id', input.workspaceId)
}

/**
 * ── THREE NAMED OUTCOMES INSTEAD OF ONE `status` ARGUMENT ────────────────────
 * Not sugar. `remix-run.ts` writes BOTH vocabularies — a `posts.status` when it
 * inserts a draft, and a `remix_derivatives.status` when it settles one — and
 * `schedule-status-reachability.test.ts` scans every file that touches `posts`
 * for `status: '…'` literals, so a derivative settling to `'failed'` in that
 * file read as apps/web writing a FAILED POST. The guard was right to fail:
 * two `status` vocabularies spelled the same way in one file is a genuine
 * ambiguity, and widening its allow-list to admit `failed` would have made a
 * real `posts.status = 'failed'` write invisible to it forever.
 *
 * So the literals live here, in a file that does not touch `posts` at all.
 */
export function markWritten(
  derivativeId: string,
  workspaceId: string,
  postId: string,
): Promise<void> {
  return settleDerivative({ derivativeId, workspaceId, status: 'written', postId, failure: null })
}

export function markFailed(
  derivativeId: string,
  workspaceId: string,
  failure: string | null,
): Promise<void> {
  return settleDerivative({ derivativeId, workspaceId, status: 'failed', postId: null, failure })
}

/** A channel the model returned nothing for. Never a blank draft. */
export function markSkipped(derivativeId: string, workspaceId: string): Promise<void> {
  return settleDerivative({
    derivativeId,
    workspaceId,
    status: 'skipped',
    postId: null,
    failure: 'The model returned nothing for this channel.',
  })
}

/** The batches this workspace has run, newest first. */
export async function listBatches(workspaceId: string, limit: number): Promise<RemixBatch[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('remix_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).flatMap((row) => {
    const parsed = RemixBatchSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}
