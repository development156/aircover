#!/usr/bin/env node
/**
 * Every number in docs/37 is printed by this file.
 *
 * docs/26 established the rule that no colour decision may be a remembered
 * number (scripts/design/contrast.mjs). v5 keeps it and widens it: the tonal
 * ladders, the accent-text step, the inverse-surface scope and the gradient
 * ceiling are all SOLVED here and quoted from this output, so a value in the
 * spec can always be reproduced by running one command.
 *
 *   node scripts/design/solve-v5.mjs
 *
 * The reference values marked MEASURED were sampled off the screenshots in
 * docs/design-inspiration/runey/ with Pillow, not estimated by eye.
 */

import { contrast, darkenUntilPasses, hexToRgb, luminance, r2 } from './contrast.mjs'

const line = (s = '') => console.log(s)
const head = (s) => {
  line()
  line('─'.repeat(74))
  line(s)
  line('─'.repeat(74))
}

/* ── The two ladders ────────────────────────────────────────────────────────
   Light is Runey's page/card pair, measured. Dark is Runey's dark dashboard,
   measured. Neither is an inversion of the other — they are two separate
   readings of the same reference. */
const LIGHT = {
  canvas: '#fafafa',
  surface: '#ffffff',
  'surface-2': '#f2f2f3',
  'surface-3': '#e9e9eb',
  line: '#e9e9ec',
}
const DARK = {
  canvas: '#0d0d0d',
  surface: '#171717',
  'surface-2': '#212121',
  'surface-3': '#292929',
  line: '#333333',
}

/**
 * Adjacent-rung separation, in the two units this repo already speaks.
 *
 * `contrast` is what docs/26's dark-mode repair quoted ("makes the two steps
 * 1.042 and 1.045"); ΔL/1000 is what dark-ladder.mjs printed. Reporting both
 * means the spec and the guard cannot end up in different units, which is the
 * failure mode that let --surface-2 ship EQUAL to --surface in dark.
 */
function ladder(name, rungs, floorContrast) {
  head(`${name} TONAL LADDER — floor ${floorContrast}:1 between adjacent rungs`)
  const keys = Object.keys(rungs).filter((k) => k !== 'line')
  let worst = Infinity
  for (let i = 0; i < keys.length - 1; i++) {
    const a = rungs[keys[i]]
    const b = rungs[keys[i + 1]]
    const c = contrast(a, b)
    const dl = (luminance(hexToRgb(b)) - luminance(hexToRgb(a))) * 1000
    worst = Math.min(worst, c)
    line(
      `  ${keys[i].padEnd(9)} → ${keys[i + 1].padEnd(9)} ${a} → ${b}  ` +
        `contrast ${r2(c)}:1   ΔL ${r2(Math.abs(dl))}/1000  ${c >= floorContrast ? 'ok' : 'UNDER FLOOR'}`,
    )
  }
  line(`  worst adjacent pair: ${r2(worst)}:1  (floor ${floorContrast}:1)`)
  return worst
}

/* Two floors, not one — and BOTH are derived from what the reference actually
   achieves, not asserted.

   THE UNIT MATTERS, AND THE OBVIOUS ONE IS WRONG. In ΔL/1000 the light steps
   measure 44–111 and the dark steps 4.5–7.0: a 10–20x difference for pairs
   that are doing the same job. In CONTRAST they measure 1.04 and 1.08 — the
   same order. sRGB is compressed near black, so a luminance delta is not
   comparable across the two ends of the range and a floor written in ΔL would
   condemn a dark ladder that is fine. dark-ladder.mjs printed ΔL; the spec and
   the guard both use contrast, and this comment is why.

   The floors sit just under the reference's own worst adjacent pair, so a rung
   may be tuned without tripping the guard, while the defect the guard exists
   for — v4 shipped --surface-2 BYTE-IDENTICAL to --surface in dark, 1.000:1 —
   is caught with room to spare.

     light: reference worst 1.04:1  → floor 1.03
     dark:  reference worst 1.08:1  → floor 1.06 */
const LIGHT_FLOOR = 1.03
const DARK_FLOOR = 1.06
ladder('LIGHT', LIGHT, LIGHT_FLOOR)
ladder('DARK', DARK, DARK_FLOOR)

/* ── Accent text ────────────────────────────────────────────────────────────
   v4 solved --acc against --surface alone, when --surface WAS #ffffff and
   --canvas was too. v5 moves the page ground to #fafafa, so accent text now
   has two grounds to clear and the darker of the two decides. */
head('ACCENT TEXT — solved against BOTH grounds, not just the card')
const AA = 4.5
const grounds = [LIGHT.surface, LIGHT.canvas, LIGHT['surface-2']]
const acc = darkenUntilPasses('#ff6600', grounds, AA)
line(`  brand      #ff6600  on ${grounds.join(' / ')}`)
for (const g of grounds) line(`     on ${g}: ${r2(contrast('#ff6600', g))}:1`)
line(`  solved --acc = ${acc.hex}  ratios ${acc.ratios.join(' / ')}  (AA ${AA}:1)`)
line(
  `  v4 shipped #c95100 — on the NEW canvas it measures ${r2(contrast('#c95100', LIGHT.canvas))}:1`,
)

head('TEXT ON THE BRAND FILL — the Readability Guard question')
for (const fg of ['#ffffff', '#000000']) {
  line(`  ${fg} on #ff6600 : ${r2(contrast(fg, '#ff6600'))}:1`)
}
line('  → ink wins, and it is the same answer brandSkinVars() gives a customer.')

/* ── The inverse surface ────────────────────────────────────────────────────
   The rail is #171717 in BOTH themes, so in light it is an inverted context
   sitting inside a light document. Its text tokens cannot be the document's.
   Solved the same way docs/26 solved dark --ink-mute: reproduce the LIGHT
   theme's ratio-of-ratios between primary and secondary text. */
head('INVERSE SURFACE (the rail) — #171717 in both themes')
const INVERSE = '#171717'
const lightInk = contrast('#000000', LIGHT.surface)
const lightMute = contrast('#575756', LIGHT.surface)
const targetSeparation = lightInk / lightMute
line(
  `  light reference: ink ${r2(lightInk)}:1 · mute ${r2(lightMute)}:1 · separation ${r2(targetSeparation)}x`,
)
const invInk = contrast('#ffffff', INVERSE)
const want = invInk / targetSeparation
let best = null
for (let v = 255; v >= 0; v--) {
  const hex = '#' + v.toString(16).padStart(2, '0').repeat(3)
  const err = Math.abs(contrast(hex, INVERSE) - want)
  if (!best || err < best.err) best = { hex, err, ratio: contrast(hex, INVERSE) }
}
line(`  inverse ink   #ffffff on ${INVERSE} = ${r2(invInk)}:1`)
line(
  `  inverse mute  solved = ${best.hex} → ${r2(best.ratio)}:1  (AA body? ${best.ratio >= 4.5 ? 'YES' : 'NO'})`,
)
line(`  separation achieved ${r2(invInk / best.ratio)}x against light's ${r2(targetSeparation)}x`)
line(
  `  brand #ff6600 on ${INVERSE}: ${r2(contrast('#ff6600', INVERSE))}:1 — accent text needs no darkening here`,
)

/* ── The gradient ceiling ───────────────────────────────────────────────────
   "If you can read it as decorative from six feet away it is too strong."
   Turned into a number: the gradient's extreme against the flat canvas must
   stay under the smallest separation the ladder itself uses, so it can never
   read as a surface edge. */
head('GRADIENT CEILING — the wash must stay below one ladder step')
const step = contrast(LIGHT.canvas, LIGHT.surface)
line(`  smallest deliberate light step (canvas→surface): ${r2(step)}:1`)
line(`  so the gradient's darkest point against --canvas must measure < ${r2(step)}:1`)
for (const probe of ['#f7f6f4', '#f6f5f8', '#f4f4f6']) {
  line(`     probe ${probe} vs ${LIGHT.canvas}: ${r2(contrast(probe, LIGHT.canvas))}:1`)
}
const dstep = contrast(DARK.canvas, DARK.surface)
line(`  dark: smallest deliberate step ${r2(dstep)}:1`)
for (const probe of ['#111013', '#0f1012', '#131015']) {
  line(`     probe ${probe} vs ${DARK.canvas}: ${r2(contrast(probe, DARK.canvas))}:1`)
}

head('MUTED / FAINT TEXT on every ground it is allowed on')
for (const [nm, mute] of [
  ['light --ink-mute #57575a', '#57575a'],
  ['light --ink-faint #8c8c8c', '#8c8c8c'],
]) {
  const rs = grounds.map((g) => `${g} ${r2(contrast(mute, g))}:1`)
  line(`  ${nm.padEnd(26)} ${rs.join('   ')}`)
}
const darkGrounds = [DARK.surface, DARK.canvas, DARK['surface-2']]
for (const [nm, mute] of [
  ['dark --ink-mute #979797', '#979797'],
  ['dark --ink-faint #6f6f6f', '#6f6f6f'],
]) {
  const rs = darkGrounds.map((g) => `${g} ${r2(contrast(mute, g))}:1`)
  line(`  ${nm.padEnd(26)} ${rs.join('   ')}`)
}
line()
