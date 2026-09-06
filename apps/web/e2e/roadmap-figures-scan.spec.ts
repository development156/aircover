import { expect, test } from './fixtures/seeded-user'

import { useTheme } from './helpers/ux-shot'

/**
 * WHAT NUMBER, IF ANY, REACHED EACH ROADMAP SCREEN.
 *
 * `roadmap-honesty.spec.ts` owns the PROPERTY: it holds the five `/ads/*` routes
 * to an EMPTY allowlist, so any digit on one of them fails there. This
 * file is the wider EVIDENCE sweep the `wt-page-rest` brief asks for: it visits
 * every screen with an unbuilt section and prints every standalone run of digits
 * rendered inside `#main`, so "no invented figures" is a reading rather than an
 * assurance.
 *
 * The five `/ads/*` routes are the reason it exists. They are drawings — no ad
 * account, no bid, no impression, no rupee of spend — and every competing tool
 * puts an estimated reach under its audience builder and a CPM in its budget
 * step. `roadmap-honesty` DOES list all five, each allowing nothing; this file
 * prints what actually rendered, so a pass there is a reading rather than a
 * silence.
 *
 * ── TWO SENTENCES HERE WERE THE INVERSE OF THE TRUTH ────────────────────────
 * This header used to say `roadmap-honesty` covered "/radar" and did NOT list
 * the `/ads` routes. Both halves were backwards: `/radar` was REMOVED from that
 * list when it stopped being a drawing (roadmap-honesty.spec.ts:191), and the
 * five `/ads` routes are exactly what the list holds (:217-221). A comment that
 * misdescribes which guard owns which property is how a route ends up covered
 * by neither.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * 1. A fabricated figure spelled in WORDS ("a few thousand people").
 * 2. A figure below the fold — it reads `innerText`, which includes text
 *    scrolled out of view but NOT text inside a collapsed `<details>`.
 * 3. Whether a real number is the RIGHT number. It only asks whether one is
 *    present, and every digit it does find is listed for a person to read.
 * 4. The shell. It scopes to `#main`, so the topbar's credit count is out.
 */

const ROADMAP = [
  '/ads',
  '/ads/creative',
  '/ads/targeting',
  '/ads/budget',
  '/ads/performance',
  '/radar',
] as const

/** A standalone run of digits — not one welded into a word or a dash-run. */
const FIGURE = /(?<![\w—–-])\d[\d,.]*(?![\w—–-])/g

test('@smoke no roadmap screen renders a figure about the reader’s business', async ({
  page,
  signedIn,
}) => {
  void signedIn
  test.setTimeout(300_000)
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

  /**
   * Every figure these screens ARE allowed to render, and why each one is a fact
   * about Sahoda rather than a claim about the reader.
   */
  const ALLOWED = new Map<string, string>([
    ['1', 'an ordinal — a numbered step'],
    ['2', 'an ordinal'],
    ['3', 'an ordinal'],
    ['4', 'an ordinal'],
    // Likewise verified: /radar's only figure is its per-scan price, not a step
    // number. The five numbered watch-list slots this screen used to draw were
    // removed precisely because they asserted an entitlement nobody had defined.
    ['5', 'an ordinal, and creditCost("radar_scan") = 5 — a price from pricing.config.json'],
    ['6', 'an ordinal'],
    ['7', 'an ordinal'],
    // VERIFIED against pricing.config.json, not guessed: this draft first said
    // "the 8 MB upload cap", which is a different real number that happens to
    // share the digit. (`/studio` quoted `carousel` at 8 credits until it was
    // built on 2026-08-28; it quotes no figure now and has left this scan.)
    ['8', 'creditCost("carousel") = 8 — a price from pricing.config.json'],
    ['9', 'an ordinal'],
    ['16', 'an aspect ratio component (16:9)'],
    ['1.8', 'an aspect ratio component'],
    ['1.5', 'an aspect ratio component'],
    ['0.5', 'an aspect ratio component'],
    ['100', 'the free credit grant — a price from pricing.config.json'],
    ['550', 'a character limit — a platform property, not a measurement'],
    ['120', 'a character limit'],
    ['2200', 'a character limit'],
  ])

  const found: string[] = []
  for (const route of ROADMAP) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load').catch(() => {})
    await page.waitForTimeout(300)
    const main = page.locator('#main')
    // A missing #main reads as zero figures and passes. Refuse instead.
    await expect(main, `${route}: #main is not on the page`).toBeVisible()
    const text = await main.innerText()
    const digits = [...text.matchAll(FIGURE)].map((m) => m[0])
    const unexplained = [...new Set(digits)].filter((d) => !ALLOWED.has(d))
    console.log(
      `  ${route.padEnd(20)} figures=${JSON.stringify([...new Set(digits)])}` +
        (unexplained.length > 0 ? `  UNEXPLAINED=${JSON.stringify(unexplained)}` : ''),
    )
    for (const d of unexplained) found.push(`${route}: ${d}`)
  }

  expect(
    found,
    'A figure reached a roadmap screen. It is either a real price/ordinal that belongs in ALLOWED with its reason, or it is invented and must be deleted — never dashed, never zeroed.',
  ).toEqual([])
})
