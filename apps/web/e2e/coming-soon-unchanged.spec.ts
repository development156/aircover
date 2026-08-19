import { expect, test } from './fixtures/seeded-user'

/**
 * The features whose tables exist, and whose screens must not have moved.
 *
 * ── THE RISK A NEW TABLE CREATES ─────────────────────────────────────────────
 * `templates`, `campaigns`, `campaign_posts`, `assets` and `asset_usages` were
 * applied to production on 2026-08-19 and nothing read them. That is a safe
 * state and a fragile one: a stray query against an empty table returns an empty
 * result, and an empty result rendered as a figure reads as "you have none"
 * rather than "this is not built" — the exact ambiguity two earlier runs were
 * spent removing from every other read in this app.
 *
 * So the property under test is that every number on these screens is still an
 * em dash. Not "the page loads" — a page that loaded and quietly started showing
 * `0 campaigns` would pass that and be the defect.
 *
 * ── `/campaigns` GRADUATED OUT OF THIS LIST ON 2026-08-19, DELIBERATELY ──────
 * It was the first of the three, and it is now BUILT: it reads `campaigns` and
 * `campaign_posts` for real, and every figure it shows is selected rather than
 * modelled — a count of membership rows, the union of the member posts'
 * channels, the dates the customer typed. A `0` on that screen is now a true
 * count of real rows, which is the one thing this guard was written to forbid,
 * so leaving it in would have made a passing test PIN THE OLD DEFECT: the
 * suite would have demanded an em dash where a real number belongs.
 *
 * That is not this guard weakening. Its premise — "nothing reads these tables" —
 * simply stopped being true for one of the three, and a guard is only as honest
 * as its premise. The replacement coverage is stronger and lives in
 * `campaigns.spec.ts`: it creates a campaign, groups a post under it, asserts
 * the per-channel grid, and asserts that no CELL stands in for a missing value
 * with a dash. Put a surface back here the moment it stops being built.
 *
 * `/approvals` and `/assets` keep every bit of their coverage: `templates`,
 * `assets` and `asset_usages` are still unread, so the risk above is still live
 * for both.
 *
 * Checked at both widths, because the wide layout and the narrow one are
 * different trees and a figure could appear in one and not the other.
 */

const SURFACES = ['/approvals', '/assets'] as const

/** Anything that would read as a measurement of the customer's business. */
const A_FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/

test.describe('the coming-soon surfaces did not change @smoke', () => {
  test.slow()

  test('every figure on approvals and assets is still an em dash', async ({ page, signedIn }) => {
    void signedIn

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })

      for (const path of SURFACES) {
        await page.goto(path)
        // The page rendered at all — not an error boundary, not a redirect.
        await expect(page.locator('#main')).toBeVisible({ timeout: 30_000 })

        // Every card is still marked as proposed rather than delivered.
        await expect(page.locator('#main .is-proposed').first()).toBeVisible()

        // ── THE ASSERTION THAT MATTERS ────────────────────────────────────────
        // No digit anywhere in the main region. An em dash is what these screens
        // are allowed to say, and a `0` is not a smaller version of that — it is a
        // claim about the reader's business that no query behind this page has
        // earned. Dates and headings are outside #main or carry no bare digits.
        const text = (await page.locator('#main').innerText()).replace(/\s+/g, ' ')
        expect(
          A_FIGURE.test(text),
          `${path} at ${width}px shows a figure: ${text.slice(0, 400)}`,
        ).toBe(false)

        await page.screenshot({
          path: `test-results/coming-soon${path.replace('/', '-')}-${width}.png`,
          fullPage: true,
        })
      }
    }
  })
})
