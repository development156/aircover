'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { OpsQaStatusSchema } from '@sahoda/shared'
import { z } from 'zod'

import {
  QA_DRAFT_CLOSED,
  QA_NOT_PERMITTED,
  QA_WRITE_FAILED,
  type OpsWriteState,
  type QaDraftState,
  type QaUploadState,
} from '@/lib/ops/action-state'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { ARTIFACT_MAX_BYTES, ARTIFACT_MIME_TYPES, artifactPath } from '@/lib/ops/qa-draft'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The QA composer's writes (doc 13 §11).
 *
 * Authorisation is the database's, as everywhere under /admin: every RPC here
 * calls `app.ops_writer()` and then checks the run is the CALLER'S OWN and still
 * running. That second half matters more here than on the board — a finished QA
 * run is evidence, and `ops_qa_draft_save` / `ops_qa_finalize` /
 * `ops_qa_artifact_add` all refuse to touch one. None of them takes an actor
 * parameter, so a caller cannot file a run in somebody else's name.
 *
 * Uploads are signed rather than proxied. A 10 MB screenshot through a server
 * action would mean raising `serverActions.bodySizeLimit` app-wide, which is a
 * new DoS surface on every action to solve a problem storage already solves.
 */

const BUCKET = 'qa-artifacts'
const PG_NOT_PERMITTED = '42501'

/** The RPCs raise this when the run is finished, missing, or somebody else's. */
const DRAFT_CLOSED = 'OPS_QA_DRAFT_NOT_OPEN'

function refusal(error: { code?: string | null; message?: string | null }): string {
  if (error.code === PG_NOT_PERMITTED) return QA_NOT_PERMITTED
  if ((error.message ?? '').includes(DRAFT_CLOSED)) return QA_DRAFT_CLOSED
  return QA_WRITE_FAILED
}

const TaskCodeSchema = z.string().regex(/^SL-\d{1,4}$/)

const DraftSchema = z
  .object({
    runId: z.uuid().nullable(),
    taskCode: TaskCodeSchema.nullable(),
    // Generous but bounded. Autosave runs every 2 s; an unbounded body is an
    // unbounded write on a timer.
    summary: z.string().max(2000),
    details: z.string().max(50_000),
  })
  .strict()

export async function saveQaDraft(input: unknown): Promise<QaDraftState> {
  try {
    await requireOpsAdmin()

    const parsed = DraftSchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: QA_WRITE_FAILED }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_qa_draft_save', {
      p_run_id: parsed.data.runId,
      p_task_code: parsed.data.taskCode,
      p_summary: parsed.data.summary,
      p_details: parsed.data.details,
    })

    if (error) return { ok: false, message: refusal(error) }
    if (typeof data !== 'string') return { ok: false, message: QA_WRITE_FAILED }

    // Deliberately NOT revalidating on every autosave — this fires every 2 s,
    // and re-rendering the console under someone's cursor while they type is a
    // worse bug than a slightly stale feed. The list refreshes on finalize.
    return { ok: true, runId: data }
  } catch (error) {
    await reportServerError(error, { action: 'saveQaDraft' })
    return { ok: false, message: QA_WRITE_FAILED }
  }
}

const FinalizeSchema = z
  .object({
    runId: z.uuid(),
    status: OpsQaStatusSchema.refine(
      (value) => value === 'pass' || value === 'fail' || value === 'blocked',
      'A run finishes as pass, fail or blocked.',
    ),
    summary: z.string().min(1).max(2000),
  })
  .strict()

export async function finalizeQaRun(input: unknown): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = FinalizeSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? QA_WRITE_FAILED }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_qa_finalize', {
      p_run_id: parsed.data.runId,
      p_status: parsed.data.status,
      p_summary: parsed.data.summary,
    })

    if (error) return { ok: false, message: refusal(error) }

    revalidatePath('/admin/qa')
    revalidatePath('/admin/dev')
    return { ok: true }
  } catch (error) {
    await reportServerError(error, { action: 'finalizeQaRun' })
    return { ok: false, message: QA_WRITE_FAILED }
  }
}

const UploadSchema = z
  .object({
    runId: z.uuid(),
    mime: z.enum(ARTIFACT_MIME_TYPES),
    bytes: z.number().int().positive().max(ARTIFACT_MAX_BYTES),
  })
  .strict()

/**
 * Mint a one-shot upload URL for one screenshot.
 *
 * The size and type are re-checked HERE and not merely in the browser, because
 * this is what decides whether a URL is issued at all. `checkArtifact` in the
 * composer exists to tell a person early; this exists to be true.
 *
 * The path is derived server-side from a fresh uuid, so a caller cannot choose
 * where their file lands or overwrite an existing artifact by naming its path.
 */
export async function signQaUpload(input: unknown): Promise<QaUploadState> {
  try {
    await requireOpsAdmin()

    const parsed = UploadSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, message: 'Screenshots only — PNG, JPEG or WebP, up to 10 MB.' }
    }

    const supabase = createServerSupabase()

    // The run must be the caller's own and still open BEFORE a URL is issued.
    // The bucket policy admits any ops admin, so without this a stray run id
    // would let one admin drop files into another's folder.
    const { data: run, error: runError } = await supabase
      .from('ops_qa_runs')
      .select('id,status,actor')
      .eq('id', parsed.data.runId)
      .maybeSingle()

    if (runError) return { ok: false, message: QA_WRITE_FAILED }
    if (!run || run.status !== 'running') return { ok: false, message: QA_DRAFT_CLOSED }

    const admin = await requireOpsAdmin()
    if (run.actor?.toLowerCase() !== admin.email.toLowerCase()) {
      return { ok: false, message: QA_DRAFT_CLOSED }
    }

    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[
      parsed.data.mime
    ]
    const path = artifactPath(parsed.data.runId, randomUUID(), extension)

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return { ok: false, message: QA_WRITE_FAILED }

    return { ok: true, path: data.path, signedUrl: data.signedUrl, token: data.token }
  } catch (error) {
    await reportServerError(error, { action: 'signQaUpload' })
    return { ok: false, message: QA_WRITE_FAILED }
  }
}

const RecordSchema = z
  .object({
    runId: z.uuid(),
    path: z.string().min(1).max(400),
    bytes: z.number().int().positive().max(ARTIFACT_MAX_BYTES),
    mime: z.enum(ARTIFACT_MIME_TYPES),
    caption: z.string().max(300).nullable(),
  })
  .strict()

/** Record an upload that has already landed. `ops_qa_artifact_add` re-checks all of it. */
export async function recordQaArtifact(input: unknown): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = RecordSchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: QA_WRITE_FAILED }

    // The path is only ever one this server minted for this run. Accepting an
    // arbitrary string would let a caller point a QA artifact row at any object
    // in the bucket, including another run's screenshots.
    if (!parsed.data.path.startsWith(`qa/${parsed.data.runId}/`)) {
      return { ok: false, message: QA_WRITE_FAILED }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_qa_artifact_add', {
      p_run_id: parsed.data.runId,
      p_storage_path: parsed.data.path,
      p_bytes: parsed.data.bytes,
      p_mime: parsed.data.mime,
      p_caption: parsed.data.caption,
    })

    if (error) return { ok: false, message: refusal(error) }

    revalidatePath('/admin/qa')
    return { ok: true }
  } catch (error) {
    await reportServerError(error, { action: 'recordQaArtifact' })
    return { ok: false, message: QA_WRITE_FAILED }
  }
}
