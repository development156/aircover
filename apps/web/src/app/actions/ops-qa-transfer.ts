'use server'

import { revalidatePath } from 'next/cache'
import { OpsQaImportResultSchema } from '@sahoda/shared'

import { requireOpsAdmin } from '@/lib/ops/guard'
import {
  QA_NOT_PERMITTED,
  QA_WRITE_FAILED,
  type QaExportState,
  type QaImportState,
} from '@/lib/ops/action-state'
import {
  buildQaExport,
  exportFilename,
  parseQaImport,
  summariseImport,
} from '@/lib/ops/qa-transfer'
import { readAllQaArtifacts, readRecentQaRuns } from '@/lib/ops/read'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The portable QA record, both directions (doc 13 §11).
 *
 * Import parses with the SAME function the browser could have used, but here,
 * on the server, because a client-side check is a courtesy and this is the
 * decision. The file is untrusted input from the moment it is picked.
 */

export async function exportQaJson(): Promise<QaExportState> {
  try {
    await requireOpsAdmin()

    const [runs, artifacts] = await Promise.all([readRecentQaRuns(), readAllQaArtifacts()])

    // A partial export would look like a complete one the moment it is saved to
    // disk, so an unreadable half refuses the whole thing.
    if (runs.status !== 'ok') {
      return { ok: false, message: 'We could not read the runs, so nothing was exported.' }
    }
    if (artifacts.status !== 'ok') {
      return {
        ok: false,
        message: 'We could not read the screenshot list, so nothing was exported.',
      }
    }

    const now = new Date()
    const payload = buildQaExport(runs.data, artifacts.data, now)

    return {
      ok: true,
      filename: exportFilename(now),
      json: JSON.stringify(payload, null, 2),
      truncated: payload.window.truncated,
    }
  } catch (error) {
    await reportServerError(error, { action: 'exportQaJson' })
    return { ok: false, message: 'We could not build that export.' }
  }
}

export async function importQaJson(text: unknown): Promise<QaImportState> {
  try {
    await requireOpsAdmin()

    if (typeof text !== 'string') return { ok: false, message: 'That file could not be read.' }

    const parsed = parseQaImport(text)
    if (!parsed.ok) return parsed

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_qa_import', {
      p_runs: parsed.payload.runs,
    })

    if (error) {
      return {
        ok: false,
        message: error.code === '42501' ? QA_NOT_PERMITTED : QA_WRITE_FAILED,
      }
    }

    // The RPC's own answer is parsed rather than trusted — it is the thing that
    // decides what the result panel claims happened.
    const result = OpsQaImportResultSchema.safeParse(data)
    if (!result.success) {
      return {
        ok: false,
        message: 'The import ran but we could not read what it did. Reload before trying again.',
      }
    }

    revalidatePath('/admin/qa')
    return { ok: true, summary: summariseImport(parsed.payload, result.data) }
  } catch (error) {
    await reportServerError(error, { action: 'importQaJson' })
    return { ok: false, message: QA_WRITE_FAILED }
  }
}
