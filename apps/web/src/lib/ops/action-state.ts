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
