import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { test } from './fixtures/seeded-user'
import { DETECTORS } from './helpers/ux-detect'
import { UX_OUT, useTheme, type Theme } from './helpers/ux-shot'
import { ROUTES } from './ux-j3-sweep.spec'

/**
 * THE MEASUREMENT PASS, with no screenshots.
 *
 * Every route, three widths, both themes, measured by the CALIBRATED detectors
 * and nothing else. It exists separately from the capture for two reasons.
 *
 * First, honesty about provenance. The frames from the first capture run were
 * measured by an EARLIER version of the naming detector which only knew
 * `label[for]`, and which therefore reported 204 correctly-named inputs — the
 * `<label><input class="sr-only">Consumer</label>` in `pick-chips.tsx` — as
 * unnamed. That is the same class of mistake as a mis-calibrated contrast
 * detector, arriving from the other direction, and the numbers it produced are
 * superseded by this file rather than quietly reused.
 *
 * Second, cost. PNG encoding is most of a capture's time, and a measurement does
 * not need one. This walks forty routes in six configurations for the price of a
 * single screenshot pass.
 *
 * The frames remain the authority on what a screen LOOKS like. This is only the
 * authority on what it MEASURES.
 */

const AUDIT = join(UX_OUT, 'audit.jsonl')

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 10_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    /* already bootstrapped */
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

test.beforeAll(() => {
  mkdirSync(UX_OUT, { recursive: true })
  if (!process.env.UX_AUDIT_APPEND) writeFileSync(AUDIT, '')
})

for (const { width, theme } of COMBOS) {
  test(`ux audit ${width} ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(600_000)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await useTheme(page, theme)
    await bootstrap(page)

    for (const route of ROUTES) {
      const t0 = Date.now()
      await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(350)
      const ms = Date.now() - t0
      const d: Record<string, unknown> = {}
      for (const [name, src] of Object.entries(DETECTORS)) {
        d[name] = await page.evaluate(src).catch((e: unknown) => ({
          error: e instanceof Error ? e.message : String(e),
        }))
      }
      const domTheme = await page
        .evaluate(() => document.documentElement.getAttribute('data-theme'))
        .catch(() => null)
      appendFileSync(
        AUDIT,
        JSON.stringify({
          route,
          width,
          theme,
          domTheme,
          ms,
          landed: new URL(page.url()).pathname,
          d,
        }) + '\n',
      )
    }
  })
}
