import { contrast, darkenUntilPasses, r2 } from './contrast.mjs'

const BRAND = '#ff6600'
const LIGHT_CANVAS = '#ffffff'
const DARK_CANVAS = '#0b0b0c'
const DARK_SURFACE = '#131315'

const AA_TEXT = 4.5 // normal body text
const AA_LARGE = 3.0 // >=24px, or >=18.66px bold
const AA_UI = 3.0 // component boundaries + focus indicators (WCAG 1.4.11)

const line = (s = '') => console.log(s)
const verdict = (ratio, target) => (ratio >= target ? 'PASS' : 'FAIL')

line('══ 1. THE PAIR THE BRIEF NAMES ══')
const onWhite = contrast(BRAND, LIGHT_CANVAS)
line(
  `  ${BRAND} on ${LIGHT_CANVAS}   ${r2(onWhite)}:1   body ${verdict(onWhite, AA_TEXT)} · large ${verdict(onWhite, AA_LARGE)} · ui ${verdict(onWhite, AA_UI)}`,
)
line('  (contrast is symmetric — this is also white text on an orange fill)')

line()
line('══ 2. INK ON ORANGE — the fill fix ══')
const inkOnBrand = contrast('#000000', BRAND)
line(`  #000000 on ${BRAND}   ${r2(inkOnBrand)}:1   body ${verdict(inkOnBrand, AA_TEXT)}`)
line(
  `  #ffffff on ${BRAND}   ${r2(onWhite)}:1   body ${verdict(onWhite, AA_TEXT)}   <- what tokens.css ships today`,
)

line()
line('══ 3. ORANGE AS TEXT ON DARK ══')
for (const bg of [DARK_CANVAS, DARK_SURFACE]) {
  const c = contrast(BRAND, bg)
  line(`  ${BRAND} on ${bg}   ${r2(c)}:1   body ${verdict(c, AA_TEXT)}`)
}

line()
line('══ 4. SOLVED: darkest brand-hue orange that clears AA body on light ══')
const solved = darkenUntilPasses(BRAND, [LIGHT_CANVAS], AA_TEXT)
line(
  `  ${solved.hex}  (HSL lightness ${solved.lightness}%)  on ${LIGHT_CANVAS} = ${solved.ratios[0]}:1  ${verdict(solved.ratios[0], AA_TEXT)}`,
)
line(
  `  same colour on ${DARK_SURFACE} = ${r2(contrast(solved.hex, DARK_SURFACE))}:1  ${verdict(contrast(solved.hex, DARK_SURFACE), AA_TEXT)}  <- why ONE token cannot serve both themes`,
)

line()
line('══ 5. NEGATIVE CONTROL — a pair that MUST fail ══')
const bad = contrast('#8c8c8c', LIGHT_CANVAS)
line(`  #8c8c8c (--ink-faint) on ${LIGHT_CANVAS}   ${r2(bad)}:1   body ${verdict(bad, AA_TEXT)}`)
if (bad >= AA_TEXT) {
  console.error('  !! the checker did not discriminate — ABORT')
  process.exit(1)
}
line('  checker discriminates: it returns FAIL on a pair known to be bad.')

line()
line('══ 6. THE STALE COMMENT IN tokens.css:52 ══')
line(
  `  file claims 3.13:1 for #ffffff on ${BRAND}; measured ${r2(onWhite)}:1 — the comment is wrong.`,
)
