import { test } from './fixtures/seeded-user'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { useTheme } from './helpers/ux-shot'

/**
 * WHERE DOES THE ORANGE GO?
 *
 * `scripts/design/accent-spend.mjs` prints ONE number per screen — the §2.3
 * budget. A number is not a repair instruction: it says a screen spends 0.588%
 * and nothing about which elements spent it, so the obvious next move is to
 * guess, change something, and re-measure. This probe removes the guess.
 *
 * It walks the live DOM, finds every element painting a saturated colour
 * (background, border or text), and attributes the visible area to it. The
 * result is a ranked list — "the topbar credit pill is 22% of this screen's
 * accent" — which is the form a decision can be made from.
 *
 * ── WHAT IT CANNOT SEE, AND THESE MATTER ─────────────────────────────────────
 * 1. It attributes an element's WHOLE box, so a 200x38 button whose fill is
 *    orange and a 200x38 label whose TEXT is orange score the same area. Text
 *    covers roughly a tenth of its box. The raster measurement in
 *    accent-spend.mjs is the authority on how much orange there IS; this probe
 *    is the authority on WHERE it is. They are different questions and the two
 *    numbers will not match.
 * 2. It cannot see a gradient, a background image, an SVG fill, or a shadow —
 *    only the three computed colour properties it reads. Platform marks are SVG
 *    and are therefore invisible here, which is convenient (§2.1 exempts them)
 *    but is luck, not design.
 * 3. It cannot see anything below the fold; it clips to the viewport, because
 *    that is what §2.3 measures.
 * 4. It says nothing about whether the orange is on the RIGHT thing. That is
 *    §16, and §16 is not a number.
 */

const PROBE = `(() => {
  const sat = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c)
    if (!m) return null
    const p = m[1].split(',').map((n) => parseFloat(n))
    const [r, g, b] = p
    const a = p.length > 3 ? p[3] : 1
    if (a < 0.08) return null
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const s = mx === 0 ? 0 : (mx - mn) / mx
    const v = mx / 255
    return s > 0.3 && v > 0.25 ? { s, v, a, css: c } : null
  }
  const vw = window.innerWidth, vh = window.innerHeight
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.08) continue
    const r = el.getBoundingClientRect()
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
    if (w <= 0 || h <= 0) continue
    const hits = []
    const bg = sat(cs.backgroundColor); if (bg) hits.push('bg')
    const bc = sat(cs.borderTopColor); if (bc && parseFloat(cs.borderTopWidth) > 0) hits.push('border')
    const fg = sat(cs.color)
    // Text only counts where this element owns a text node of its own; otherwise
    // every ancestor of an orange word would be charged for the whole subtree.
    const ownsText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
    if (fg && ownsText) hits.push('text')
    if (hits.length === 0) continue
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 110),
      text: (el.textContent || '').trim().slice(0, 48),
      hits,
      // Text is charged at a tenth of its box: a word's ink is roughly that.
      area: Math.round(hits.includes('bg') || hits.includes('border') ? w * h : w * h * 0.1),
      box: [Math.round(r.left), Math.round(r.top), Math.round(w), Math.round(h)],
      inShell: !!el.closest('[data-shell], header, nav, aside') && !el.closest('#main'),
    })
  }
  return { vw, vh, frame: vw * vh, els: out }
})()`

const ROUTES = (process.env.ACCENT_ROUTES ?? '/settings').split(',')
const OUT = process.env.ACCENT_OUT ?? '.accent'

test('accent attribution', async ({ page, signedIn }) => {
  void signedIn
  test.setTimeout(600_000)
  await useTheme(page, 'light')
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 8_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    /* already has one */
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  mkdirSync(OUT, { recursive: true })
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load').catch(() => {})
    await page.waitForTimeout(400)
    await page.mouse.move(-40, -40)
    const result = await page.evaluate(PROBE)
    const slug = route.replace(/\//g, '_') || '_root'
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(result, null, 1))
    /**
     * The RASTER of the same instant, viewport-only.
     *
     * The two measurements answer different questions and both are needed: the
     * JSON says WHERE the accent is, `scripts/design/accent-spend.mjs` run over
     * this PNG says HOW MUCH of the frame it covers — which is the figure
     * docs/37 §2.3 quotes. `fullPage: false` is not a detail: §2.3's own
     * captures are 1440x900, and a fullPage frame changes the denominator with
     * the page's content height, so a long screen would score low for being
     * long.
     */
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: false })
  }
})
