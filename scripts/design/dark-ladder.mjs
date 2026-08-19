import { contrast, luminance, hexToRgb, rgbToHex, r2 } from './contrast.mjs'

/**
 * Solve the DARK tonal ladder against the LIGHT one, rather than inverting it.
 *
 * Light earns its hierarchy from a big gap between ink and mute (21.0 vs 7.23 —
 * a 2.90x ratio-of-ratios). Dark shipped 18.56 vs 13.53, a 1.37x gap, so
 * secondary text was nearly as loud as primary and every card read flat. This
 * finds the grey that restores the light theme's SEPARATION on a dark surface.
 */
const LIGHT = { canvas: '#ffffff', ink: '#000000', mute: '#575756' }
const DARK_SURFACE = '#131315'

const lightInk = contrast(LIGHT.ink, LIGHT.canvas)
const lightMute = contrast(LIGHT.mute, LIGHT.canvas)
const TARGET_SEPARATION = lightInk / lightMute

console.log('LIGHT reference')
console.log(
  `  ink ${r2(lightInk)}:1 · mute ${r2(lightMute)}:1 · separation ${r2(TARGET_SEPARATION)}x`,
)

const darkInk = contrast('#ffffff', DARK_SURFACE)
const wantedMuteRatio = darkInk / TARGET_SEPARATION
console.log(`\nDARK target: ink ${r2(darkInk)}:1, so mute should measure ${r2(wantedMuteRatio)}:1`)

/** Walk neutral greys and take the one closest to the wanted ratio. */
let best = null
for (let v = 255; v >= 0; v--) {
  const hex = rgbToHex([v, v, v])
  const ratio = contrast(hex, DARK_SURFACE)
  const err = Math.abs(ratio - wantedMuteRatio)
  if (!best || err < best.err) best = { hex, ratio, err }
}
console.log(`  solved --ink-mute (dark) = ${best.hex} → ${r2(best.ratio)}:1`)
console.log(
  `  separation achieved: ${r2(darkInk / best.ratio)}x  (light is ${r2(TARGET_SEPARATION)}x)`,
)
console.log(`  still clears AA body (4.5:1)? ${best.ratio >= 4.5 ? 'YES' : 'NO'}`)

console.log('\nSURFACE SEPARATION — cards must read as cards without relying on hairlines')
const pairs = [
  ['#0b0b0c', '#131315', 'shipped canvas → surface'],
  ['#0b0b0c', '#17171a', 'canvas → proposed surface'],
  ['#17171a', '#1e1e22', 'proposed surface → raised'],
]
for (const [a, b, label] of pairs) {
  const la = luminance(hexToRgb(a)),
    lb = luminance(hexToRgb(b))
  console.log(
    `  ${label.padEnd(28)} ${a} → ${b}  ΔL=${r2((lb - la) * 1000)}/1000  contrast ${r2(contrast(a, b))}:1`,
  )
}
