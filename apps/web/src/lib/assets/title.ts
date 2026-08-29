/**
 * What a file is CALLED in the library.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE ─────────────────────────────────────────
 * `uploadAsset` read the browser's file name and nothing else. Three callers
 * were meanwhile setting a `title` field on the form — onboarding's logo step,
 * the topbar's "Replace logo", and the URL-source loop — and every one of them
 * was silently ignored. The form field compiled, sent, arrived and was dropped.
 *
 * It is not a cosmetic loss. `readBrandLogo` finds the workspace's logo by the
 * title `Logo`, so with the field dropped there was never a row to find: every
 * logo landed in the library under whatever the file happened to be called, and
 * the topbar showed its colour chip for ever. The logo was uploaded, stored and
 * invisible, which is the worst of the three possible outcomes because nothing
 * anywhere reported a failure.
 *
 * ── THE FILE NAME IS THE FALLBACK, NOT THE RULE ─────────────────────────────
 * A person dragging a photo in has said nothing about what to call it, and the
 * name they gave the file is the best answer available. A caller that DID say
 * outranks that, because it knows something the file name cannot: that this
 * particular upload is the workspace's logo.
 *
 * Blank in either position is not a title. A form field set to whitespace and a
 * form field absent are the same statement — nothing was said — so both fall
 * through rather than storing a title made of spaces that no `.eq()` will match.
 */

/** Long enough for a real sentence, bounded. Mirrors the column. */
export const MAX_ASSET_TITLE = 120

export function assetTitle(given: unknown, fileName: unknown): string | null {
  const chosen = firstNonBlank(given, fileName)
  return chosen === null ? null : chosen.slice(0, MAX_ASSET_TITLE)
}

function firstNonBlank(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const clean = candidate.trim()
    if (clean !== '') return clean
  }
  return null
}
