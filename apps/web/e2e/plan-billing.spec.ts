import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * The plan & billing screen, READ AS TEXT.
 *
 * ── WHY THIS ASSERTS SENTENCES AND NOT LAYOUT ────────────────────────────────
 * Run 13's regression pass checked every width, offset and overflow flag on the shell, went
 * green at all six, and shipped a rail rendering the literal string `"S Sah"`. Every number
 * was right and the pixels were not. This screen carries money, so what it SAYS is the
 * thing that has to be true — the geometry is checked by the shell suites that already
 * exist.
 *
 * ── AND WHY IT BOOTSTRAPS A WORKSPACE ────────────────────────────────────────
 * docs/27 §2.1: a guard that signs in and goes straight to a page without bootstrapping
 * measures an account shape no real user is in. A plan screen with no workspace renders a
 * completely different component, so measuring that one would prove nothing about the
 * screen a customer sees.
 */
test.describe('plan & billing @smoke', () => {
  test('shows the plan, prices a change before charging, and invents no figure', async ({
    page,
    signedIn,
  }) => {
    expect(signedIn).toBeTruthy()

    // Bootstrap a workspace exactly as a real account does — this is what makes the plan,
    // the credit pill and the invoice table render at all.
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await leaveOnboarding(page)

    await page.goto('/settings/plan')
    await page.waitForLoadState('networkidle')

    const main = page.locator('#main')

    // ── The plan a fresh account is on ────────────────────────────────────────
    await expect(main.getByText('Your plan', { exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { name: 'Free', exact: true })).toBeVisible()

    const body = (await main.innerText()).replace(/\s+/g, ' ')

    // The free plan grants 100 credits and allows 2 channels — stated, not implied.
    expect(body).toContain('100 credits a month')
    expect(body).toContain('2 channels')

    /**
     * §4 OF THE DESIGN SYSTEM, THE THIRD ABSENCE STATE.
     *
     * Free allows ZERO sites. A quantity that does not exist gets no slot — it is not
     * rendered as "0 sites" and it is certainly not rendered as a dash. `100 of —` on
     * /home is the defect this rule was written for and it has exactly this shape.
     */
    expect(body).not.toMatch(/\b0 sites?\b/)

    /**
     * NOTHING ON A HEALTHY ACCOUNT MAY CLAIM A FAILURE.
     *
     * The fixture account has a live session, a healthy database and a workspace it just
     * created. No read has failed, so no sentence may say one has.
     */
    expect(body).not.toMatch(/could ?n[o']?t read|could not read|payment did not go through/i)

    // A dunning banner on a healthy account is a lie about the customer's payments.
    await expect(page.getByRole('alert').filter({ hasText: /payment/i })).toHaveCount(0)

    /**
     * ── The invoices section says one of TWO true things ─────────────────────
     *
     * Which one depends on whether `20260819213000_billing_lifecycle.sql` has been applied,
     * and the founder applies migrations by hand — so this run may legitimately meet either
     * state. Both are asserted rather than picking one, because pinning the applied state
     * would make this guard fail on a database that is simply a migration behind, and
     * pinning the unapplied state would stop it noticing when the table lands.
     *
     * What is NOT acceptable in either state is a claim that something failed. The section
     * above already asserts that against the whole page.
     */
    const invoicesTableIsThere = await main
      .getByRole('columnheader', { name: 'Number' })
      .isVisible()
    if (invoicesTableIsThere) {
      // A table that disappears when empty teaches nothing; this one keeps its columns.
      expect(body).toContain('No invoice yet')
    } else {
      expect(body).toContain('not issuing tax invoices yet')
      // And it must say the money side still works, or it reads as a broken payment.
      expect(body).toMatch(/Payments and credits work/)
    }

    // ── Costs shown BEFORE spend ──────────────────────────────────────────────
    // Picking a plan must price it without charging anything.
    await main.getByRole('button', { name: /^Starter/ }).click()
    await expect(main.getByText('If you make this change')).toBeVisible({ timeout: 30_000 })

    const preview = (await main.innerText()).replace(/\s+/g, ' ')

    // A real rupee figure, not a placeholder. Free is a zero baseline, so a first purchase
    // on a fresh workspace is the full remainder of the month.
    expect(preview).toMatch(/Starter for the rest of this month: ₹[\d,.]+\./)
    expect(preview).toMatch(/credits land as soon as the payment clears/)

    // A free workspace has paid nothing, so there is nothing to set off. The line must be
    // ABSENT rather than rendered as "₹0" — a slot with no quantity behind it.
    expect(preview).not.toMatch(/Less the ₹0\b/)

    /**
     * THE BUTTON NAMES THE OUTCOME.
     *
     * "Continue" would leave the customer to guess what pressing it costs. The label carries
     * the amount, which is the same figure the preview just showed and the same one the
     * server will charge — all three come from one `computeProration` call.
     */
    const commit = main.getByRole('button', { name: /switch to Starter/i })
    await expect(commit).toBeVisible()

    // No invented figure anywhere on the screen.
    expect(preview).not.toMatch(/undefined|NaN|Invalid Date|₹NaN/)
  })

  test('renders on a phone without a dash standing in for nothing', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/home')

    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await leaveOnboarding(page)

    await page.goto('/settings/plan')
    await page.waitForLoadState('networkidle')

    const body = (await page.locator('#main').innerText()).replace(/\s+/g, ' ')
    expect(body).toContain('Free')

    /**
     * THE EM DASH THAT STANDS IN FOR A QUANTITY.
     *
     * docs/27 §3.1 names this glyph the largest single contributor to the app looking
     * unfinished, and docs/26 §4 gives it a replacement vocabulary. But this codebase uses
     * em dashes in PROSE deliberately — CLAUDE.md carries a standing ruling that they stay,
     * and there are 355 of them. Counting every `—` on the page therefore measures the house
     * voice, not the defect: the first draft of this assertion failed on the sentence
     * "a tax invoice cannot be edited — a correction is a separate credit note".
     *
     * So this looks for a dash that IS a value: a leaf element whose entire text is one.
     * That is exactly the `100 of —` shape and nothing else.
     */
    const dashValues = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#main *'))
        .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim() === '—')
        .map((el) => `${el.tagName.toLowerCase()}: ${el.parentElement?.textContent?.trim() ?? ''}`),
    )
    expect(dashValues, 'an em dash is standing in for a quantity').toEqual([])

    // The page must not scroll sideways. Measured on the DOCUMENT, in the state a real user
    // is in — a workspace present, which is what docs/27 §2.1 found the old guard missed.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the plan screen scrolls sideways at 390px').toBeLessThanOrEqual(0)
  })
})
