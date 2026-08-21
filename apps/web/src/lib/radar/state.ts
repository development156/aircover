/**
 * Radar's action-state types.
 *
 * NOT in `app/actions/radar.ts`. A `'use server'` module may export only async
 * functions, and re-exporting a type from one makes Turbopack dev emit a runtime
 * `ReferenceError` that 500s every route importing the action (LEARNINGS.md:21,
 * and `lib/posts/state.ts` carries the same note for the same reason).
 */

/** Adding a business to the watch list. */
export type AddCompetitorState =
  | { ok: true; competitorId: string }
  /** The tables this screen reads do not exist yet — see lib/radar/store.ts. */
  | { ok: false; reason: 'not-collecting'; message: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'failed'; message: string }

/**
 * Turning one observed change into drafts.
 *
 * `insufficient` is its OWN arm carrying the two numbers, exactly as
 * `GenerateState` does. A shortfall folded into `message` cannot be rendered as
 * "needs N and you have M" without the client parsing prose, and the wallet link
 * would then be a guess about what went wrong.
 */
export type DraftFromChangeState =
  | {
      ok: true
      postId: string
      /** How many channel variants came back. */
      variants: number
      creditsCharged: number
    }
  | { ok: false; insufficient: true; required: number; available: number }
  | {
      ok: false
      insufficient: false
      /** The draft exists even though the copy did not arrive. Never silently dropped. */
      postId: string | null
      message: string
    }
