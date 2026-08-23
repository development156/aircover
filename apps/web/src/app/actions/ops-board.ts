'use server'

import { revalidatePath } from 'next/cache'
import { OpsTaskColumnSchema, OpsAssigneeSchema } from '@sahoda/shared'
import { z } from 'zod'

import {
  NOT_PERMITTED,
  WRITE_FAILED,
  type OpsCreateState,
  type OpsWriteState,
  type TaskEditPatch,
  type TaskMoveInput,
} from '@/lib/ops/action-state'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Human writes to the board (doc 13 §10).
 *
 * Every one of these calls a `public.ops_task_*` SECURITY DEFINER function with
 * the caller's own Clerk JWT. The function calls `app.ops_writer()` first, which
 * raises 42501 unless the caller is an ACTIVE owner or admin — so authorisation
 * is decided in one place, by the database, and these actions cannot grant
 * themselves anything by forgetting a check.
 *
 * `requireOpsAdmin()` still runs here. It is not the authorisation — the RPC is —
 * but it means a signed-out request 404s at the boundary instead of travelling
 * to Postgres to be told no.
 *
 * The RPC stamps `moved_by = 'human'` itself. It is not a parameter, so an agent
 * holding the ingest token cannot reach these paths and a human cannot be
 * recorded as the agent.
 */

const CodeSchema = z.string().regex(/^SL-\d{1,4}$/, 'Task codes look like SL-12.')

/** Postgres `insufficient_privilege`. The only refusal we can name precisely. */
const PG_NOT_PERMITTED = '42501'

function refusal(error: { code?: string | null; message?: string | null }): string {
  return error.code === PG_NOT_PERMITTED ? NOT_PERMITTED : WRITE_FAILED
}

/** Both admin surfaces read the board, so both have to be re-read after a write. */
function revalidateBoard(): void {
  revalidatePath('/admin/dev')
  revalidatePath('/admin/qa')
}

export async function moveTask(input: TaskMoveInput): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = z
      .object({
        code: CodeSchema,
        column: OpsTaskColumnSchema,
        note: z.string().trim().max(500).nullish(),
      })
      .safeParse(input)
    if (!parsed.success) return { ok: false, message: 'That card could not be moved.' }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_task_move', {
      p_code: parsed.data.code,
      p_column: parsed.data.column,
      p_note: parsed.data.note ?? null,
    })
    if (error) return { ok: false, message: refusal(error) }

    revalidateBoard()
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'moveTask' })
    return { ok: false, message: WRITE_FAILED }
  }
}

export async function editTask(code: string, patch: TaskEditPatch): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsedCode = CodeSchema.safeParse(code)
    if (!parsedCode.success) return { ok: false, message: 'That card could not be edited.' }

    const parsed = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        detail: z.string().trim().max(2000).nullish(),
        assignee: OpsAssigneeSchema.optional(),
        roadmapCode: z.string().trim().max(40).nullish(),
        blocked: z.boolean().optional(),
        blockedReason: z.string().trim().max(500).nullish(),
        sort: z.int().optional(),
      })
      .strict()
      .safeParse(patch)
    if (!parsed.success) return { ok: false, message: 'That change was not valid.' }

    // Blocking without a reason is the one edit that would make the board lie:
    // a crimson ribbon with nothing behind it (doc 13 §10).
    if (parsed.data.blocked === true && !parsed.data.blockedReason?.trim()) {
      return { ok: false, message: 'Say what is blocking it. A blocked card needs a reason.' }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_task_edit', {
      p_code: parsedCode.data,
      p_title: parsed.data.title ?? null,
      p_detail: parsed.data.detail ?? null,
      p_assignee: parsed.data.assignee ?? null,
      p_roadmap_code: parsed.data.roadmapCode ?? null,
      p_blocked: parsed.data.blocked ?? null,
      p_blocked_reason: parsed.data.blockedReason ?? null,
      p_sort: parsed.data.sort ?? null,
    })
    if (error) return { ok: false, message: refusal(error) }

    revalidateBoard()
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'editTask' })
    return { ok: false, message: WRITE_FAILED }
  }
}

export async function createTask(input: {
  title: string
  detail?: string | null
  roadmapCode?: string | null
  assignee?: string
}): Promise<OpsCreateState> {
  try {
    await requireOpsAdmin()

    const parsed = z
      .object({
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(2000).nullish(),
        roadmapCode: z.string().trim().max(40).nullish(),
        assignee: OpsAssigneeSchema.default('claude'),
      })
      .strict()
      .safeParse(input)
    if (!parsed.success) return { ok: false, message: 'Give the card a title first.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_task_create', {
      p_title: parsed.data.title,
      p_detail: parsed.data.detail ?? null,
      p_roadmap_code: parsed.data.roadmapCode ?? null,
      p_assignee: parsed.data.assignee,
    })
    if (error) return { ok: false, message: refusal(error) }

    // The RPC allocates the next SL code and returns it. A create that cannot
    // say which card it made has not really succeeded.
    const code = typeof data === 'string' ? data : ''
    if (!code) return { ok: false, message: WRITE_FAILED }

    revalidateBoard()
    return { ok: true, code }
  } catch (error) {
    reportServerError(error, { action: 'createTask' })
    return { ok: false, message: WRITE_FAILED }
  }
}

export async function archiveTask(code: string, archived = true): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = CodeSchema.safeParse(code)
    if (!parsed.success) return { ok: false, message: 'That card could not be archived.' }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_task_archive', {
      p_code: parsed.data,
      p_archived: archived,
    })
    if (error) return { ok: false, message: refusal(error) }

    revalidateBoard()
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'archiveTask' })
    return { ok: false, message: WRITE_FAILED }
  }
}
