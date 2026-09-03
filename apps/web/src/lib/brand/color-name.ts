import { parseOklch } from './oklch'

/**
 * A name for a colour, so a screen reader has something to say about it.
 *
 * ── FOUR BUTTONS CALLED "USE THIS COLOUR" ───────────────────────────────────
 * MEASURED in `brand-panel.tsx`: every swatch carried the identical
 * `aria-label="Use this colour"`. A screen reader therefore announced four
 * buttons with one name and no way to tell them apart, and the ONLY thing
 * separating them on screen was the colour itself, which is also the one signal
 * a colour-blind reader does not get. Two failures, one cause: the swatch was
 * treated as decoration when it is the whole content of the control.
 *
 * This is not a colour-naming library and must not become one. It answers the
 * question the panel actually asks: which of these two or three or four is
 * which. So the bands are broad, the words are ordinary English, and the
 * qualifier moves with lightness because "deep blue" and "light blue" is how a
 * person distinguishes two blues out loud.
 *
 * ── THE BANDS ARE MEASURED, NOT GUESSED ────────────────────────────────────
 * OKLCH degrees are NOT the HSL ones, and the first cut of this table was
 * written from the HSL wheel from memory. It announced a plain red as orange and
 * a navy as purple. MEASURED with `rgbToOklch`, which is the only authority
 * here: pure red 29.2, crimson 23.7, Sahoda orange 43.5, yellow 94.9, green
 * 145.1, teal 194.8, blue 257.4, navy 267.2, purple 296.4, pink 349.4.
 *
 * Pink therefore straddles zero, which is why it appears at both ends.
 */
const BANDS: { until: number; name: string }[] = [
  { until: 15, name: 'pink' },
  { until: 35, name: 'red' },
  { until: 70, name: 'orange' },
  { until: 110, name: 'yellow' },
  { until: 170, name: 'green' },
  { until: 215, name: 'teal' },
  { until: 285, name: 'blue' },
  { until: 320, name: 'purple' },
  { until: 360, name: 'pink' },
]

/** Below this there is no hue worth naming, whatever the arithmetic says. */
const GREY_CHROMA = 0.03

function hueName(hue: number): string {
  const wrapped = ((hue % 360) + 360) % 360
  return BANDS.find((band) => wrapped < band.until)?.name ?? 'red'
}

function lightnessWord(l: number): string {
  if (l < 0.35) return 'deep '
  if (l < 0.55) return 'dark '
  if (l < 0.75) return ''
  return 'light '
}

/** One colour, named. `null` when the string is not a colour this app produced. */
export function colorName(css: string): string | null {
  let parsed
  try {
    parsed = parseOklch(css)
  } catch {
    return null
  }

  const { l, c, h } = parsed
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null
  if (c < GREY_CHROMA) return `${lightnessWord(l)}grey`.trim()

  return `${lightnessWord(l)}${hueName(h)}`
}

/**
 * A whole row of swatches, named so that no two names are the same.
 *
 * ── A UNIQUE-ENOUGH NAME IS NOT A UNIQUE NAME ───────────────────────────────
 * The panel dedupes its swatches perceptually before it draws them, so a
 * collision here is rare. Rare is not never: two blues far enough apart to be
 * worth offering can still both land in the same lightness band, and the moment
 * they do the accessible names are identical again and this file has bought
 * nothing. Numbering the repeats is plain and always works.
 *
 * The first of a repeated name is numbered too. "blue" then "blue 2" reads as
 * though the first one is the real blue and the second is an afterthought;
 * "blue 1" and "blue 2" reads as two blues, which is what they are.
 */
export function colorNames(colors: string[]): string[] {
  const named = colors.map((css, index) => colorName(css) ?? `colour ${index + 1}`)
  const counts = new Map<string, number>()
  for (const name of named) counts.set(name, (counts.get(name) ?? 0) + 1)

  const seen = new Map<string, number>()
  return named.map((name) => {
    if ((counts.get(name) ?? 0) < 2) return name
    const nth = (seen.get(name) ?? 0) + 1
    seen.set(name, nth)
    return `${name} ${nth}`
  })
}
