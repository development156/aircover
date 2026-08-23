import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'
import { DETECTORS } from './helpers/ux-detect'
import { shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * THE AFTER PICTURE.
 *
 * A fix is a claim, and a claim in this lane is worth what its measurement is
 * worth. This re-opens the exact screens the fixes touched, at the widths and
 * themes the defects were found at, and records the same detectors that found
 * them — so the report can put a before and an after beside each other instead
 * of asserting an improvement.
 *
 * It is NOT tagged @smoke: it costs a Clerk account per combination and it is
 * evidence for one lane, not a standing gate.
 */

const JOURNEY = 'verify'

async function bootstrap(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 10_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)
  } catch {
    /* already bootstrapped */
  }
}

const COMBOS: { width: number; theme: Theme }[] = [
  { width: 1440, theme: 'light' },
  { width: 1024, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 390, theme: 'dark' },
]

/** The screens a fix touched, plus the two the fixes are most likely to have broken. */
const ROUTES = [
  '/home',
  '/posts',
  '/analytics',
  '/connections',
  '/onboarding',
  '/playbooks',
  '/planner',
  '/posts/new',
  '/this-route-does-not-exist',
  '/design-system',
]

for (const { width, theme } of COMBOS) {
  test(`ux verify ${width} ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(400_000)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await useTheme(page, theme)
    await bootstrap(page)

    for (const route of ROUTES) {
      const ms = await timedGoto(page, route)
      await shot(page, {
        journey: JOURNEY,
        stop: route === '/' ? 'root' : route.slice(1).replace(/\//g, '-'),
        width,
        theme,
        ms,
      })
    }

    // The 404's theme, which was null in a dark session before the guard.
    await timedGoto(page, '/this-route-does-not-exist')
    const notFoundTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    )
    console.log(`[verify] 404 data-theme at ${width}/${theme}: ${notFoundTheme}`)
    expect(notFoundTheme).toBe(theme)

    // The primary action's fill on /posts, which measured ZERO brand fills
    // while /home measured two — the same "Create post" anchor.
    await timedGoto(page, '/posts')
    const fills = (await page.evaluate(DETECTORS.brandFills)) as {
      resolved: string | null
      count: number
      items: { text: string; w: number; h: number }[]
    }
    console.log(`[verify] /posts brand fills at ${width}/${theme}: ${JSON.stringify(fills)}`)

    const cursors = (await page.evaluate(DETECTORS.arrowCursors)) as {
      considered: number
      count: number
    }
    console.log(
      `[verify] /posts arrow cursors at ${width}/${theme}: ${cursors.count} of ${cursors.considered}`,
    )
    // The whole point of the base-layer rule: no clickable thing wears an arrow.
    expect(cursors.count).toBe(0)
  })
}
