import { rgbToOklch } from '@/lib/brand/oklch'

/**
 * The colours a page DECLARES about itself.
 *
 * KEPT FROM wt-onboard's door when the rest of it was replaced by
 * `@sahoda/research`, because research has no answer for this and the obvious
 * alternative does not work on a server.
 *
 * `lib/brand/color-extract.ts#extractPalette` takes an `HTMLImageElement` and
 * reads pixels through a canvas — it is browser-only by construction, so it can
 * run on a logo the founder drops into the page and never on a site we fetched
 * server-side. Decoding the logo in Node instead would mean a new image
 * dependency for one meta tag's worth of signal.
 *
 * So this reads what the page SAYS rather than what it looks like: a
 * `theme-color` and the brand hex a stylesheet repeats are things the business
 * chose on purpose, which is a better signal than the average of a logo's
 * pixels — and free, since the markup is already in hand.
 *
 * Pure. `@sahoda/research`'s `onLandingHtml` hook owns the network and hands the
 * markup over, so all of this is testable without a request.
 */

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  const value =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex
  if (value.length !== 6) return null
  const int = parseInt(value, 16)
  if (!Number.isFinite(int)) return null
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

/**
 * Is this a colour that carries identity?
 *
 * Mirrors the intent of `lib/brand/color-extract.ts#isBackgroundPixel`: near
 * white, near black and near grey are page furniture on every site ever built,
 * and taking one as "their colour" would repaint the workspace in the default
 * grey of whatever theme they bought.
 */
function isIdentityColor({ r, g, b }: Rgb): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max > 245 && min > 245) return false
  if (max < 20) return false
  // Saturation on a 0-255 scale. Below this it is a neutral.
  return max - min >= 24
}

/** `theme-color` is a deliberate declaration, so it outranks anything counted. */
const THEME_COLOR_SCORE = 1000

function addScore(scores: Map<string, number>, rgb: Rgb, weight: number): void {
  if (!isIdentityColor(rgb)) return
  const key = `${rgb.r},${rgb.g},${rgb.b}`
  scores.set(key, (scores.get(key) ?? 0) + weight)
}

/** Cap the scan — a minified stylesheet can carry thousands of colour tokens. */
const MAX_COLOR_MATCHES = 400

/**
 * The colours a page DECLARES about itself, strongest first, as `oklch()`
 * strings ready for `brandSkinVars`.
 *
 * Why declared colours rather than pixels: `extractPalette` is canvas-bound
 * (`HTMLImageElement` + `getImageData`), so it cannot run on a server-fetched
 * page, and decoding the logo server-side would mean a new image dependency.
 * A site's `theme-color` and its most-repeated brand hex are things the
 * business chose on purpose — a better signal than the average of a logo's
 * pixels, and free.
 *
 * Returns `[]` freely. No colour is a first-class answer: `activeThemeTokens()`
 * already treats null as "use the defaults", and saying so is honest.
 */
export function declaredColors(html: string): string[] {
  const scores = new Map<string, number>()

  const themeColor = /<meta[^>]+name=["']?theme-color["']?[^>]*>/i.exec(html)?.[0]
  const themeHex = themeColor
    ? /content=["']?\s*#([0-9a-f]{3,6})/i.exec(themeColor)?.[1]
    : undefined
  if (themeHex) {
    const rgb = parseHex(themeHex.toLowerCase())
    if (rgb) addScore(scores, rgb, THEME_COLOR_SCORE)
  }

  let matches = 0
  for (const match of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    if (++matches > MAX_COLOR_MATCHES) break
    const rgb = parseHex(match[1]!.toLowerCase())
    if (rgb) addScore(scores, rgb, 1)
  }
  for (const match of html.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi)) {
    if (++matches > MAX_COLOR_MATCHES) break
    addScore(scores, { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }, 1)
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number)
      return rgbToOklch(r!, g!, b!)
    })
}
