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

import { RemixReadError } from './read-error'

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

  // ── ONE TRANSACTION, THROUGH AN RLS-SCOPED RPC ─────────────────────────────
  // This used to insert the batch, then SEPARATELY insert the derivatives. A
  // refused second insert left an orphan batch a planner could read and never
  // run. `remix_create_batch` (20260906033000) folds both into one function, so
  // a raise on any derivative rolls the batch back with it. It is SECURITY
  // INVOKER, so the same tenant policy that guarded these inserts still does —
  // the boundary did not move, only the transaction did.
  const { data: batchId, error: rpcError } = await supabase.rpc('remix_create_batch', {
    p_workspace_id: input.workspaceId,
    p_created_by: input.createdBy,
    p_source_post_id: input.sourcePostId,
    p_source_title: input.sourceTitle,
    p_source_credit: input.sourceCredit,
    p_derivatives: input.derivatives.map((d) => ({
      kind: d.kind,
      channel: d.channel,
      format: d.format,
    })),
  })
  if (rpcError || typeof batchId !== 'string') return null

  // Read back what the transaction wrote, under the same RLS. Two reads rather
  // than trusting the client's own input for what got stored.
  const { data: batchRow, error: batchError } = await supabase
    .from('remix_batches')
    .select('*')
    .eq('id', batchId)
    .eq('workspace_id', input.workspaceId)
    .single()
  if (batchError || !batchRow) return null

  const batch = RemixBatchSchema.safeParse(batchRow)
  if (!batch.success) return null

  const { data: rows, error } = await supabase
    .from('remix_derivatives')
    .select('*')
    .eq('batch_id', batchId)
    .eq('workspace_id', input.workspaceId)
    .order('created_at', { ascending: true })
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
  const { data, error } = await supabase
    .from('remix_derivatives')
    .select('*')
    .eq('batch_id', batchId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  // A refused read is NOT a batch with no drafts. See `listBatches`.
  if (error) throw new RemixReadError('remix_derivatives')
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

/**
 * CLAIM THIS BATCH FOR A RUN, OR LOSE THE RACE. Returns whether we won.
 *
 * ── THE READ-THEN-WRITE GAP THIS CLOSES ──────────────────────────────────────
 * `runRemixBatch` read `batch.status`, refused `running` and `done`, and then
 * wrote `running` through `setBatchStatus` — which carries no status predicate,
 * returns void and drops the error. Two tabs, or one double-click, both passed
 * the read before either wrote, and both went on to spend: the customer paid for
 * the same batch twice.
 *
 * `withCredits` cannot back-stop it, because `object-ref.ts` mints a fresh
 * `randomUUID` per run, so the exactly-once key never matches between the two.
 *
 * The proof that this was an omission rather than a design is thirty lines up:
 * `approveBatch` guards the identical transition with `.eq('status','planned')`
 * AND checks the returned row count. This is that, for the run.
 *
 * `not in (running, done)` rather than `eq(approved)` on purpose: a batch that
 * FAILED may legitimately be run again, and that is the existing behaviour —
 * the gate above this call is what decides, and this only has to make the
 * decision atomic.
 */
export async function startBatchRun(batchId: string, workspaceId: string): Promise<boolean> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('remix_batches')
    .update({ status: 'running' })
    .eq('id', batchId)
    .eq('workspace_id', workspaceId)
    .not('status', 'in', '("running","done")')
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

/**
 * The batches this workspace has run, newest first.
 *
 * ── A REFUSED READ THROWS. IT IS NEVER AN EMPTY LIST ─────────────────────────
 * This used to destructure `data` alone and return `data ?? []`, so a query the
 * database refused came back as "no batches", `readCurrentBatch` turned that
 * into null, and /remix rendered the free planner as though the workspace had
 * never made anything. "Sahoda could not read your batches" and "you have no
 * batches" are different claims, and only one of them was true. The throw is
 * `RemixReadError`, which `read.ts` catches and turns into its own outcome;
 * `readDerivatives` does the same.
 */
export async function listBatches(workspaceId: string, limit: number): Promise<RemixBatch[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('remix_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new RemixReadError('remix_batches')
  return (data ?? []).flatMap((row) => {
    const parsed = RemixBatchSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}
