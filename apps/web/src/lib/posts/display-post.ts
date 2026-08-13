import type { Post, PostStatus } from '@sahoda/shared'

/**
 * A post as the RENDERING layer may see it: intent under its own name, and no
 * `status` field to mistake for an outcome.
 *
 * ── WHY A TYPE AND NOT A CONVENTION ──────────────────────────────────────────
 * "Don't read `posts.status` to decide what a post did" has now failed three
 * times — `autoPublishTruth`, `LiveStatusBadge`, and the week grid + week strip
 * — each time in a NEW file written by someone who had no reason to know. A
 * fourth reviewer catching a fourth instance is not a fix; the reason the rule
 * keeps losing is that `post.status` is the most natural thing to type and it
 * compiles.
 *
 * So it no longer compiles. `status` is SEALED to a type nothing can use:
 *   · `post.status === 'published'` is TS2367 — "no overlap".
 *   · passing `post.status` anywhere a `PostStatus` is wanted is TS2345.
 *   · handing a raw `Post` to a component that wants a `DisplayPost` is TS2322.
 *   · so is an object literal that spreads a `Post` and adds `intent` — the
 *     obvious way around the previous two. The conversion has to go through
 *     `forDisplay`, at the page boundary, in the open.
 *
 * `status?: never` was tried first and is NOT enough: it types the field as
 * `undefined`, and TypeScript permits `undefined === 'published'`. That is the
 * worst available outcome — a comparison that compiles and is silently always
 * false, which reads on screen as "not published yet" for a post that is live.
 * The sealed symbol has no overlap with `string`, so the comparison is an error.
 *
 * That catches a file that does not exist yet, which is the property a lint
 * rule scoped to today's four call sites would not have. `packages/shared` is
 * untouched — `Post` is frozen and stays exactly as it is; this is a view of it.
 *
 * ── WHAT REPLACED IT ─────────────────────────────────────────────────────────
 * `intent` — what the USER committed to (idea, draft, approved, scheduled). It
 * is the honest reading of the column: `approvePost` writes `approved`,
 * `schedule_post` writes `scheduled`, inserts write `draft`, `savePost` refuses
 * it outright. Every one of those is a person deciding something.
 *
 * What HAPPENED comes from `outcomeOf(variants)` in `publish-evidence.ts`, and
 * the two are separate arguments everywhere they meet, so neither can be
 * mistaken for the other.
 *
 * Legitimate intent reads survive unchanged and are meant to: `canApprove`,
 * `ApproveButton`, the `promisesAutoPublish` gate in `autoPublishTruth`, and
 * `STATUS_STYLES` rendering the literal word "Scheduled". They just say
 * `intent` now, which is what they always meant.
 */
declare const OUTCOME_ONLY: unique symbol

/**
 * An uninhabitable type whose only job is to have NO overlap with `string`, so
 * that comparing a sealed `status` to a status literal is an error instead of a
 * silently-false test. The message is the error a reader will see next to it.
 */
type Sealed = {
  readonly [OUTCOME_ONLY]: 'posts.status is intent, not outcome — read intent, or outcomeOf(variants)'
}

export type DisplayPost = Omit<Post, 'status'> & {
  /** What the user committed to. NOT what the post did — see `outcomeOf`. */
  readonly intent: PostStatus
  /**
   * The poison pill. Never present at runtime — `forDisplay` destructures it
   * away — and sealed in the type so that reaching for it cannot compile.
   */
  readonly status?: Sealed
}

/**
 * The ONE conversion, at the page boundary.
 *
 * `status` is destructured out rather than overwritten, so the field is gone
 * from the object as well as from the type — a `as unknown as Post` cast
 * downstream would find nothing there to read.
 */
export function forDisplay(post: Post): DisplayPost {
  const { status, ...rest } = post
  return { ...rest, intent: status }
}
