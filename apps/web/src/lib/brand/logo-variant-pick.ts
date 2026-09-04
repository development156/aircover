/**
 * WHICH LOGO FILE TO STAMP, GIVEN THE BACKDROP IT WILL SIT ON.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * A workspace may hold two logo files: one drawn for light backgrounds, one for
 * dark. Today `lib/studio/stamp.ts` has only one file to work with, so when the
 * picture under the mark fails contrast it draws a light plate behind the mark
 * rather than reaching for a mark that would not have needed one. That is an
 * honest substitute for a variant the workspace does not have; it is not what a
 * designer, handed both files, would do. This is the decision a designer makes
 * by eye: given both files and the picture, which one actually fits.
 *
 * ── PURE, NO I/O ─────────────────────────────────────────────────────────────
 * Takes the facts already measured about each file (`logo-facts.ts`) and a
 * backdrop luminance already measured by the caller over the region the mark
 * will cover (the same number `stamp.ts` computes for `needsPlate`). Returns an
 * answer, never a file, never bytes. Reuses `needsPlate` from
 * `logo-placement.ts` rather than re-deriving the contrast thresholds, so the
 * two files can never disagree about what "fits" means.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * A file with no ink at all (`facts.trim === null`, a fully transparent image)
 * is not a candidate: there is nothing to stamp. Among the files that do have
 * ink:
 *
 *   Exactly one available -> that one, whatever the backdrop. A workspace with
 *   a single logo (the overwhelming majority) must keep working exactly as it
 *   does today; a plate covers any contrast risk, and that is `stamp.ts`'s job,
 *   not this function's.
 *
 *   Both available -> prefer whichever clears contrast on this backdrop WITHOUT
 *   a plate. That is the entire point of offering two files instead of one: a
 *   plate is a compromise, and a second file lets Sahoda avoid it. If both
 *   clear, the tie is broken by which surface each was drawn for, read off the
 *   backdrop's own brightness. If NEITHER clears, that is this function's
 *   "neither fits": swapping the mark cannot rescue a backdrop this hostile to
 *   both files, and the caller falls back to its own plate behaviour with
 *   whichever file it already prefers.
 */

import { needsPlate } from './logo-placement'
import type { LogoFacts } from './logo-facts'

export type LogoVariantKind = 'light' | 'dark'

export interface LogoVariantFacts {
  /** Facts for the light-background file, or null when the workspace has none. */
  light: LogoFacts | null
  /** Facts for the dark-background file, or null when the workspace has none. */
  dark: LogoFacts | null
}

export type LogoVariantPick = { ok: true; kind: LogoVariantKind } | { ok: false; reason: string }

/** A file with ink to stamp. `trim === null` is the measured "nothing here" answer. */
function hasInk(facts: LogoFacts | null): facts is LogoFacts {
  return facts !== null && facts.trim !== null
}

/** Whether this file is legible on the backdrop without a plate behind it. */
function clearsBackdrop(facts: LogoFacts, backdropLuminance: number): boolean {
  return !needsPlate(backdropLuminance, facts.inkPolarity)
}

/**
 * Pick which logo variant to stamp on a picture whose backdrop, under the mark,
 * measures at `backdropLuminance` (relative luminance, 0 to 1, same scale
 * `stamp.ts` already computes).
 */
export function pickLogoVariant(
  variants: LogoVariantFacts,
  backdropLuminance: number,
): LogoVariantPick {
  const light = hasInk(variants.light) ? variants.light : null
  const dark = hasInk(variants.dark) ? variants.dark : null

  if (light === null && dark === null) {
    return { ok: false, reason: 'Sahoda has no logo file with ink to place on this picture.' }
  }

  // Only one usable file: it is the answer, whatever the backdrop.
  if (light === null) return { ok: true, kind: 'dark' }
  if (dark === null) return { ok: true, kind: 'light' }

  const lightClears = clearsBackdrop(light, backdropLuminance)
  const darkClears = clearsBackdrop(dark, backdropLuminance)

  if (lightClears && !darkClears) return { ok: true, kind: 'light' }
  if (darkClears && !lightClears) return { ok: true, kind: 'dark' }

  if (lightClears && darkClears) {
    // Both clear contrast cleanly. Break the tie by the surface each file was
    // drawn for: on a dark backdrop (luminance below the midpoint) the DARK
    // variant is the more likely match; on a light one, the LIGHT variant is.
    return { ok: true, kind: backdropLuminance < 0.5 ? 'dark' : 'light' }
  }

  // Neither clears. Swapping the mark cannot fix a backdrop this hostile to
  // both files; drawing a plate is `stamp.ts`'s job, not this function's.
  return {
    ok: false,
    reason: 'Neither logo variant clears contrast on this backdrop without a plate.',
  }
}
