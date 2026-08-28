import { paintOf, type Palette, type Paint } from '@sahoda/shared'
import type { ThemeTokens } from '@sahoda/shared'

import { contrastRatio, oklchToRgb, parseOklch, type Rgb } from '@/lib/brand/oklch'

/**
 * THE WORKSPACE'S BRAND, TURNED INTO NUMBERS THE RENDERER WILL ACCEPT.
 *
 * ── THIS IS THE ONE PLACE OKLCH IS ALLOWED TO EXIST ─────────────────────────
 * `workspace_themes.tokens` stores colours as `oklch(L C H)` strings. The
 * renderer cannot take one: MEASURED through this repository's own sharp, an
 * SVG fill of `oklch(0.63 0.17 33)` rasterises to rgba 0,0,0,255 — pure black,
 * byte-identical to a fill of `notacolour`, with nothing thrown and nothing
 * logged. A design exported that way is a valid PNG of the right size in which
 * every brand colour is black, and no check downstream looks at what a picture
 * CONTAINS.
 *
 * So the conversion happens here, once, and `@sahoda/shared` never sees a
 * colour string at all. Everything past this function is integers.
 *
 * ── A COLOUR THAT WILL NOT CONVERT FALLS BACK, AND IT DOES SO LOUDLY ────────
 * `parseOklch` THROWS on anything it cannot read. A theme row is customer data
 * that has been through a jsonb column, so it can be malformed, and a throw
 * here would take out the whole studio for one bad field.
 *
 * Each role therefore falls back INDEPENDENTLY to the default palette, and the
 * result reports which roles fell back. That is not decoration: a design quietly
 * rendered in Sahoda's colours instead of the customer's is exactly the kind of
 * wrong-but-plausible output this product is built to refuse, so the screen can
 * say "we could not read your brand colours" rather than showing a picture that
 * looks deliberate.
 *
 * ── AND THE INK IS CHOSEN, NEVER STORED ─────────────────────────────────────
 * `accentInk` is what goes ON the accent, and picking it by contrast rather
 * than reading `primaryFg` is the same ruling `packages/sites` already made:
 * "--pfg comes from the Readability Guard, never from stored primaryFg". A
 * stored foreground can be wrong; a computed one cannot be less legible than
 * the better of black and white.
 */

/** Sahoda's own colours, used when a workspace has no theme or a role will not convert. */
const DEFAULT_RGB: Record<keyof Palette, Rgb> = {
  paper: { r: 255, g: 255, b: 255 },
  ink: { r: 23, g: 23, b: 23 },
  muted: { r: 87, g: 87, b: 90 },
  accent: { r: 255, g: 102, b: 0 },
  accentInk: { r: 255, g: 255, b: 255 },
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

export interface ResolvedPalette {
  palette: Palette
  /**
   * Roles that could not be read from the theme and fell back to Sahoda's own.
   *
   * Empty is the ordinary case. A non-empty list is a fact the screen must
   * state, because the alternative is a design in the wrong colours that looks
   * entirely intentional.
   */
  fellBack: (keyof Palette)[]
}

/** One OKLCH token to integers, or null when it cannot be read. Never throws. */
function rgbFromToken(token: string | undefined): Rgb | null {
  if (typeof token !== 'string' || token === '') return null
  try {
    const { l, c, h } = parseOklch(token)
    if (![l, c, h].every(Number.isFinite)) return null
    return oklchToRgb(l, c, h)
  } catch {
    return null
  }
}

function paintFromRgb(rgb: Rgb): Paint {
  // Every channel is already 0-255 from `oklchToRgb`, but this is the boundary
  // where that stops being an assumption, so it is checked rather than trusted.
  return (
    paintOf(Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b)) ??
    paintOf(DEFAULT_RGB.ink.r, DEFAULT_RGB.ink.g, DEFAULT_RGB.ink.b)!
  )
}

/**
 * Black or white on this colour, whichever a person can actually read.
 *
 * The Readability Guard's rule, applied at the one point the studio needs it.
 * Ties go to white because a brand accent is usually a mid-to-dark colour and
 * white is the conventional label on one.
 */
export function inkOn(background: Rgb): Rgb {
  return contrastRatio(WHITE, background) >= contrastRatio(BLACK, background) ? WHITE : BLACK
}

/**
 * Build the studio palette for a workspace.
 *
 * `null` tokens is the ordinary case for a workspace that never set a brand, and
 * it is NOT a fallback: there was nothing to read, so nothing fell back. Only a
 * theme that exists and cannot be parsed reports a role.
 */
export function studioPalette(tokens: ThemeTokens | null): ResolvedPalette {
  const fellBack: (keyof Palette)[] = []

  if (tokens === null) {
    return {
      palette: {
        paper: paintFromRgb(DEFAULT_RGB.paper),
        ink: paintFromRgb(DEFAULT_RGB.ink),
        muted: paintFromRgb(DEFAULT_RGB.muted),
        accent: paintFromRgb(DEFAULT_RGB.accent),
        accentInk: paintFromRgb(DEFAULT_RGB.accentInk),
      },
      fellBack: [],
    }
  }

  const take = (role: keyof Palette, token: string | undefined): Rgb => {
    const rgb = rgbFromToken(token)
    if (rgb === null) {
      fellBack.push(role)
      return DEFAULT_RGB[role]
    }
    return rgb
  }

  const accent = take('accent', tokens.primary)
  const paper = take('paper', tokens.surface[0])
  const ink = take('ink', tokens.text.hi)
  const muted = take('muted', tokens.text.mid)

  return {
    palette: {
      paper: paintFromRgb(paper),
      ink: paintFromRgb(ink),
      muted: paintFromRgb(muted),
      accent: paintFromRgb(accent),
      // Computed, never read. See the header.
      accentInk: paintFromRgb(inkOn(accent)),
    },
    fellBack,
  }
}

/**
 * The sentence for a palette that fell back, or null when it did not.
 *
 * Names the count rather than the roles: "primary" and "text.hi" are our field
 * names, and a customer has never seen them. What they can act on is that their
 * colours were not used and where to fix it.
 */
export function describePaletteFallback(resolved: ResolvedPalette): string | null {
  if (resolved.fellBack.length === 0) return null
  const which =
    resolved.fellBack.length === 1
      ? 'One of your brand colours could not be read'
      : `${resolved.fellBack.length} of your brand colours could not be read`
  return `${which}, so this design uses Sahoda's colours instead. Set them again in Brand Brain and make this design once more.`
}
