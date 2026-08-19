import type { PostStatus } from '@sahoda/shared'

/**
 * The SECOND axis of a status chip: a glyph that says what happens next.
 *
 * ── WHY A SECOND AXIS EXISTS AT ALL ──────────────────────────────────────────
 * `certaintyFor` answers one question — how real is this — and it answers it
 * correctly and conservatively: intent alone can never reach `real`, so
 * `approved`, `scheduled` and `published` all under-claim to `committed`. That
 * is right, and reopening it would be reopening a decision that was argued from
 * evidence.
 *
 * But it means three statuses share one rung, and the rung is what the chip
 * renders. A list of posts then cannot be SCANNED: "cleared to go", "booked for
 * Thursday" and "it went out" are the same shape, and only the word separates
 * them. Words are read one at a time; shapes are read all at once.
 *
 * So certainty keeps the EDGE AND FILL, and this map adds a MARK. Two encodings,
 * two questions, neither collapsed into the other:
 *
 *     certainty → how real is this        → edge + fill  (survives greyscale)
 *     mark      → what happens next       → glyph        (survives greyscale)
 *
 * Both are structural. Neither is colour, which is the whole point: this app
 * renders in one brand colour with no red, so hue can never be load-bearing.
 *
 * ── WHY THESE GLYPHS ─────────────────────────────────────────────────────────
 * `published` is a DOUBLE TICK. Sahoda's users run small businesses in India and
 * live in WhatsApp; the double tick is the most widely understood "it left and
 * it arrived" mark available to us, and it costs nothing to borrow. A single
 * tick is `approved` — cleared, but not delivered — which is the same
 * distinction WhatsApp itself draws, so the pair reads correctly without a
 * legend.
 */

/** Kebab-case lucide name. A STRING, not a component, so this file stays JSX-free
 *  and can be asserted from the `lib` test project. */
export type StatusMarkName =
  | 'lightbulb'
  | 'pencil-line'
  | 'user-round'
  | 'check'
  | 'calendar-clock'
  | 'loader-circle'
  | 'check-check'
  | 'contrast'
  | 'triangle-alert'
  | 'calendar-x'

export interface StatusMark {
  /** The glyph. */
  name: StatusMarkName
  /**
   * What the glyph means, for a screen reader. The chip's visible word already
   * names the status, so this describes the NEXT ACTION rather than repeating
   * it — that is the information the glyph is carrying for sighted users.
   */
  hint: string
}

export const STATUS_MARK = {
  idea: { name: 'lightbulb', hint: 'not started' },
  draft: { name: 'pencil-line', hint: 'still being written' },
  review: { name: 'user-round', hint: 'waiting on a person' },
  approved: { name: 'check', hint: 'cleared, not yet dated' },
  scheduled: { name: 'calendar-clock', hint: 'booked for a time' },
  publishing: { name: 'loader-circle', hint: 'going out now' },
  published: { name: 'check-check', hint: 'it went out' },
  partial: { name: 'contrast', hint: 'out on some channels, not all' },
  failed: { name: 'triangle-alert', hint: 'nothing went out' },
  expired: { name: 'calendar-x', hint: 'its time passed' },
} satisfies Record<PostStatus, StatusMark>
