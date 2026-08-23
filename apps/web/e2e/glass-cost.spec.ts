import { expect, test } from './fixtures/seeded-user'

/**
 * THE COST OF EVERY BLUR THIS SYSTEM SHIPS, MEASURED ON THE REAL SHELL.
 *
 * docs/37 §7 justifies "glass on chrome, opaque on data" partly on cost, and a
 * cost claim that is not measured is an opinion.
 *
 * `scripts/design/glass-cost.mjs` measures the same thing on the PUBLIC
 * /design-system route, which carries exactly one blurred element. This spec is
 * the one that matters: it signs in, so it gets the real shell — the glass
 * topbar and, at 390px, the glass mobile bottom bar as well.
 *
 * ── WHAT IS MEASURED, AND WHAT IS INFERRED ───────────────────────────────────
 * MEASURED: frame time on this machine's headless Chromium under a CPU throttle,
 * driving a real scroll, with the shipped glass enabled and then neutralised.
 * Scrolling is the load case that matters — `backdrop-filter` costs nothing until
 * the content behind it changes, and a sticky topbar over a scrolling document is
 * exactly that.
 *
 * INFERRED: what this means on a mid-range Android. It cannot be measured from
 * here. A CPU throttle models the CPU; `backdrop-filter` taxes GPU fill-rate,
 * which it does not model. Read the DELTA and its direction, not the absolute.
 *
 * ── WHY IT ASSERTS A CEILING RATHER THAN JUST PRINTING ───────────────────────
 * A number nobody reads is a number nobody notices doubling. The ceiling is
 * deliberately loose — this is a budget, not a benchmark — but it means a future
 * lane that puts glass on a list row finds out from the gate rather than from a
 * customer on a cheap phone.
 *
 * NOT tagged @smoke: it drives 240 animation frames under a 6x throttle and a
 * gate that slow is a gate people learn to skip.
 */

const THROTTLE = 6
const FRAMES = 120
/** Loose on purpose. The p95 tail is where a blur actually shows up. */
const MAX_MEDIAN_DELTA_MS = 8

async function frameTimes(page: import('@playwright/test').Page, disableGlass: boolean) {
  if (disableGlass) {
    await page.addStyleTag({
      content: `.glass{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}`,
    })
  }
  await page.waitForTimeout(600)
  const times = await page.evaluate(async (frames: number) => {
    const out: number[] = []
    let last = performance.now()
    let y = 0
    return await new Promise<number[]>((resolve) => {
      function step() {
        const now = performance.now()
        out.push(now - last)
        last = now
        y = (y + 8) % Math.max(1, document.body.scrollHeight - window.innerHeight)
        window.scrollTo(0, y)
        if (out.length >= frames) resolve(out)
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }, FRAMES)
  const s = times.slice(10).sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0
  return { median: q(0.5), p95: q(0.95), worst: s[s.length - 1] ?? 0 }
}

for (const width of [390, 1440] as const) {
  test(`glass cost on the real shell · ${width}px`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(180_000)

    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const blurred = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .filter((e) => {
          const f = getComputedStyle(e).backdropFilter
          return Boolean(f) && f !== 'none'
        })
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`),
    )

    // A cost measurement that cannot tell "no cost" from "nothing measured" is
    // the same fault as a suite that reports green having run nothing. The first
    // run of the standalone script reported +0ms against a page with zero
    // blurred elements, and it was true and worthless.
    expect(
      blurred.length,
      `no blurred element on /home at ${width}px — this would measure nothing`,
    ).toBeGreaterThan(0)

    const on = await frameTimes(page, false)
    const off = await frameTimes(page, true)
    const delta = on.median - off.median

    console.log(`\n──── GLASS COST · /home · ${width}px · ${THROTTLE}x CPU throttle ────`)
    console.log(`  blurred: ${blurred.length} — ${blurred.join(', ')}`)
    console.log(
      `  glass ON   median ${on.median.toFixed(2)}ms  p95 ${on.p95.toFixed(2)}ms  worst ${on.worst.toFixed(2)}ms`,
    )
    console.log(
      `  glass OFF  median ${off.median.toFixed(2)}ms  p95 ${off.p95.toFixed(2)}ms  worst ${off.worst.toFixed(2)}ms`,
    )
    console.log(
      `  DELTA median ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}ms · p95 ${on.p95 - off.p95 >= 0 ? '+' : ''}${(on.p95 - off.p95).toFixed(2)}ms`,
    )

    expect(
      delta,
      `the shipped glass costs ${delta.toFixed(2)}ms of median frame time at ${width}px, over the ` +
        `${MAX_MEDIAN_DELTA_MS}ms budget. Glass belongs on chrome only (docs/37 §7) — if this ` +
        `went red, check whether a blur landed on a card, a row or a table.`,
    ).toBeLessThan(MAX_MEDIAN_DELTA_MS)
  })
}
