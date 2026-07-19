import type { Channel } from '@sahoda/shared'

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
 */
export interface SimulatedPublish {
  channel: Channel
  mode: 'fixture'
  platformPostId: string
  publishedAt: string
}

export type PublishState =
  { ok: true; simulated: SimulatedPublish[] } | { ok: false; message: string }
