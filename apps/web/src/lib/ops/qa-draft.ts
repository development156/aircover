import type { OpsQaStatus } from '@sahoda/shared'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * The QA composer's decisions, with no React around them (doc 13 §11).
 *
 * Everything here answers a question the UI must not answer twice: what a
 * screenshot may be, where it is stored, whether there is anything worth
 * saving, and what the save indicator is allowed to claim.
 *
 * That last one is the reason this file exists. "Saved · 14:32:07" is a promise
 * about a server, and a component that owns both the promise and the request is
 * one `catch` away from making it falsely. The state is a value here, it can
 * only be constructed from an outcome, and there is no path from a failed save
 * to a `saved` label.
 */

/** §11 and the bucket policy (migration 12) both say 10 MB. Both, on purpose. */
export const ARTIFACT_MAX_BYTES = 10 * 1024 * 1024

/** §3. Screenshots, not arbitrary uploads. */
export const ARTIFACT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type ArtifactMime = (typeof ARTIFACT_MIME_TYPES)[number]

/** §11: "Autosave every 2 s (debounced)". */
export const AUTOSAVE_DELAY_MS = 2000

const EXTENSION: Record<ArtifactMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export type ArtifactCheck =
  { ok: true; extension: string; mime: ArtifactMime } | { ok: false; message: string }

/**
 * May this file be attached?
 *
 * Checked here AND in the bucket policy AND in `ops_qa_artifact_add`. Three
 * places is not redundancy: this one exists to tell a person what went wrong
 * before a 10 MB upload starts, and the other two exist because a limit that
 * lives only in the UI stops applying the moment somebody calls storage
 * directly.
 */
export function checkArtifact(file: { size: number; type: string }): ArtifactCheck {
  if (!ARTIFACT_MIME_TYPES.includes(file.type as ArtifactMime)) {
    return { ok: false, message: 'Screenshots only. PNG, JPEG or WebP.' }
  }
  if (file.size <= 0) {
    return { ok: false, message: 'That file is empty.' }
  }
  if (file.size > ARTIFACT_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return { ok: false, message: `That screenshot is ${mb} MB. The limit is 10 MB.` }
  }
  const mime = file.type as ArtifactMime
  return { ok: true, extension: EXTENSION[mime], mime }
}

/** §3: `qa/{run_id}/{uuid}.{ext}`. */
export function artifactPath(runId: string, id: string, extension: string): string {
  return `qa/${runId}/${id}.${extension}`
}

export interface QaDraft {
  runId: string | null
  taskCode: string | null
  summary: string
  details: string
}

export const EMPTY_DRAFT: QaDraft = { runId: null, taskCode: null, summary: '', details: '' }

/** Is there anything in this draft at all? A blank one is not worth a row. */
export function draftHasContent(draft: QaDraft): boolean {
  return draft.summary.trim() !== '' || draft.details.trim() !== '' || draft.taskCode !== null
}

/**
 * Has anything changed since the last confirmed save?
 *
 * Compared against what the SERVER acknowledged, never against the last thing
 * typed — otherwise a failed save marks itself clean and the next keystroke is
 * the only thing that ever gets written.
 */
export function draftIsDirty(current: QaDraft, saved: QaDraft | null): boolean {
  if (saved === null) return draftHasContent(current)
  return (
    current.summary !== saved.summary ||
    current.details !== saved.details ||
    current.taskCode !== saved.taskCode
  )
}

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'failed'; message: string }

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: DEFAULT_ZONE,
})

/**
 * What the indicator says. One function, so there is one place that can lie and
 * it is under test.
 */
export function saveLabel(state: SaveState): string {
  switch (state.kind) {
    case 'idle':
      return 'Not saved yet'
    case 'saving':
      return 'Saving…'
    case 'saved':
      return `Saved · ${TIME.format(state.at)}`
    case 'failed':
      return state.message
  }
}

/** Only a real acknowledgement is reassuring. Everything else needs attention. */
export function saveToneOf(state: SaveState): 'ok' | 'busy' | 'warn' {
  if (state.kind === 'saved') return 'ok'
  if (state.kind === 'saving') return 'busy'
  return 'warn'
}

export const FINALIZE_STATUSES: readonly OpsQaStatus[] = ['pass', 'fail', 'blocked']

export type FinalizeCheck = { ok: true } | { ok: false; message: string }

/**
 * A finished run is evidence, and `ops_qa_finalize` will not let it be edited
 * afterwards. So the summary is required BEFORE the verdict is sealed, not
 * apologised for after.
 */
export function checkFinalize(draft: QaDraft, status: OpsQaStatus | null): FinalizeCheck {
  if (status === null) return { ok: false, message: 'Pick a result first.' }
  if (!FINALIZE_STATUSES.includes(status)) {
    return { ok: false, message: 'A run finishes as pass, fail or blocked.' }
  }
  if (draft.summary.trim() === '') {
    return { ok: false, message: 'Say in one line what you checked. This record is read later.' }
  }
  if (draft.runId === null) {
    return { ok: false, message: 'Nothing has been saved yet, so there is nothing to finish.' }
  }
  return { ok: true }
}
