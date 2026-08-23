import { expect, test } from './fixtures/seeded-user'

import { useTheme } from './helpers/ux-shot'

/**
 * THE ACCENT IS A BUDGET, AND THIS IS THE RATCHET.
 *
 * docs/37 §2.3 measures the accent per screen and states the rule: it is spent on
 * the one thing the screen is for, and "a screen that configures something spends
 * approximately zero". It then says outright that §2.3 is "the brief for the lanes
 * that follow it" — a brief, not a guard. So the finding could be fixed once and
 * quietly undone by the next person who wrote `<Button>` without a variant, which
 * is exactly how it arrived: `Button` defaults to `primary`, so a solid brand fill
 * is what you get by NOT deciding.
 *
 * ── WHAT IT MEASURES ─────────────────────────────────────────────────────────
 * The visible area of every element inside `#main` that paints a saturated colour
 * (HSV s>0.30, v>0.25) as a background, a border, or as text it owns directly.
 * Backgrounds and borders are charged their whole box; text is charged a tenth of
 * its box, which is roughly what a word's ink covers.
 *
 * Only `#main`. The rail and the topbar are constant across every route — the
 * topbar's credits pill alone is 3,852px² on all of them — so a whole-frame figure
 * is mostly a measurement of the shell, and this lane does not own the shell.
 *
 * ── THE CEILINGS ARE MEASURED, NOT CHOSEN ────────────────────────────────────
 * Each is the value observed on 2026-08-23 at 1440x900 light, plus headroom. They
 * are a RATCHET: tighten them when a screen gets quieter, and never raise one to
 * admit a change. If a screen genuinely needs more accent, that is a decision to
 * argue in the comment beside its ceiling, with the reason.
 *
 * ── WHAT IT CANNOT SEE, AND THESE MATTER ─────────────────────────────────────
 * 1. **Whether the orange is on the RIGHT thing.** /inbox spends 5,594px² on
 *    "Connect a channel" and that is correct — the reader is blocked and the
 *    blocker leads (§16 rule 1). /settings spent 6,308px² on "Download my data"
 *    and that was wrong. This guard cannot tell those apart; it would have passed
 *    a /settings that moved its brand fill onto a different useless button of the
 *    same size. §16 is the check for that and §16 is not a number.
 * 2. **SVG fills, gradients, shadows and background images.** It reads three
 *    computed colour properties. Platform marks are SVG and are therefore
 *    invisible to it — convenient, since §2.1 exempts them, but luck rather than
 *    design.
 * 3. **Anything below the fold**, and anything in a state this run does not
 *    reach. Every route here is measured with ONE workspace state: freshly
 *    created and empty.
 * 4. **Dark.** Light only, because §2.3's figures are light and a dark ceiling
 *    would need its own measurement rather than a reused number.
 */

/** `[route, ceiling in px² inside #main, why]` */
const BUDGETS: ReadonlyArray<readonly [string, number, string]> = [
  [
    '/settings',
    2_000,
    // MEASURED 666 after the repair, from 6,974 before it. A configuration screen
    // spends its accent on exactly one thing: the "you are here" mark in the
    // section nav. There is no primary action on this screen and there should
    // not be one.
    'configuration — §2.3 says approximately zero',
  ],
  [
    '/settings/profile',
    2_000,
    'read-only, owned by the sign-in provider — nothing here is even editable',
  ],
  ['/settings/integrations', 2_000, 'a summary that hands over to /connections'],
  [
    '/wallet',
    6_000,
    // MEASURED 4,598 — "Start checkout", the one action this screen exists to
    // start. Was 77,462 when a pre-selected top-up option carried a solid brand
    // border round a 1102x62 row.
    'one primary: Start checkout',
  ],
  [
    '/inbox',
    8_000,
    // MEASURED 5,594 — "Connect a channel". Deliberately the loudest thing here:
    // the reader is blocked and this is the blocker (§16 rule 1).
    'one primary, and it is a blocker',
  ],
]

test('@smoke every screen stays inside its accent budget', async ({ page, signedIn }) => {
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

  const over: string[] = []
  const readings: string[] = []

  for (const [route, ceiling, why] of BUDGETS) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load').catch(() => {})
    await page.waitForTimeout(300)
    // The pointer parks on the last click and a hover changes a button's fill.
    await page.mouse.move(-40, -40)

    const spent = await page.evaluate(() => {
      const main = document.querySelector('#main')
      // A missing #main would score ZERO and pass every ceiling — a guard that
      // reports success for having measured nothing. Refuse instead.
      if (!main) return null
      const sat = (css: string): boolean => {
        const m = /rgba?\(([^)]+)\)/.exec(css)
        if (!m) return false
        const p = m[1]!.split(',').map((n) => parseFloat(n))
        const a = p.length > 3 ? p[3]! : 1
        if (a < 0.08) return false
        const [r, g, b] = [p[0]!, p[1]!, p[2]!]
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        return (mx === 0 ? 0 : (mx - mn) / mx) > 0.3 && mx / 255 > 0.25
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      let total = 0
      for (const el of main.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        if (parseFloat(cs.opacity) < 0.08) continue
        const r = el.getBoundingClientRect()
        const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
        const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
        if (w <= 0 || h <= 0) continue
        const box =
          sat(cs.backgroundColor) || (sat(cs.borderTopColor) && parseFloat(cs.borderTopWidth) > 0)
        const ownsText =
          sat(cs.color) &&
          [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
        if (box) total += w * h
        else if (ownsText) total += w * h * 0.1
      }
      return Math.round(total)
    })

    expect(spent, `${route}: #main is not on the page, so nothing was measured`).not.toBeNull()
    readings.push(`${route.padEnd(26)} ${String(spent).padStart(7)} / ${ceiling}  (${why})`)
    if ((spent ?? 0) > ceiling)
      over.push(`${route}: ${spent}px² over a ceiling of ${ceiling}px² — ${why}`)
  }

  console.log('\n──── ACCENT SPENT INSIDE #main · 1440x900 light (px²) ────')
  readings.forEach((r) => console.log('  ' + r))

  expect(
    over,
    'A ceiling is never raised to admit a change. Move the brand fill off whatever gained it.',
  ).toEqual([])
})
