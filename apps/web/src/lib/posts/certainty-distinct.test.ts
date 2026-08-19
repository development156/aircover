import { describe, expect, it } from 'vitest'

import { CERTAINTY_CLASS, certaintyFor } from '@/lib/posts/certainty'
import { STATUS_MARK } from '@/lib/posts/status-mark'
import type { PostStatus } from '@sahoda/shared'

/**
 * Statuses a user must be able to TELL APART must not render the same object.
 *
 * ── WHAT THIS CAUGHT ─────────────────────────────────────────────────────────
 * `certaintyFor` is careful and correct about what may be CLAIMED — approving a
 * post is not publishing it, so neither may reach `.is-real` without evidence.
 * The consequence is that `approved`, `scheduled` and `published` all
 * under-claim to `committed`, and the chip renders the rung. Measured before the
 * fix, all three produced the identical class string `is-committed`; only the
 * word differed. A list of eight posts could not be scanned by shape.
 *
 * The fix was NOT to loosen `certaintyFor`. It was to give the chip a second
 * structural axis — see `status-mark.ts`. This test asserts the SIGNATURE a
 * reader actually perceives: fill/edge AND glyph together.
 *
 * Both halves are structural, so this holds in greyscale and for a colour-blind
 * reader — which matters here because the palette has no red and severity can
 * never be carried by hue.
 */

/** Before anything has published. Intent is all there is, which is the hard case. */
const NO_EVIDENCE = 'none' as const

/** What a reader perceives: the fill/edge treatment plus the glyph. */
function signature(status: PostStatus): string {
  const level = certaintyFor(status, NO_EVIDENCE).level
  return `${CERTAINTY_CLASS[level]} + ${STATUS_MARK[status].name}`
}

const MUST_DIFFER: ReadonlyArray<readonly [PostStatus, PostStatus]> = [
  // "cleared to go" vs "booked" vs "it went out" — three different next actions.
  ['approved', 'scheduled'],
  ['approved', 'published'],
  ['scheduled', 'published'],
  // The pair that matters most: something went wrong vs it is booked.
  ['failed', 'scheduled'],
  // Unfinished vs waiting on a person.
  ['draft', 'review'],
  // Fully out vs partly out — the distinction `partial` exists to preserve.
  ['published', 'partial'],
]

describe('a status list must be readable as a status list', () => {
  it.each(MUST_DIFFER)('renders "%s" and "%s" as distinguishable chips', (a, b) => {
    expect(
      signature(a),
      `"${a}" and "${b}" both render "${signature(a)}" — a reader cannot tell them apart`,
    ).not.toBe(signature(b))
  })

  /**
   * The strong form: EVERY status is distinguishable from every other, not just
   * the pairs someone remembered to list. A new PostStatus that duplicates an
   * existing signature fails here rather than shipping as a look-alike.
   */
  it('gives every status its own signature', () => {
    const all = Object.keys(STATUS_MARK) as PostStatus[]
    const seen = new Map<string, PostStatus>()
    const collisions: string[] = []
    for (const status of all) {
      const sig = signature(status)
      const previous = seen.get(sig)
      if (previous) collisions.push(`${previous} and ${status} both render "${sig}"`)
      else seen.set(sig, status)
    }
    expect(collisions, collisions.join('; ')).toEqual([])
    expect(seen.size).toBe(all.length)
  })

  /**
   * The detector, shown discriminating. If the glyph is stripped, the original
   * collision must come back — otherwise the checks above are passing for some
   * reason other than the axis this fix added.
   */
  it('still collapses to one rung when the glyph is removed', () => {
    const rungOnly = (s: PostStatus) => CERTAINTY_CLASS[certaintyFor(s, NO_EVIDENCE).level]
    expect(
      rungOnly('approved'),
      'approved and scheduled must still share a RUNG — the glyph is what separates them',
    ).toBe(rungOnly('scheduled'))
    expect(rungOnly('scheduled')).toBe(rungOnly('published'))
    // And with the glyph, they part.
    expect(signature('approved')).not.toBe(signature('scheduled'))
  })
})
