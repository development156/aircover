/**
 * WHAT FILE TYPES A PERSON MAY OFFER AS THEIR LOGO.
 *
 * ── WHY THIS IS A CONSTANT AND NOT TWO STRING LITERALS ──────────────────────
 * There are exactly two doors a logo comes in through: the onboarding visual
 * step, and the brand panel in the topbar. On 2026-08-31 they disagreed. The
 * panel offered `image/svg+xml` and onboarding did not, so a shop whose logo is
 * an SVG could replace it later but could not give it in the first place, on the
 * one screen that asks for it by name. The founder reported that same inability
 * three times about the panel before it was fixed there; onboarding kept it.
 *
 * A list written twice is a list that drifts, and this one drifted in the
 * direction that costs a customer their logo at the exact moment they are
 * handing it over. So both inputs read this.
 *
 * ── WHY AN SVG IS SAFE TO OFFER HERE ────────────────────────────────────────
 * `setBrandLogo` rasterises it and throws the vector away, so nothing that
 * reaches storage, a signed link, a browser or a model is ever an SVG.
 * `lib/brand/svg-logo.ts` carries the reasoning: an SVG is a script container,
 * sanitising is a blacklist and blacklists are defeatable, so the entire class
 * of defect goes away by turning the file into a bitmap rather than by
 * filtering it.
 *
 * That is why this constant may only be used by an input whose file reaches
 * `setBrandLogo`. An input that hands its file to `uploadAsset` instead must
 * NOT offer SVG: `lib/assets/kind.ts` refuses one, correctly, and the person
 * would pick a file and be told it is not an image.
 *
 * ── WHAT THIS CANNOT PROMISE ────────────────────────────────────────────────
 * `accept` is a hint to the file dialog and nothing more. A person can still
 * choose any file through "All files", and a drag and drop bypasses it
 * entirely. Every check that matters happens after the bytes arrive: the client
 * decodes the image to read its colours and says so honestly when it cannot,
 * and the server sniffs the bytes rather than trusting the name or the type the
 * browser reported.
 */
export const LOGO_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
