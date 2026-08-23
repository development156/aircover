import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * THE RADAR CAMERA — a tool, not an assertion.
 *
 * ── THREE WIDTHS, NOT TWO ───────────────────────────────────────────────────
 * 390 and 1440 are the obvious pair and they are not enough here. This app has
 * exactly two breakpoints — `narrow` at 700 and `wide` at 1180 — so a shot at
 * 390 and a shot at 1440 both land in a terminal band and NEITHER exercises
 * 700–1179, where `narrow:grid-cols-2` is on and `wide:grid-cols-2` is not. This
 * repo has already recorded a defect class found only in that band (LEARNINGS,
 * "two widths is not responsive"), so 1024 is shot too.
 *
 * ── AND THE DETAIL VIEW, WHICH `design-audit.spec.ts` CANNOT REACH ──────────
 * `/radar/[id]` needs a competitor id to exist, so in an environment with no
 * collector it is a 404 and has no business in that camera's route table. It is
 * shot here instead, off the fixture store.
 *
 * NOT `@smoke`. Needs `RADAR_FIXTURES=1` on the server.
 */

const OUT = 'e2e/__artifacts__/radar'

const WIDTHS = [
  { w: 390, name: '390' },
  // The band between the two breakpoints. Neither 390 nor 1440 covers it.
  { w: 1024, name: '1024' },
  { w: 1440, name: '1440' },
] as const

const ROUTES = [
  { path: '/radar', slug: 'feed' },
  { path: '/radar/comp-sunrise', slug: 'detail' },
] as const

test.describe('Radar, photographed', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every width in ${theme}`, async ({ page, signedIn }) => {
      void signedIn
      test.setTimeout(240_000)

      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/home')
      const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
      if (await create.count()) {
        await create.click()
        await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
        await leaveOnboarding(page)
      }

      mkdirSync(OUT, { recursive: true })

      for (const route of ROUTES) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width: width.w, height: 900 })
          await page.goto(route.path)
          await expect(page.locator('#main')).toBeVisible({ timeout: 60_000 })
          // Settle the entrance keyframe so a shot is not caught mid-fade.
          await page.waitForTimeout(400)
          await page.screenshot({
            path: `${OUT}/${theme}-${width.name}-${route.slug}.png`,
            fullPage: true,
          })
        }
      }

      // ── THE PAGE MUST NOT SCROLL SIDEWAYS AT THE TIGHTEST WIDTH ─────────
      // A camera that only writes files can photograph a broken layout happily.
      // This is the one property worth asserting while the viewport is set.
      await page.setViewportSize({ width: 390, height: 900 })
      await page.goto('/radar')
      await expect(page.locator('#main')).toBeVisible({ timeout: 60_000 })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'the page scrolls horizontally at 390').toBeLessThanOrEqual(0)
    })
  }
})
