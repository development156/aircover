import { rgbToOklch } from '@/lib/brand/oklch'

/**
 * Pure HTML → (text, colours). No fetching here — `fetch-site.ts` owns the
 * network and hands the markup over, so all of this is testable without one.
 */

/** Elements whose text is chrome, not the business describing itself. */
const STRIP_ELEMENTS = ['script', 'style', 'noscript', 'svg', 'template', 'iframe']

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body.startsWith('#x') || body.startsWith('#X')
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      // Reject non-characters rather than emitting U+FFFD, which would then
      // count against the legibility gate for no reason.
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Readable text from markup. Block-level tags become newlines so sentences do
 * not run into each other — `<li>A</li><li>B</li>` must not read as "AB".
 */
export function htmlToText(html: string): string {
  let text = html
  for (const element of STRIP_ELEMENTS) {
    text = text.replace(new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?</${element}>`, 'gi'), ' ')
    // An unclosed <script> would otherwise leave its body as "text".
    text = text.replace(new RegExp(`<${element}\\b[^>]*>[\\s\\S]*$`, 'gi'), ' ')
  }
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)\b[^>]*>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')

  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The page's own name for itself — the closest thing to a business name. */
export function pageTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]!).replace(/\s+/g, ' ').trim() : ''
}

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
