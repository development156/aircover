import { expect, test } from './fixtures/seeded-user'

/**
 * The features whose tables exist and whose screens must not have moved.
 *
 * ── THE RISK A NEW TABLE CREATES ─────────────────────────────────────────────
 * `templates`, `campaigns` and `campaign_posts` were applied to production on
 * 2026-08-19 and nothing reads them. That is a safe state and a fragile one: a
 * stray query against an empty table returns an empty result, and an empty
 * result rendered as a figure reads as "you have none" rather than "this is not
 * built" — the exact ambiguity two earlier runs were spent removing from every
 * other read in this app.
 *
 * So the property under test is that every number on these screens is still an
 * em dash. Not "the page loads" — a page that loaded and quietly started showing
 * `0 campaigns` would pass that and be the defect.
 *
 * ── WHY `/assets` IS NO LONGER HERE (2026-08-20) ─────────────────────────────
 * Because it is built. `assets` and `asset_usages` are now read AND written: the
 * library uploads real files, attaches them to posts, and refuses to delete one a
 * scheduled post depends on. Every figure it shows — the file count, a byte size —
 * comes from a row it fetched, so "still an em dash" is no longer the honest
 * property; it is a description of a screen that no longer exists.
 *
 * The GUARANTEE this test held for `/assets` did not go away with it. It moved,
 * stated as what it always meant: an empty library must say "Your library is
 * empty" and must never render a count of the customer's files. `assets.spec.ts`
 * asserts exactly that, on an account with no assets, at both widths.
 *
 * Removing a surface from this list is a real decision and must never be done to
 * make a red test green. It is correct here only because the premise the list is
 * built on — "nothing reads them" — stopped being true of this one.
 *
 * Checked at both widths, because the wide layout and the narrow one are
 * different trees and a figure could appear in one and not the other.
 */

const SURFACES = ['/campaigns', '/approvals'] as const

/** Anything that would read as a measurement of the customer's business. */
const A_FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/

test.describe('the coming-soon surfaces did not change @smoke', () => {
  test.slow()

  test('every figure on campaigns and approvals is still an em dash', async ({
    page,
    signedIn,
  }) => {
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
