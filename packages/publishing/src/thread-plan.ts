import { charCountFor, type PlatformSpec } from '@sahoda/shared'

import type { FormatRefusal } from './format-refusal'
import { countCodePoints, splitIntoThread, threadLimitFor } from './thread-split'

/**
 * WHAT A THREAD ACTUALLY PUBLISHES AS, AND WHY IT MAY NOT.
 *
 * ── THIS IS THE FILE THAT ANSWERS docs/31 §6.2's SECOND BLOCKER ─────────────
 * *"The character limit means something. X's 280 applies PER SEGMENT, and
 * `validateVariant` measures the whole body — so a perfectly legal three-tweet
 * thread is refused with MAX_CHARS before `refuseFormat` is even reached."*
 *
 * True, and the fix is not to weaken `validateVariant`. It is that for a thread
 * `MAX_CHARS` is asking the wrong question: the body is not what gets published,
 * the segments are. So the publish path swaps ONE check for another — the
 * whole-body limit for this per-segment plan — and swaps nothing else. Every
 * other violation the engine finds still stands.
 *
 * ── AND IT CANNOT FAIL ON LENGTH, WHICH IS THE POINT ────────────────────────
 * Because the segments are DERIVED by splitting at the limit, "is every segment
 * within 280" is true by construction. It is asserted anyway, here and in the
 * tests, because a guard that is true by construction today is a guard that
 * catches the day the construction changes. What CAN fail is a body that is
 * nothing but whitespace, and an unbreakable token — a 400-character URL — which
 * is hard-cut and would publish as a mangled link.
 *
 * ── WHERE THE HASHTAGS LAND ─────────────────────────────────────────────────
 * The plan is built from `publishedTextOf(formatForPlatform(...))`, which already
 * has the hashtag tail appended, so the tags fall in the LAST segment. That is a
 * decision, not an accident: hashtags on the closing post of a thread is the
 * convention on X, and it keeps the counting honest — the tags cost characters in
 * exactly one segment rather than being charged to all of them or to none.
 */

/**
 * The flat weight this channel charges for a link, asked of the engine.
 *
 * `X_LINK_WEIGHT` is module-private inside the frozen Constraint Engine, and a
 * second `const 23` here is the kind of copy that drifts silently — this repo has
 * a standing rule about it. So the number is DERIVED by asking `charCountFor`
 * what an empty body costs with and without a link. A channel whose policy is not
 * `counted_fixed` returns 0 from the same subtraction, with no branch needed.
 */
export function linkWeightOf(spec: PlatformSpec): number {
  return (
    charCountFor(spec, { body: '', hasLink: true }) -
    charCountFor(spec, { body: '', hasLink: false })
  )
}

/**
 * Does this text carry a link, for the purpose of charging the channel's weight?
 *
 * ── DELIBERATELY NARROW, AND DELIBERATELY NOT apps/web's DETECTOR ───────────
 * `apps/web/src/lib/posts/detect-link` is a far better link detector and it is in
 * the WRONG PACKAGE for this: it is browser code behind a 300-line TLD list, and
 * `runPublishPost` cannot reach it. That is not a hypothetical — `store.ts`
 * documents refusing to copy it, which is why `PublishVariant.hasLink` is never
 * populated at publish time at all.
 *
 * So the thread path does not ASK for a flag. Both the editor and the publisher
 * derive the answer from the SAME string with THIS function, and therefore split
 * into the same posts. A flag would have made the preview show five posts and the
 * publish produce four, because the editor sets it and the store never does.
 *
 * Only an explicit scheme or a `www.` prefix counts. Under-detecting costs at most
 * the flat weight on a text whose segments are already inside the raw limit;
 * over-detecting would refuse posts that are fine.
 */
export function textHasLink(text: string): boolean {
  return /(?:https?:\/\/|www\.)\S/i.test(text)
}

/**
 * How many characters one post of a thread may carry on this channel.
 *
 * The weight is charged to EVERY segment when the text carries a link ANYWHERE.
 * That is conservative — only one segment really owes it — and it is the only
 * reading that survives the split being decided before the segments exist.
 */
export function segmentLimitFor(spec: PlatformSpec, text: string): number {
  return threadLimitFor(spec.maxChars, textHasLink(text), linkWeightOf(spec))
}

export interface ThreadPlan {
  /** The posts, in order. `segments[0]` is the root; the rest chain as replies. */
  segments: string[]
  /** The per-segment ceiling these were split at, for a preview that shows it. */
  limit: number
}

export type ThreadPlanResult = { ok: true; plan: ThreadPlan } | { ok: false; refusal: FormatRefusal }

/**
 * Plan the thread this text publishes as, or say why it cannot.
 *
 * `publishedText` is what actually goes out — body plus hashtag tail — never
 * `variant.body`, for the same reason the refusal gate reads the formatted string:
 * a thread whose tags push the last post over the limit is a thread that fails at
 * X, and only the formatted text knows.
 *
 * It is the ONLY input besides the spec, and that is what makes the editor's
 * preview and the publisher's payload the same arithmetic rather than two
 * implementations that happen to agree.
 */
/** The longest run of non-whitespace in `text`, or null if there is none. */
function longestUnbreakableToken(text: string): string | null {
  let longest: string | null = null
  for (const token of text.split(/\s+/)) {
    if (longest === null || countCodePoints(token) > countCodePoints(longest)) longest = token
  }
  return longest === null || longest === '' ? null : longest
}

export function planThread(spec: PlatformSpec, publishedText: string): ThreadPlanResult {
  const limit = segmentLimitFor(spec, publishedText)

  if (limit < 1) {
    // Reachable only if a link's weight meets or exceeds the whole channel limit.
    // No channel is in that position; refusing beats splitting into nothing.
    return {
      ok: false,
      refusal: {
        code: 'THREAD_NO_ROOM',
        message: 'A link leaves no room for words on this channel.',
      },
    }
  }

  const segments = splitIntoThread(publishedText, limit)

  if (segments.length === 0) {
    return {
      ok: false,
      refusal: {
        code: 'THREAD_EMPTY',
        message: 'A thread needs something written in it.',
      },
    }
  }

  // ── THE REACHABLE FAILURE IS A MANGLED TOKEN, NOT AN OVER-LONG SEGMENT ────
  // My first draft checked `countCodePoints(segment) > limit` and that guard can
  // NEVER fire: the splitter's hard cut lands exactly ON the limit, so a segment
  // is within it by construction. A check that cannot go red is not a check, and
  // it would have sat here reading like one.
  //
  // What CAN go wrong is what the hard cut does to the thing it cuts. A
  // 400-character URL has no space to break at, so it is severed across two posts
  // and BOTH halves are dead links — published, successful, and useless. Refusing
  // is the honest answer, and the writer is told what to do about it.
  const token = longestUnbreakableToken(publishedText)
  if (token !== null && countCodePoints(token) > limit) {
    return {
      ok: false,
      refusal: {
        code: 'THREAD_UNBREAKABLE',
        message: `This has ${countCodePoints(token)} characters in a row with no space to break at, and one post holds ${limit}. Splitting it would cut it in half — shorten it, or put it on its own line.`,
      },
    }
  }

  // Belt and braces on the invariant the whole design rests on. It is true by
  // construction TODAY; this is what notices the day the construction changes.
  const over = segments.find((segment) => countCodePoints(segment) > limit)
  if (over !== undefined) {
    return {
      ok: false,
      refusal: {
        code: 'THREAD_SEGMENT_TOO_LONG',
        message: `One part of this thread is ${countCodePoints(over)} characters and a post holds ${limit}.`,
      },
    }
  }

  return { ok: true, plan: { segments, limit } }
}
