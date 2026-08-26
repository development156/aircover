/**
 * The swatch grid, and the hex parsing the field beside it needs.
 *
 * ── GENERATED, NOT LISTED ────────────────────────────────────────────────────
 * Sixty-odd hex literals would be sixty-odd chances for one of them to be a
 * shade nobody chose, and `design-lint` exempts exactly one file in this folder
 * for raw hex. Computing the ramp from HSL keeps this file free of colour
 * literals entirely, and the grid stays even because the arithmetic is even.
 *
 * These are DATA — colours a person picks for their own brand — and never the
 * palette this product paints itself with. That is `packages/shared/tokens.css`
 * and nothing here touches it.
 */

/** `#RRGGBB`, uppercase, which is the shape the store and the theme action expect. */
function hex(r: number, g: number, b: number): string {
  const two = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${two(r)}${two(g)}${two(b)}`.toUpperCase()
}

/** h 0-360, s and l 0-1. The standard conversion, written out rather than imported. */
export function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Eleven hues, evenly spaced, starting at red. */
const HUES = Array.from({ length: 11 }, (_, i) => Math.round((i * 360) / 11))

/** Five tones per hue, pale to deep. */
const TONES: readonly { s: number; l: number }[] = [
  { s: 0.82, l: 0.78 },
  { s: 0.86, l: 0.66 },
  { s: 0.9, l: 0.54 },
  { s: 0.82, l: 0.42 },
  { s: 0.74, l: 0.3 },
]

/** White to black in seven steps, so a brand that is not colourful is served too. */
const NEUTRALS: readonly string[] = Array.from({ length: 7 }, (_, i) => hslHex(0, 0, 1 - i / 6))

/** Row-major, neutrals first — the shape the grid renders. */
export const SWATCH_ROWS: readonly (readonly string[])[] = [
  NEUTRALS,
  ...TONES.map((tone) => HUES.map((h) => hslHex(h, tone.s, tone.l))),
]

/** Every swatch, flat. Exported for the test that proves they are all distinct. */
export const SWATCHES: readonly string[] = SWATCH_ROWS.flat()

/**
 * What somebody pasted → `#RRGGBB`, or null.
 *
 * ── WHY THIS IS LENIENT ON THE WAY IN ────────────────────────────────────────
 * A person copying a brand colour out of a brand book, Figma or a CSS file gets
 * `#0068D6`, `0068d6`, `#06D` or ` #0068D6 `. Refusing four of those five as
 * "invalid" would be the product being fussy about punctuation on the one field
 * where the user is doing exactly what was asked.
 *
 * Strict on the way OUT, though: one shape reaches the store, because
 * `saveWorkspaceTheme` and the swatch both read it and a mixed-case duplicate
 * would look like two different colours.
 */
export function parseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`.toUpperCase()
  return null
}

/**
 * Is this colour light enough that a dark tick reads on it?
 *
 * The selected swatch carries a check, and a white tick on `#FFFFFF` is an
 * invisible selection — the same defect the dark accent-on-tint rule exists for,
 * one layer down. Relative luminance, the WCAG definition, not an eyeballed
 * threshold.
 */
export function isLight(hexValue: string): boolean {
  const raw = hexValue.replace(/^#/, '')
  if (raw.length !== 6) return true
  const channel = (i: number) => {
    const v = parseInt(raw.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.4
}
