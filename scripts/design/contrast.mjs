/**
 * WCAG 2.1 relative-luminance contrast, and a solver for "darkest same-hue
 * step that still passes".
 *
 * This exists so no colour decision in docs/26 is a remembered number. Every
 * ratio quoted in the spec is printed by this file.
 */

export function srgbToLinear(c) {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '').trim()
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** Contrast is symmetric: the same pair yields one number in both directions. */
export function contrast(a, b) {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a)
  const lb = luminance(typeof b === 'string' ? hexToRgb(b) : b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const r2 = (n) => Math.round(n * 100) / 100

/* ---- HSL, so a darker orange keeps the BRAND HUE rather than drifting ---- */
export function rgbToHsl([r, g, b]) {
  const R = r / 255,
    G = g / 255,
    B = b / 255
  const max = Math.max(R, G, B),
    min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/**
 * Walk lightness DOWN from the source colour, holding hue, until the colour
 * clears `target` against every background in `against`. Returns the first
 * (lightest, therefore most brand-faithful) passing step.
 */
export function darkenUntilPasses(sourceHex, against, target) {
  const [h, s, l0] = rgbToHsl(hexToRgb(sourceHex))
  for (let step = 0; step <= 1000; step++) {
    const l = l0 - step * 0.001
    if (l < 0) break
    const hex = rgbToHex(hslToRgb([h, s, l]))
    const ratios = against.map((bg) => contrast(hex, bg))
    if (ratios.every((v) => v >= target))
      return { hex, ratios: ratios.map(r2), lightness: r2(l * 100) }
  }
  return null
}
