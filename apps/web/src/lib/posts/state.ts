import type { Channel, ConstraintViolation } from '@sahoda/shared'

/**
 * Action state types live here, not in the `'use server'` modules that return
 * them: a `'use server'` file may export only async functions, and re-exporting
 * a type from one makes Turbopack dev emit a runtime `ReferenceError` that 500s
 * every route importing the action (LEARNINGS.md:21).
 */

export type SaveState =
  { ok: true; postId: string; updatedAt: string } | { ok: false; message: string }

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
