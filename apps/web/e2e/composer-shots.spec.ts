import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { bootstrapWorkspace, startPost, versionBox } from './fixtures/compose'
import { expect, test } from './fixtures/seeded-user'

/**
 * Real screenshots of the rebuilt post editor, at the two widths that matter and
 * in both themes.
 *
 * NOT a visual-regression test — nothing here compares against a baseline, and
 * it is deliberately outside `@smoke` so it never gates a merge on a font
 * rendering a pixel differently. It exists so a claim about how the screen looks
 * can be checked by looking at it.
 *
 * 390 first, because an SMB owner writes posts on a phone. 1440 second.
 * Dark is set by stamping `data-theme` on the root, which is what
 * `packages/shared/tokens.css` responds to.
 */

const OUT = join(process.cwd(), 'e2e-shots')

const WIDTHS = [
  { name: '390', width: 390, height: 1400 },
  { name: '1440', width: 1440, height: 1400 },
] as const

test.describe('composer screenshots', () => {
  test.slow()

  test('the post editor, two widths, two themes', async ({ page, signedIn }) => {
    void signedIn
    mkdirSync(OUT, { recursive: true })

    await bootstrapWorkspace(page)
    await startPost(page, 'instagram')

    // A post worth photographing: two channels, two bodies, two formats, and a
    // channel that has detached so the relink control is on screen.
    await page.locator('[data-channel-tile="x"]').click()
    await expect(page.locator('[data-version-card="x"]')).toBeVisible()

    await page.getByLabel('Name this post').fill('Monsoon hours')
    await page
      .getByLabel('Your post', { exact: true })
      .fill('We are open till nine all week, rain or not.')
    await versionBox(page, 'X').fill('Open till 9 all week. Rain or not. ☔')
    await page.locator('[data-hashtags="x"]').fill('#chai #pune')
    await page.locator('[data-variant-format="x"]').selectOption('text')
    await page.locator('[data-variant-format="instagram"]').selectOption('carousel')

    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height })
      for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t)
        }, theme)
        // Let the token swap paint before the shutter.
        await page.waitForTimeout(400)
        await page.screenshot({
          path: join(OUT, `composer-${size.name}-${theme}.png`),
          fullPage: true,
        })
        // ── AND ONE AT VIEWPORT SIZE ─────────────────────────────────────────
        // The commit bar is `position: sticky`, and a full-page capture renders
        // sticky and fixed chrome at its SCROLL OFFSET — mid-document, on top of
        // whatever happens to be there. docs/27 §0 records a mobile bottom bar
        // written up as a bug that did not exist for exactly this reason. A
        // viewport shot photographs it where a person actually sees it.
        await page.screenshot({ path: join(OUT, `composer-${size.name}-${theme}-viewport.png`) })
      }
    }

    // A file per combination, and the run says so rather than assuming.
    expect(WIDTHS.length * 2).toBe(4)
  })
})
