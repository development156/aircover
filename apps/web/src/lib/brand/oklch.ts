// Pure sRGB <-> OKLCH color math (Björn Ottosson's Oklab matrices, the same
// constants used by the CSS Color Module Level 4 spec). No color library:
// docs/08 §1 requires tokens-only, zero-hex app code, so every Brand Skin
// value this app produces is expressed as an `oklch(L C H)` string computed
// from plain RGB numbers — never a hex literal.

export interface Rgb {
  r: number
  g: number
  b: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function srgbChannelToLinear(channel255: number): number {
  const c = clamp01(channel255 / 255)
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearChannelToSrgb(linear: number): number {
  const c = clamp01(linear)
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(clamp01(encoded) * 255)
}

/** sRGB (0–255 per channel) -> `oklch(L C H)`. */
export function rgbToOklch(r: number, g: number, b: number): string {
  const lr = srgbChannelToLinear(r)
  const lg = srgbChannelToLinear(g)
  const lb = srgbChannelToLinear(b)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(a * a + bLab * bLab)
  let h = (Math.atan2(bLab, a) * 180) / Math.PI
  if (h < 0) h += 360

  return formatOklch(L, c, h)
}

/** `oklch(L C H)` -> sRGB (0–255 per channel, clamped/rounded). */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const bLab = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bLab
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bLab
  const s_ = l - 0.0894841775 * a - 1.291485548 * bLab

  const lCubed = l_ ** 3
  const mCubed = m_ ** 3
  const sCubed = s_ ** 3

  const rLinear = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
  const gLinear = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
  const bLinear = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed

  return {
    r: linearChannelToSrgb(rLinear),
    g: linearChannelToSrgb(gLinear),
    b: linearChannelToSrgb(bLinear),
  }
}

export function formatOklch(l: number, c: number, h: number): string {
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 1)})`
}

export function parseOklch(input: string): { l: number; c: number; h: number } {
  const match = /oklch\(\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\)/.exec(input)
  if (!match) throw new Error(`Not a valid oklch() string: "${input}"`)
  const [, l, c, h] = match
  return { l: Number(l), c: Number(c), h: Number(h) }
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/** WCAG relative luminance (0–1) of an sRGB color. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channelLuminance = (channel255: number): number => {
    const c = clamp01(channel255 / 255)
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG contrast ratio (1–21) between two sRGB colors, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminanceA = relativeLuminance(a)
  const luminanceB = relativeLuminance(b)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}
