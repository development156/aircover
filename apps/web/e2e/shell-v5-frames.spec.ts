import { expect, test } from './fixtures/seeded-user'
import { framesTaken, shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * P4's proof obligation, as frames.
 *
 * `shell-widths.spec.ts` already ASSERTS the shell at these six widths — it
 * reads rendered text and accessible names, and it carries its own detector
 * self-test. This file does the other half: it photographs the same six widths
 * in BOTH themes so the assertions have something a person can look at.
 *
 * The two are deliberately separate. A screenshot proves what is there; an
 * assertion proves what a screenshot cannot show. A peer once shipped 56
 * hashed, distinct, fully-passing frames while the entire argument of one
 * screen was absent from all of them, which is what a capture spec is for and
 * what it is not for.
 *
 * WIDTHS. This app has exactly two breakpoints — 700 and 1180 — so it has
 * THREE bands: <700 (bottom bar, no rail), 700-1179 (collapsed icon rail),
 * >=1180 (labelled rail). 360 and 390 sit in the first, 768 and 1024 in the
 * SECOND, 1440 and 1920 in the third. Both members of each pair are shot
 * because a band's two ends are where a layout actually breaks.
 */

const JOURNEY = 'v5-shell'
const WIDTHS = [360, 390, 768, 1024, 1440, 1920] as const
const THEMES: Theme[] = ['light', 'dark']
/** /home exercises the whole shell; /design-system is the primitive rack. */
const ROUTES = ['/home', '/design-system'] as const

for (const theme of THEMES) {
  test(`v5 shell frames · ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(300_000)
    const before = framesTaken()

    await useTheme(page, theme)
    // A workspace has to exist or the shell renders its no-workspace form and
    // the frames photograph an empty rail rather than the rail.
    await page.goto('/home')
    const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
    try {
      await create.waitFor({ state: 'visible', timeout: 8_000 })
      await create.click()
      await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    } catch {
      /* already has one — the /home frame records which it was */
    }

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
      for (const route of ROUTES) {
        const ms = await timedGoto(page, route)
        await shot(page, {
          journey: JOURNEY,
          stop: `${route.slice(1)}__${width}`,
          width,
          theme,
          ms,
        })
      }
    }

    // A run whose navigations all missed writes zero PNGs and reports green.
    expect(framesTaken() - before).toBe(WIDTHS.length * ROUTES.length)
  })
}
