/**
 * EVERY COLOUR THAT REACHES THE RENDERER IS AN INTEGER, AND THE REASON IS A
 * SILENT FAILURE THAT PRODUCES A PERFECTLY VALID BLACK PICTURE.
 *
 * ── THE MEASUREMENT ─────────────────────────────────────────────────────────
 * MEASURED 2026-08-28 through this repository's own `sharp` 0.35.3 / libvips
 * 8.18.3, by rasterising a 40x40 SVG whose single rect carries each fill and
 * reading pixel 0 back out raw:
 *
 *   fill="#E4572E"                        -> rgba 228  87  46 255   correct
 *   fill="rgb(228,87,46)"                 -> rgba 228  87  46 255   correct
 *   fill="oklch(0.63 0.17 33)"            -> rgba   0   0   0 255   BLACK
 *   fill="color(srgb 0.894 0.341 0.180)"  -> rgba   0   0   0 255   BLACK
 *   fill="notacolour"                     -> rgba   0   0   0 255   BLACK
 *
 * The rasteriser does not throw, does not warn, and does not distinguish a
 * modern colour function from a typed-in word. It renders all three as pure
 * black and reports success.
 *
 * That matters here more than anywhere else in the codebase, because a
 * workspace's brand colours ARE OKLCH strings: `workspace_themes.tokens` holds
 * `oklch(L C H)` values, `ThemeTokensSchema` documents them as such, and
 * `packages/sites` writes them into live customer CSS. Handing one of those
 * straight to the renderer would export a design in which every brand colour is
 * black, and every check downstream would pass: the PNG is valid, the pixel
 * dimensions are exact, the byte count is plausible, and the Constraint Engine
 * has no opinion about colour. Nothing between here and the customer's feed
 * would notice.
 *
 * ── SO THE TYPE SYSTEM STOPS IT, NOT A CODE REVIEW ──────────────────────────
 * `renderSvg` cannot be handed a colour string at all. It takes `Paint` values,
 * which are integers, and it emits `#rrggbb`. There is no code path from a
 * theme token to a fill attribute that does not pass through `paintFrom`, and
 * `paintFrom` returns null for anything it cannot resolve to numbers. A null
 * paint is a refusal to render, never a fallback: falling back to a default
 * colour would reintroduce exactly the failure this file exists to prevent,
 * one shade further from the truth.
 *
 * ── THIS FILE DOES NOT DO COLOUR MATHS ──────────────────────────────────────
 * It parses `#rgb`, `#rrggbb` and `#rrggbbaa`, and nothing else. It converts
 * NOTHING. An OKLCH token must be converted by the caller, which already has a
 * converter: `apps/web/src/lib/brand/oklch.ts` and
 * `packages/sites/src/theme/oklch.ts` both export `oklchToRgb`. Those two are a
 * FORK of one another with different signatures, and unifying them is a real
 * refactor across two packages that this module deliberately does not attempt.
 * Writing a third copy here would have been the worse of the two options.
 *
 * Pure: no I/O, no clock, no database.
 */

/** An sRGB colour, 0-255 per channel, alpha 0-1. Integers, never a string. */
export interface Paint {
  r: number
  g: number
  b: number
  a: number
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

/** A real colour string is far shorter than this; a longer one is junk. */
const MAX_INPUT_LENGTH = 32

/**
 * Turn a colour string into integers, or return null.
 *
 * ── NULL IS THE WHOLE POINT, AND IT IS NOT A NEAR MISS ──────────────────────
 * `oklch(...)`, `rgb(...)`, `color(srgb ...)`, a named colour and a typo all
 * return null together. That looks harsh for `rgb()`, which the rasteriser
 * actually understands. It is deliberate: the moment this function accepts one
 * string format it becomes a colour parser, and the next person to widen it
 * will reach for the format that renders black. One shape in, integers out.
 */
export function paintFrom(raw: unknown): Paint | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value.length === 0 || value.length > MAX_INPUT_LENGTH) return null

  const short = HEX3.exec(value)
  if (short) {
    return {
      r: Number.parseInt(`${short[1]}${short[1]}`, 16),
      g: Number.parseInt(`${short[2]}${short[2]}`, 16),
      b: Number.parseInt(`${short[3]}${short[3]}`, 16),
      a: 1,
    }
  }

  const full = HEX6.exec(value)
  if (full) {
    return {
      r: Number.parseInt(full[1] as string, 16),
      g: Number.parseInt(full[2] as string, 16),
      b: Number.parseInt(full[3] as string, 16),
      a: 1,
    }
  }

  const withAlpha = HEX8.exec(value)
  if (withAlpha) {
    return {
      r: Number.parseInt(withAlpha[1] as string, 16),
      g: Number.parseInt(withAlpha[2] as string, 16),
      b: Number.parseInt(withAlpha[3] as string, 16),
      a: Number.parseInt(withAlpha[4] as string, 16) / 255,
    }
  }

  return null
}

/** Build a paint from numbers the caller already has. Out-of-range values are refused, not clamped. */
export function paintOf(r: number, g: number, b: number, a = 1): Paint | null {
  const channels = [r, g, b]
  for (const channel of channels) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) return null
  }
  if (!Number.isFinite(a) || a < 0 || a > 1) return null
  return { r, g, b, a }
}

/**
 * Is this actually a paint, at runtime?
 *
 * ── TYPES ARE ERASED, AND THIS MODULE'S WHOLE JOB IS A RUNTIME PROPERTY ─────
 * `Paint` is a structural interface, so `{ r: NaN, g: 0, b: 0, a: 1 }`
 * satisfies the compiler. It reached `hexOf` and came back `#NaN0000`, which
 * the renderer emitted into a fill attribute and the rasteriser painted PURE
 * BLACK — the exact failure this file was written to prevent, arriving through
 * the file itself. Found by an adversarial review of the first commit and
 * reproduced before it was fixed.
 *
 * A paint that crosses a package boundary, comes back from JSON, or is built by
 * arithmetic has not been checked by anything. So it is checked here.
 */
export function isPaint(value: unknown): value is Paint {
  if (typeof value !== 'object' || value === null) return false
  const paint = value as Partial<Paint>
  for (const channel of [paint.r, paint.g, paint.b]) {
    if (typeof channel !== 'number' || !Number.isFinite(channel)) return false
    if (channel < 0 || channel > 255) return false
  }
  return typeof paint.a === 'number' && Number.isFinite(paint.a) && paint.a >= 0 && paint.a <= 1
}

/**
 * The only string this module ever produces, and the only one the renderer emits.
 *
 * Always six-digit lowercase hex. Alpha is deliberately NOT folded into an
 * eight-digit form: SVG carries opacity in its own attribute, and an
 * eight-digit fill is one of the shapes librsvg treats inconsistently. Callers
 * read `a` separately.
 *
 * Returns null for anything that is not a paint, rather than a black hex or a
 * throw. Black would be indistinguishable from a colour somebody chose.
 */
export function hexOf(paint: Paint): string | null {
  if (!isPaint(paint)) return null
  const pair = (channel: number): string => Math.round(channel).toString(16).padStart(2, '0')
  return `#${pair(paint.r)}${pair(paint.g)}${pair(paint.b)}`
}
