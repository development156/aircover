import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * A one-off verification that `20260819213000_billing_lifecycle.sql` is live.
 *
 * `plan-billing.spec.ts` deliberately accepts EITHER invoice section — the deployed
 * table or the honest "not switched on here" note — because both are true statements
 * and a suite that demanded one would fail on whichever side of the migration it ran.
 * That is right for a permanent guard and useless as evidence that the migration
 * landed, which is what this file is for: it names the deployed side specifically.
 *
 * Applied to production 2026-08-20. MEASURED before: `information_schema.tables` held
 * `subscriptions` and none of `invoices` / `billing_profiles` / `invoice_serials`.
 */
test.describe('the invoice store is deployed @smoke', () => {
  test('the plan screen shows the invoice table, not the not-deployed note', async ({
    page,
    signedIn,
  }) => {
    expect(signedIn).toBeTruthy()

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await leaveOnboarding(page)

    await page.goto('/settings/plan', { waitUntil: 'domcontentloaded' })
    const main = page.locator('#main')
    await expect(main.getByText('Your plan', { exact: true })).toBeVisible({ timeout: 30_000 })

    const body = (await main.innerText()).replace(/\s+/g, ' ')
    console.log('\n──── /settings/plan · invoices section ────')
    const at = body.indexOf('invoice')
    console.log('  ' + body.slice(Math.max(0, at - 260), at + 320))

    // The deployed-and-empty sentence. `invoice-table.tsx` renders this only when the
    // read came back `ok` — which it cannot do while the table is missing.
    expect(body, 'the deployed, empty invoice table must be what renders now').toContain(
      'No invoice yet',
    )

    // And the not-deployed note must be gone. This is the sentence the screen showed
    // every customer while the migration sat unapplied.
    expect(body, 'the not-deployed note must not still be on the screen').not.toContain(
      'not issuing tax invoices yet',
    )

    // A read that FAILED must not be mistaken for either.
    expect(body).not.toMatch(/could ?n[o']?t read/i)

    // Into `test-results/`, which is BOTH gitignored and prettier-ignored. A
    // screenshot written to the package root is an untracked artifact that the next
    // `git add -A` commits by accident.
    await page.screenshot({ path: 'test-results/plan-invoices-deployed.png', fullPage: true })
  })
})
