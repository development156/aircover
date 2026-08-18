import type { Channel, ConstraintViolation } from '@sahoda/shared'

/**
 * Action state types live here, not in the `'use server'` modules that return
 * them: a `'use server'` file may export only async functions, and re-exporting
 * a type from one makes Turbopack dev emit a runtime `ReferenceError` that 500s
 * every route importing the action (LEARNINGS.md:21).
 */

/**
 * The version already in the row, from the SAME read that detected the clash.
 *
 * Carried with the refusal rather than fetched by the client afterwards: a second
 * read is a second race, and the text the customer is shown must be the text the
 * database actually refused to overwrite.
 */
export interface SaveConflict {
  channel: Channel
  /** What is stored now. Named "theirs" everywhere the UI speaks about it. */
  theirs: string
  /** Send this back to win the retry. Meaningless to the customer; never shown. */
  version: number
}

/**
 * ── THE `conflict` ARM IS INERT AND DELIBERATELY PRESENT ─────────────────────
 * Nothing produces it yet: detecting a concurrent edit needs a version column on
 * `post_variants` and a compare-and-set, which is a migration, and migrations
 * apply straight to production. See docs/23_Concurrent_Edit_Plan.md for the SQL.
 *
 * The shape ships first on purpose. If the migration landed while the UI could
 * only render `message`, a version mismatch would show a generic save error with
 * the box still dirty and a Retry that fails for as long as the other tab holds
 * the newer row — worse than today, where the work is lost silently. Building
 * the refusal the UI can already read makes the migration the only step left.
 *
 * OPTIONAL, so every existing consumer that reads `message` is untouched.
 */
export type SaveState =
  | { ok: true; postId: string; updatedAt: string }
  | { ok: false; message: string; conflict?: SaveConflict }

export type DeleteState = { ok: true } | { ok: false; message: string }

/** A variant the model produced, already filtered to the requested channels. */
export interface GeneratedVariant {
  channel: Channel
  body: string
  charCount: number
}

export type GenerateState =
  | {
      ok: true
      variants: GeneratedVariant[]
      /** Requested channels the model did not return — surfaced, never blanked. */
      missing: Channel[]
      balanceAfter: number
      creditsCharged: number
    }
  | { ok: false; insufficient: true; required: number; available: number }
  | { ok: false; insufficient: false; message: string }

export type RewriteState =
  | { ok: true; text: string; balanceAfter: number; creditsCharged: number }
  | { ok: false; insufficient: true; required: number; available: number }
  | { ok: false; insufficient: false; message: string }

/**
 * The result of a SIMULATED publish. `mode` is carried through from the adapter
 * so the UI branches on it rather than sniffing the permalink string. There is
 * deliberately no `'live'` path here: `apps/web` cannot publish for real (tokens
 * are vault-only) and cannot record a publish at all (`post_publish_logs` is
 * member-read with a `block_mutations` trigger). Nothing is persisted.
 *
 * A channel only reaches this shape after `validateVariant` returned zero
 * violations. The fixture adapter validates NOTHING — it is an unconditional
 * success — so "the fixture accepted it" is not evidence of anything and must
 * never be the reason a channel is reported as passing.
 */
export interface SimulatedPublish {
  channel: Channel
  mode: 'fixture'
  platformPostId: string
  publishedAt: string
}

/**
 * A variant the frozen Constraint Engine REJECTS. It is never handed to the
 * fixture adapter, because a fixture success would contradict the red meter the
 * writer is already looking at on the same screen.
 */
export interface BlockedPublish {
  channel: Channel
  /** Straight from `validateVariant`; render via `describeViolation`, never raw. */
  violations: ConstraintViolation[]
}

/**
 * A channel the engine marks `publishable: false` (Instagram in Alpha). Neither
 * a pass nor a failure — there is simply no adapter path to simulate.
 */
export interface SkippedPublish {
  channel: Channel
  reason: 'not-publishable'
}

/**
 * Three outcomes, kept separate on purpose: a blocked channel must never be
 * countable as a simulated one, and a skipped channel must never read as either.
 */
export interface PublishReport {
  simulated: SimulatedPublish[]
  blocked: BlockedPublish[]
  skipped: SkippedPublish[]
}

export type PublishState = ({ ok: true } & PublishReport) | { ok: false; message: string }
