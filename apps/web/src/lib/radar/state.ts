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
 * READING ONE BUSINESS NOW, on the button rather than on the weekly schedule.
 *
 * ── THE SUCCESS ARM CARRIES AN OUTCOME, NOT JUST A SENTENCE ─────────────────
 * "Sahoda read them" and "Sahoda could not read them" are both true endings to
 * a run that did not fail, and the screen draws them differently — the second
 * one has to say that nothing was charged. Folding them into one `ok: true`
 * with a message would leave the caller parsing prose to find out which
 * happened, which is the defect `DraftFromChangeState` already carries a
 * separate `insufficient` arm to avoid.
 *
 * `capped` is Sahoda's own daily spending limit, and `insufficient` is the
 * customer's wallet. They read almost the same on screen and they are opposite
 * facts: one is ours to fix and the other is theirs, so only one of them may
 * offer a top-up.
 */
export type ReadNowState =
  | {
      ok: true
      /** `moved` wrote a change; `could-not-read` reached nothing and charged nothing. */
      outcome: 'moved' | 'unchanged' | 'read' | 'could-not-read'
      message: string
    }
  | { ok: false; reason: 'insufficient' | 'capped' | 'not-watching' | 'failed'; message: string }

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
