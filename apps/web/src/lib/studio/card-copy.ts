import { presetById } from '@sahoda/shared'

/**
 * THE LINE UNDER A DESIGN IN THE GALLERY.
 *
 * ── IT SAID "1 PAGE", AND BOTH WORDS WERE WRONG ─────────────────────────────
 * `DesignPage` is what the document schema calls a slide, and that word had
 * leaked out of the model and onto a screen. Every other place a customer
 * meets one calls it a SLIDE: "Add a slide", "Remove this slide", "Slide 2 of
 * 3", and the delete confirmation's "All 3 slides go with it". One thing named
 * two ways across two screens is a person wondering whether they are two
 * things.
 *
 * And the count itself was noise on a single design. The editor already ruled
 * on this for its own export button, in its own words: "add all 1 slides is a
 * button that describes the product as more complicated than it is." A design
 * with one slide is a post, and its preview is right there. So the count is
 * said when there is something to count and not otherwise.
 *
 * ── WHAT REPLACES IT IS INFORMATION, NOT SILENCE ────────────────────────────
 * The size is the fact a preview cannot carry: two cards look alike at gallery
 * scale and one is a story while the other is a square. So the line names the
 * size, and adds the slide count only for a carousel.
 *
 * ── AND AN UNKNOWN SIZE IS NAMED AS UNKNOWN, NEVER INVENTED ─────────────────
 * A design saved under a preset Sahoda has since retired still opens and still
 * belongs to somebody. `presetById` answers `null` for it, and the honest line
 * then carries what is still true rather than a size that no longer exists.
 *
 * Pure: no I/O, no clock, no database.
 */

export type CardLine = {
  /** The size, or null when the preset is one Sahoda no longer offers. */
  size: string | null
  /** The number of slides, or null when there is only one and nothing to count. */
  slides: number | null
}

export function describeDesignCard(input: { pageCount: number; presetId: string }): CardLine {
  const preset = presetById(input.presetId)
  return {
    size: preset === null ? null : preset.label,
    // Said only for a carousel. One slide is a post, and the preview beside
    // this line already shows it.
    slides: input.pageCount > 1 ? input.pageCount : null,
  }
}
