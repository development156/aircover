import {
  CONSTRAINTS,
  formatForPlatform,
  publishedTextOf,
  type Channel,
  type VariantDraft,
} from '@sahoda/shared'
import {
  describeThread,
  planThread,
  segmentLimitFor,
  type ThreadSegment,
} from '@sahoda/publishing/format'

import type { ChannelMeter } from './counters'

/**
 * WHAT THE WRITER WILL SEE GOING OUT, WHEN THEIR X VERSION IS A THREAD.
 *
 * ── THE SAME STRING THE PUBLISHER WILL SPLIT ────────────────────────────────
 * `runPublishPost` plans the thread from
 * `publishedTextOf(formatForPlatform(spec, draft))` — the body WITH the hashtag
 * tail. This computes the identical string from the identical function, so the
 * preview showing five posts and the publish producing five posts are the same
 * arithmetic and not two implementations that agree today.
 *
 * That matters most at the end: the tail is exactly what pushes a last segment
 * over the limit. A preview built from `state.body` alone would show four posts
 * and publish five, and the extra one would be nothing but hashtags.
 *
 * Pure: no React, no I/O, no clock.
 */

export interface ThreadPreview {
  /** The posts, numbered, with each one's length. */
  segments: ThreadSegment[]
  /** How many characters one post may carry, once a link is paid for. */
  limit: number
  /**
   * Why this cannot be a thread at all. Null when it can.
   *
   * The publish path's OWN code and message, carried through rather than
   * re-worded — so the sentence the writer reads in the editor is the sentence
   * `runPublishPost` would fail with, and `violation-copy`'s allowlist gates both
   * by the same shape.
   */
  refusal: { code: string; message: string } | null
}

/**
 * Preview the thread this draft publishes as.
 *
 * Returns null when the version is not a thread, so a caller cannot accidentally
 * render a preview for a single post — the absence is the signal.
 */
export function previewThread(
  channel: Channel,
  draft: VariantDraft,
  isThread: boolean,
): ThreadPreview | null {
  if (!isThread) return null

  const spec = CONSTRAINTS[channel]
  const text = publishedTextOf(formatForPlatform(spec, draft))
  // ── THE LINK IS DERIVED FROM THE TEXT, NOT TAKEN FROM `draft.hasLink` ──────
  // `draft.hasLink` comes from apps/web's `detect-link`, which the publish path
  // cannot reach — `store.ts` never populates it. Reading it here would make this
  // preview split at 257 while the publisher split at 280: five posts shown, four
  // published. `planThread` derives the answer from the string both sides hold,
  // so they cannot disagree.
  const limit = segmentLimitFor(spec, text)

  const planned = planThread(spec, text)
  if (!planned.ok) {
    return { segments: [], limit, refusal: planned.refusal }
  }
  return { segments: describeThread(text, limit), limit, refusal: null }
}

/**
 * The meter with the whole-body character limit taken out, because for a thread
 * it is the wrong question.
 *
 * ── A SEPARATE NAMED CALL, FOR THE REASON `withFormat` IS ONE ───────────────
 * An optional parameter on `meterFor` that silently defaults is the exact shape
 * of two defects this repo shipped in two days. A call site that forgot it would
 * render a red card and a "Trim to fit" button on a perfectly legal five-post
 * thread — telling the writer to cut words that do not need cutting.
 *
 * ── AND IT REMOVES EXACTLY ONE CODE ─────────────────────────────────────────
 * The same discipline `runPublishPost` uses: MAX_HASHTAGS, MAX_MEDIA_COUNT,
 * MEDIA_REQUIRED and every format verdict still stand. Dropping the whole
 * violation list for threads would be a guard silently widened while appearing
 * to narrow — and this card is the last thing the writer reads before Publish.
 *
 * The refusal from `previewThread` is folded in when there is one, so a thread
 * with an unbreakable link is red HERE rather than at publish time.
 */
export function asThread(meter: ChannelMeter, preview: ThreadPreview | null): ChannelMeter {
  if (preview === null) return meter

  const violations = meter.violations.filter((v) => v.code !== 'MAX_CHARS')
  if (preview.refusal !== null) {
    violations.push({ ...preview.refusal, field: 'body' })
  }

  return {
    ...meter,
    // The budget a thread is measured against is one POST's, and the count is the
    // longest post in it — so the bar reads as "how close is the tightest post to
    // the edge", which is the only question with an answer for a thread.
    charCount: preview.segments.reduce((most, s) => Math.max(most, s.chars), 0),
    maxChars: preview.limit,
    remaining: preview.limit - preview.segments.reduce((most, s) => Math.max(most, s.chars), 0),
    over: preview.refusal !== null,
    violations,
  }
}
