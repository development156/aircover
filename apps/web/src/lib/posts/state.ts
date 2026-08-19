import type { Channel, ConstraintViolation } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing'

/**
 * Action state types live here, not in the `'use server'` modules that return
 * them: a `'use server'` file may export only async functions, and re-exporting
 * a type from one makes Turbopack dev emit a runtime `ReferenceError` that 500s
 * every route importing the action (LEARNINGS.md:21).
 */

/**
 * What is stored now, carried with the refusal so the client does not have to ask.
 *
 * ── AN EARLIER VERSION OF THIS COMMENT WAS WRONG, AND THE CORRECTION MATTERS ─
 * It said this came from "the SAME read that detected the clash". It cannot. The
 * compare-and-set returns NO ROW precisely because the clash happened, so there is
 * nothing to carry back and the server reads a second time to fill this in.
 *
 * That second read can go stale if a third writer lands between the two. Harmless,
 * and worth being exact about why: what is shown is always a version that was
 * really stored, so it is never a false claim, only possibly an old one — and
 * nothing is decided from it, because "Keep mine" re-sends against `version` and
 * is refused again if that has moved. Losing repeatedly costs round trips, never
 * words. `lib/posts/cas-save.ts` holds the read; the three-writer sequence is
 * executed in `packages/db/tests/post_variant_cas.pglite.test.ts`.
 */
export interface SaveConflict {
  channel: Channel
  /** What is stored now. Named "theirs" everywhere the UI speaks about it. */
  theirs: string
  /** Send this back to win the retry. Meaningless to the customer; never shown. */
  version: number
}

/**
 * ── THE `conflict` ARM IS NOW PRODUCED, BUT ONLY WHERE IT CAN BE ─────────────
 * `saveVariant` returns it when the compare-and-set refuses. That needs the
 * `version` column from migration 20260819000000, which applies to production and
 * is the founder's to run — so until it is applied nothing reaches this arm, and
 * every save behaves exactly as it did before.
 *
 * Both halves ship together on purpose. A migration landing on a UI that could
 * only render `message` would show a generic save error with the box still dirty
 * and a Retry that fails for as long as the other tab holds the newer row — worse
 * than losing the work silently, which is what happens today.
 *
 * OPTIONAL, so every existing consumer that reads `message` is untouched.
 */
export type SaveState =
  | {
      ok: true
      postId: string
      updatedAt: string
      /**
       * What the row is at now, so the next save can compare against it.
       *
       * OPTIONAL, and absent is the ordinary answer today: the save path that does
       * not compare-and-set has no version to report. A caller that gets none keeps
       * whatever it had, which for that path is nothing.
       */
      version?: number
    }
  | { ok: false; message: string; conflict?: SaveConflict }

/**
 * The result of setting a channel version's format.
 *
 * Carries what is STORED, not what was asked for. The two can differ — another
 * tab may have chosen something else in between — and a screen that echoed the
 * request back would show a choice the row does not hold. This write is the one
 * place in the editor that is NOT a compare-and-set (`save_post_variant` has a
 * fixed signature with no format argument), so last-write-wins is the real
 * behaviour and the honest response is to say what actually landed.
 */
export type FormatState = { ok: true; format: PostFormat | null } | { ok: false; message: string }

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
