#!/usr/bin/env node
/**
 * MEASURE THE COST OF EVERY BLUR THIS SYSTEM SHIPS.
 *
 * docs/37 §7 justifies "glass on chrome, opaque on data" partly on cost, and a
 * cost claim that is not measured is an opinion. This measures it.
 *
 *   node scripts/design/glass-cost.mjs [--port 3260] [--throttle 6]
 *
 * ── WHAT IS MEASURED, AND WHAT IS INFERRED ───────────────────────────────────
 * MEASURED: frame time on THIS machine's headless Chromium under a CPU
 * throttle, scrolling a real page, with the shipped glass surfaces enabled and
 * then neutralised. Scrolling is the load case that matters — backdrop-filter
 * costs nothing until the content behind it changes, and a sticky topbar over a
 * scrolling document is exactly that.
 *
 * INFERRED: what this means on a mid-range Android. It cannot be measured from
 * here — no device, and a CPU throttle models the CPU, not a mobile GPU's
 * fill-rate, which is the part backdrop-filter actually taxes. The throttle is
 * a proxy that is directionally right and numerically not the phone. Read the
 * DELTA, not the absolute.
 *
 * The comparison is like-for-like: the same page, the same scroll, the same
 * process. Only `backdrop-filter` is switched off, so the delta is the blur and
 * not the layout.
 */

import { chromium } from '@playwright/test'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? dflt : process.argv[i + 1]
}
const PORT = Number(arg('port', 3260))
const PATH = arg('path', '/design-system')
const THROTTLE = Number(arg('throttle', 6))
const FRAMES = 120

/** Drive a real scroll and report per-frame times from rAF. */
async function run(page, label, disableGlass) {
  if (disableGlass) {
    await page.addStyleTag({
      content: `.glass{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}`,
    })
  }
  // Let the compositor settle so the first frames are not paying for layout.
  await page.waitForTimeout(600)

  const times = await page.evaluate(async (frames) => {
    const out = []
    let last = performance.now()
    let y = 0
    return await new Promise((resolve) => {
      function step() {
        const now = performance.now()
        out.push(now - last)
        last = now
        // A real scroll, not a transform: the topbar is sticky, so this is what
        // forces the blur to re-sample every frame.
        y = (y + 8) % Math.max(1, document.body.scrollHeight - window.innerHeight)
        window.scrollTo(0, y)
        if (out.length >= frames) resolve(out)
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }, FRAMES)

  // Drop the first 10: they carry the scroll's own start-up cost.
  const s = times.slice(10).sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return {
    label,
    median: Math.round(q(0.5) * 100) / 100,
    p95: Math.round(q(0.95) * 100) / 100,
    worst: Math.round(s[s.length - 1] * 100) / 100,
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const client = await page.context().newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

const url = `http://127.0.0.1:${PORT}${PATH}`
await page.goto(url, { waitUntil: 'networkidle' })

const glassCount = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('*')).filter((e) => {
    const f = getComputedStyle(e).backdropFilter
    return f && f !== 'none'
  })
  return { n: els.length, tags: els.map((e) => e.tagName.toLowerCase()).slice(0, 10) }
})

/* REFUSE TO REPORT A DELTA FOR A PAGE WITH NO BLUR ON IT.
   The first run of this script reported "+0ms (+0%)" against /design-system and
   it was true and worthless: that route is public, sits outside (app), and
   therefore has no topbar, no rail and no bottom bar — nothing on it was
   blurred. A cost measurement that cannot tell "no cost" from "nothing
   measured" is the same fault as a test suite that reports green having run
   nothing. */
if (glassCount.n === 0) {
  console.error(`\nREFUSED: ${url} has ZERO elements with a backdrop-filter.`)
  console.error('A delta measured here would be a measurement of nothing.')
  console.error('Point --path at a route that actually carries glass chrome.')
  await browser.close()
  process.exit(2)
}

const withGlass = await run(page, 'glass ON', false)
// Fresh page so the first run's cache/compositor state cannot flatter the second.
const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } })
const client2 = await page2.context().newCDPSession(page2)
await client2.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
await page2.goto(url, { waitUntil: 'networkidle' })
const withoutGlass = await run(page2, 'glass OFF', true)

console.log(`\nGLASS COST — ${url}`)
console.log(`  viewport 390x844 · CPU throttle ${THROTTLE}x · ${FRAMES} scrolled frames`)
console.log(
  `  blurred elements on this page: ${glassCount.n} (${glassCount.tags.join(', ') || '—'})`,
)
console.log('')
for (const r of [withGlass, withoutGlass]) {
  console.log(
    `  ${r.label.padEnd(10)} median ${String(r.median).padStart(6)}ms   p95 ${String(r.p95).padStart(6)}ms   worst ${String(r.worst).padStart(6)}ms`,
  )
}
const d = Math.round((withGlass.median - withoutGlass.median) * 100) / 100
const pct = withoutGlass.median > 0 ? Math.round((d / withoutGlass.median) * 1000) / 10 : 0
console.log('')
console.log(`  DELTA (median): ${d >= 0 ? '+' : ''}${d}ms  (${pct >= 0 ? '+' : ''}${pct}%)`)
console.log(`  MEASURED on headless Chromium under a ${THROTTLE}x CPU throttle.`)
console.log(`  INFERRED for a mid-range Android: directionally the same, numerically not this.`)
console.log(`  A throttle models the CPU; backdrop-filter taxes GPU fill-rate, which it does not.`)

await browser.close()
