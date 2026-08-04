// Pure sRGB <-> OKLCH colour math (Björn Ottosson's Oklab matrices — the same
// constants the CSS Color Module Level 4 spec uses). Ported verbatim from
// apps/web/src/lib/brand/oklch.ts, which this lane may not import: docs/08 §1
// requires tokens-only, zero-hex output, so every Brand Skin value a generated
// site carries is an `oklch(L C H)` string computed from plain RGB numbers.
//
// Two deliberate differences from the apps/web original:
//   1. rgbToOklch returns an Oklch struct, not a formatted string — rounding is
//      formatOklch's job alone, so the guard can darken at full precision.
//   2. parseOklch returns null instead of throwing. Every caller here is on a
//      render path that must degrade to the unthemed default, never crash.

export interface Oklch {
  l: number
  c: number
  h: number
}

/** sRGB, 0-255 per channel. */
export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Anchored and lowercase-only on purpose. These values are written into a
 * `:root{...}` block on a customer's live domain, so the parse — not a later
 * escape — is what stops `oklch(0.5 0.1 20); } body{display:none` from landing.
 */
const OKLCH_PATTERN = /^oklch\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/

/** A real token is well under this; a longer string is junk, so bail before matching. */
const MAX_OKLCH_INPUT_LENGTH = 64

const LIGHTNESS_PRECISION = 4
const CHROMA_PRECISION = 4
const HUE_PRECISION = 1

const SRGB_TO_LINEAR_THRESHOLD = 0.04045
const LINEAR_TO_SRGB_THRESHOLD = 0.0031308
const SRGB_GAMMA = 2.4
const CHANNEL_MAX = 255
const DEGREES_PER_TURN = 360

const LUMINANCE_THRESHOLD = 0.03928
const LUMINANCE_R = 0.2126
const LUMINANCE_G = 0.7152
const LUMINANCE_B = 0.0722
/** WCAG's flare constant, added to both luminances before the ratio. */
const CONTRAST_FLARE = 0.05

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const round = (value: number, precision: number): number => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const srgbChannelToLinear = (channel255: number): number => {
  const c = clamp01(channel255 / CHANNEL_MAX)
  return c <= SRGB_TO_LINEAR_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** SRGB_GAMMA
}

const linearChannelToSrgb = (linear: number): number => {
  const c = clamp01(linear)
  const encoded = c <= LINEAR_TO_SRGB_THRESHOLD ? c * 12.92 : 1.055 * c ** (1 / SRGB_GAMMA) - 0.055
  return Math.round(clamp01(encoded) * CHANNEL_MAX)
}

/** `null` ⇒ the caller falls back to the unthemed default; it never throws. */
export const parseOklch = (raw: unknown): Oklch | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_OKLCH_INPUT_LENGTH) return null
  const match = OKLCH_PATTERN.exec(trimmed)
  if (match === null) return null
  const l = Number(match[1])
  const c = Number(match[2])
  const h = Number(match[3])
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) return null
  return { l, c, h }
}

export const formatOklch = (value: Oklch): string =>
  `oklch(${round(value.l, LIGHTNESS_PRECISION)} ${round(value.c, CHROMA_PRECISION)} ${round(
    value.h,
    HUE_PRECISION,
  )})`

export const oklchToRgb = (value: Oklch): Rgb => {
  const hRad = (value.h * Math.PI) / (DEGREES_PER_TURN / 2)
  const a = value.c * Math.cos(hRad)
  const bLab = value.c * Math.sin(hRad)

  const lLms = value.l + 0.3963377774 * a + 0.2158037573 * bLab
  const mLms = value.l - 0.1055613458 * a - 0.0638541728 * bLab
  const sLms = value.l - 0.0894841775 * a - 1.291485548 * bLab

  const lCubed = lLms ** 3
  const mCubed = mLms ** 3
  const sCubed = sLms ** 3

  const rLinear = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
  const gLinear = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
  const bLinear = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed

  return {
    r: linearChannelToSrgb(rLinear),
    g: linearChannelToSrgb(gLinear),
    b: linearChannelToSrgb(bLinear),
  }
}

export const rgbToOklch = (value: Rgb): Oklch => {
  const lr = srgbChannelToLinear(value.r)
  const lg = srgbChannelToLinear(value.g)
  const lb = srgbChannelToLinear(value.b)

  const lLms = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const mLms = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const sLms = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const lRoot = Math.cbrt(lLms)
  const mRoot = Math.cbrt(mLms)
  const sRoot = Math.cbrt(sLms)

  const l = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot
  const bLab = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot

  const c = Math.sqrt(a * a + bLab * bLab)
  let h = (Math.atan2(bLab, a) * (DEGREES_PER_TURN / 2)) / Math.PI
  if (h < 0) h += DEGREES_PER_TURN

  return { l, c, h }
}

/** WCAG relative luminance (0-1) of an sRGB colour. */
export const relativeLuminance = (value: Rgb): number => {
  const channelLuminance = (channel255: number): number => {
    const c = clamp01(channel255 / CHANNEL_MAX)
    return c <= LUMINANCE_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** SRGB_GAMMA
  }
  return (
    LUMINANCE_R * channelLuminance(value.r) +
    LUMINANCE_G * channelLuminance(value.g) +
    LUMINANCE_B * channelLuminance(value.b)
  )
}

/** WCAG contrast ratio (1-21) between two sRGB colours; order-independent. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const luminanceA = relativeLuminance(a)
  const luminanceB = relativeLuminance(b)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + CONTRAST_FLARE) / (darker + CONTRAST_FLARE)
}
