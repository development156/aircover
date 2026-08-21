import type { Page } from '@playwright/test'

import { test } from './fixtures/seeded-user'
import { shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * JOURNEY 3 — THE PERSON WITH NOTHING, across every route in the product.
 *
 * A workspace exists (so the shell renders), and nothing else does: no
 * connection, no post, no asset, no campaign, no lead. That is the state every
 * beta account is in for its first hour, which makes these the most-seen screens
 * in the product and the ones least likely to have been looked at.
 *
 * Every route is OPENED, not merely requested: the frame is a full-page
 * screenshot and the measurements are taken from the live document.
 *
 * One fresh Clerk account per (width, theme) — nothing is shared or reused.
 */

const JOURNEY = 'j3-nothing'

/**
 * Every route a signed-in person can reach by navigating, in the order the rail
 * lists them. Dynamic segments are excluded — there is no row to put in them
 * for a workspace with nothing, and a fabricated id would photograph a 404
 * while claiming to photograph the screen.
 */
export const ROUTES: string[] = [
  '/home',
  '/create',
  '/create/post',
  '/posts',
  '/posts/new',
  '/campaigns',
  '/planner',
  '/approvals',
  '/loop',
  '/playbooks',
  '/remix',
  '/studio',
  '/assets',
  '/sites',
  '/leads',
  '/inbox',
  '/inbox/comments',
  '/inbox/reviews',
  '/radar',
  '/analytics',
  '/report',
  '/brain',
  '/brain/identity',
  '/brain/voice',
  '/brain/audience',
  '/brain/competitors',
  '/brain/knowledge',
  '/brain/resolve',
  '/ads',
  '/ads/creative',
  '/ads/targeting',
  '/ads/budget',
  '/ads/performance',
  '/connections',
  '/wallet',
  '/settings',
  '/settings/profile',
  '/settings/plan',
  '/settings/integrations',
  '/design-system',
]

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 10_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    // Already has one, or the offer is missing. Either way the sweep continues
    // and the /home frame records which it was.
  }
}

async function sweep(page: Page, width: number, theme: Theme): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await useTheme(page, theme)
  await bootstrap(page)

  for (const route of ROUTES) {
    const ms = await timedGoto(page, route)
    const stop = route === '/' ? 'root' : route.slice(1).replace(/\//g, '-')
    await shot(page, { journey: JOURNEY, stop, width, theme, ms })
  }
}

const COMBOS: { width: number; theme: Theme }[] = [
  { width: 1440, theme: 'light' },
  { width: 1024, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 1024, theme: 'dark' },
  { width: 390, theme: 'dark' },
]

for (const { width, theme } of COMBOS) {
  test(`ux j3 nothing sweep ${width} ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(600_000)
    await sweep(page, width, theme)
  })
}
