import type { OpsTaskColumn } from '@sahoda/shared'

/**
 * Return shapes for the `/admin` server actions.
 *
 * These live here, not in the `'use server'` modules that return them: such a
 * module may export only async functions, and re-exporting a type from one makes
 * Turbopack dev emit a runtime ReferenceError that 500s every route importing
 * the action (LEARNINGS.md:21).
 */

export type OpsWriteState = { ok: true } | { ok: false; message: string }

export type OpsCreateState = { ok: true; code: string } | { ok: false; message: string }

export interface TaskEditPatch {
  title?: string
  detail?: string | null
  assignee?: string
  roadmapCode?: string | null
  blocked?: boolean
  blockedReason?: string | null
  sort?: number
}

export interface TaskMoveInput {
  code: string
  column: OpsTaskColumn
  note?: string | null
}

/**
 * What a caller is told when the database refuses the write.
 *
 * `app.ops_writer()` raises 42501 for a viewer, a revoked seat and a stranger
 * alike, and deliberately does not say which. This message keeps that property:
 * it states the outcome without confirming what the caller's seat is.
 */
export const NOT_PERMITTED = 'That change was not applied — your account cannot edit the board.'

/** Anything the database refused for a reason we did not anticipate. */
export const WRITE_FAILED = 'That change was not applied. Nothing on the board moved.'

/**
 * QA composer (doc 13 §11).
 *
 * `saveQaDraft` returns the run id because the first autosave CREATES the run —
 * the composer has no id until the server gives it one, and everything after
 * (further autosaves, uploads, finalize) is scoped to it.
 */
export type QaDraftState = { ok: true; runId: string } | { ok: false; message: string }

/**
 * A signed upload, so a 10 MB screenshot goes browser → storage and never
 * through this app's server. Routing it through a server action would mean
 * raising `serverActions.bodySizeLimit` for every action in the app.
 */
export type QaUploadState =
  { ok: true; path: string; signedUrl: string; token: string } | { ok: false; message: string }

/** The QA record is evidence, so its refusals name the QA record, not the board. */
export const QA_NOT_PERMITTED = 'That was not saved — your account cannot write QA runs.'
export const QA_WRITE_FAILED = 'That was not saved. Nothing was recorded.'
export const QA_DRAFT_CLOSED =
  'This run is already finished, so it cannot be changed. Start a new one.'
