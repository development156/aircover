import { expect, test } from './fixtures/seeded-user'

/**
 * The analytics page, against a database with no history table.
 *
 * ── THE RISK THIS COVERS ─────────────────────────────────────────────────────
 * `readMetricSeries` runs on every load of this page and reads
 * `post_metric_snapshots`, which does not exist until the founder applies
 * migration 20260819000100. So the ordinary production path for this page is now
 * a read that is REFUSED, every time.
 *
 * If that refusal were ever allowed to escape — an uncaught throw, a rejected
 * promise in the page's own await — the whole analytics screen would 500 for
 * every customer, on a feature nobody has switched on yet. That is the failure
 * mode worth a real browser: the unit tests all hand `readMetricSeries` its
 * answer, so none of them ever reaches the refusal itself.
 *
 * It also pins the promise the migration batch makes to the founder in
 * docs/24_Migration_Batch.md: applying nothing changes nothing.
 */

test.describe('analytics before the history table exists @smoke', () => {
  // MEASURED at 52.3s against a 60s default, on a cold dev server that compiles
  // sign-in, home, onboarding and analytics before the journey starts. This spec
  // sorts first in the suite, so it inherits that cost on every gate run. Widening
  // the budget for a known fixed cost, not to accommodate a slow assertion — every
  // assertion below is unchanged and none waits on anything but a render.
  test.slow()

  test('renders, and says Sahoda keeps no history yet', async ({ page, signedIn }) => {
    void signedIn

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    await page.goto('/analytics')

    // The page is here at all — not an error boundary, not a blank shell.
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible({
      timeout: 30_000,
    })

    // And the card says what it has always said. NOT "could not read the
    // history": the read was refused because the table is absent, and reporting
    // that as a fault would put a red herring in front of the founder on a
    // migration they have deliberately not applied yet.
    await expect(page.getByText(/does not keep a history yet/i)).toBeVisible()
    await expect(page.getByText(/could not read the history/i)).toHaveCount(0)
  })
})
