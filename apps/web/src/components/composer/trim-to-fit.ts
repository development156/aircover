import type { Channel } from '@sahoda/shared'

import { hasLink } from '@/lib/posts/detect-link'
import { meterFor } from '@/lib/posts/counters'

const MAX_TRIM_PASSES = 200

/**
 * Shorten `body` until the engine stops reporting an over-limit.
 *
 * Not a plain `slice(0, maxChars)`: on X a link counts as a fixed 23 characters
 * whatever its real length, so the character budget and the string length are
 * different numbers. Each pass removes at least one character, so this ends.
 *
 * This is the FREE fix, and it is blunt on purpose — it cuts from the end and
 * makes no judgement about what mattered. The paid one is the model rewrite on
 * the same card, which costs a credit and is offered beside it rather than
 * instead of it: a writer over by four characters should not have to spend.
 *
 * Scores the character budget only, so it passes no `mediaCount`: `meter.over` is
 * set by `charCount > maxChars` alone, and trimming text cannot clear a
 * media-count violation anyway.
 *
 * Pure: no React, no I/O, no clock.
 */
export function trimToFit(channel: Channel, body: string, hashtags: string[] | undefined): string {
  let next = body
  for (let pass = 0; pass < MAX_TRIM_PASSES && next.length > 0; pass += 1) {
    const meter = meterFor(channel, { body: next, hashtags, hasLink: hasLink(next) })
    if (!meter.over) return next
    const excess = Math.max(1, meter.charCount - meter.maxChars)
    next = next.slice(0, Math.max(0, next.length - excess))
  }
  return next
}
