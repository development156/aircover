import {
  OpsQaExportSchema,
  QA_EXPORT_SCHEMA,
  type OpsQaArtifact,
  type OpsQaExport,
  type OpsQaImportResult,
  type OpsQaRun,
} from '@sahoda/shared'

/**
 * QA JSON export/import (doc 13 §11), with no I/O in it.
 *
 * Reading a file somebody else produced is the untrusted-input boundary of this
 * whole feature, so the parsing is here, alone, and tested against files
 * designed to get through.
 */

/** How many runs an export carries. Stated in the file, and to the person. */
export const EXPORT_RUN_LIMIT = 500

/**
 * The largest file we will accept.
 *
 * Next's server actions default to a 1 MB body, and exceeding it fails with an
 * error that names none of this. Refusing at 900 KB means the person is told
 * what is wrong and what to do, rather than meeting a stack trace.
 */
export const IMPORT_MAX_BYTES = 900_000

export function buildQaExport(
  runs: readonly OpsQaRun[],
  artifacts: readonly OpsQaArtifact[],
  now: Date,
): OpsQaExport {
  const taken = runs.slice(0, EXPORT_RUN_LIMIT)
  const ids = new Set(taken.map((run) => run.id))

  return {
    schema: QA_EXPORT_SCHEMA,
    exported_at: now.toISOString(),
    window: {
      description: `The ${taken.length} most recent QA runs`,
      run_limit: EXPORT_RUN_LIMIT,
      // Said out loud in the file. An export that silently carries "the most
      // recent 500" reads later as "everything".
      truncated: runs.length > EXPORT_RUN_LIMIT,
    },
    runs: taken.map((run) => ({
      id: run.id,
      task_code: run.task_code,
      kind: run.kind,
      suite: run.suite,
      status: run.status,
      summary_plain: run.summary_plain,
      details: run.details,
      actor: run.actor,
      duration_ms: run.duration_ms,
      started_at: run.started_at,
      finished_at: run.finished_at,
    })),
    // Only artifacts belonging to runs actually in the file. Orphans would
    // describe screenshots for runs the reader cannot see.
    artifacts: artifacts
      .filter((artifact) => ids.has(artifact.run_id))
      .map((artifact) => ({
        id: artifact.id,
        run_id: artifact.run_id,
        storage_path: artifact.storage_path,
        caption: artifact.caption,
        bytes: artifact.bytes,
        mime: artifact.mime,
      })),
  }
}

export function exportFilename(now: Date): string {
  return `sahoda-qa-${now.toISOString().slice(0, 10)}.json`
}

export type ParsedImport = { ok: true; payload: OpsQaExport } | { ok: false; message: string }

/**
 * Read a file a person picked.
 *
 * Every refusal names what is wrong with the FILE, because the person can only
 * act on that. None of them echo the file's contents back — a rejected import
 * is still untrusted input, and its strings would render straight into the
 * result panel.
 */
export function parseQaImport(text: string): ParsedImport {
  if (text.trim() === '') {
    return { ok: false, message: 'That file is empty.' }
  }

  if (text.length > IMPORT_MAX_BYTES) {
    const mb = (text.length / 1024 / 1024).toFixed(1)
    return {
      ok: false,
      message: `That file is ${mb} MB. Import takes up to 0.9 MB at a time. Split it and import each part.`,
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, message: 'That is not a JSON file.' }
  }

  // Checked before the full parse so the common mistake — the wrong file
  // entirely — gets the useful message rather than a list of missing keys.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'That JSON is not a Sahoda QA export.' }
  }
  const tag = (raw as { schema?: unknown }).schema
  if (tag !== QA_EXPORT_SCHEMA) {
    return {
      ok: false,
      message:
        typeof tag === 'string'
          ? `That file says it is "${tag.slice(0, 40)}". This console reads ${QA_EXPORT_SCHEMA}.`
          : `That file is not a ${QA_EXPORT_SCHEMA} export.`,
    }
  }

  const parsed = OpsQaExportSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') ?? 'the file'
    return {
      ok: false,
      // Names the location, never the value. Nothing was imported, and saying
      // so is the part that stops someone assuming a partial load.
      message: `That export did not validate at ${where}. Nothing was imported.`,
    }
  }

  return { ok: true, payload: parsed.data }
}

export interface ImportSummary {
  headline: string
  /** Stated whenever the file carried artifact metadata, because it always surprises. */
  artifactNote: string | null
  conflicts: readonly { id: string; reason: string }[]
}

export function summariseImport(payload: OpsQaExport, result: OpsQaImportResult): ImportSummary {
  const skipped = result.conflicts.length
  const headline =
    result.imported === 0
      ? `Nothing new. All ${payload.runs.length} runs were already recorded.`
      : `Imported ${result.imported} of ${payload.runs.length} runs${
          skipped > 0 ? `, ${skipped} already recorded` : ''
        }.`

  return {
    headline,
    artifactNote:
      payload.artifacts.length > 0
        ? `${payload.artifacts.length} screenshots are described in this file but were not restored. The images live in a private bucket and do not travel in the JSON.`
        : null,
    conflicts: result.conflicts,
  }
}
