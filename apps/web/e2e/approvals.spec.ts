import { expect, test } from './fixtures/seeded-user'

/**
 * APPROVALS — the queue, and the two claims it must never make.
 *
 * ── THIS SPEC INHERITS A GUARANTEE FROM A FILE THAT IS NOW GONE ──────────────
 * `coming-soon-unchanged.spec.ts` asserted that no digit appeared anywhere in
 * `#main` on the surfaces whose tables existed and whose screens did not read
 * them. That premise — "nothing reads these tables" — has now stopped being true
 * for all three of them: `/campaigns` graduated on 2026-08-19, `/assets` on
 * 2026-08-20, and `/approvals` here. A guard is only as honest as its premise,
 * and its last surface now shows a count of real rows, which is the one thing
 * that file was written to forbid. Leaving it would have made a passing test
 * PIN THE OLD DEFECT: the suite would demand an em dash where a true number
 * belongs. Deleting it is a real decision, taken in the open, and the guarantee
 * it held moves here — stated as what it always meant.
 *
 * ── THE TWO CLAIMS ───────────────────────────────────────────────────────────
 * 1. An empty queue says so IN WORDS. Not "0 waiting". A zero is a figure, and
 *    a figure on a screen the reader is accountable to must be a count of
 *    something selected. It also reads as a measurement rather than an answer.
 * 2. An empty queue is not the same claim as a queue that could not be read. The
 *    first invites you to close the app; the second must not.
 *
 * ── AND WHY IT IS CHECKED AT BOTH WIDTHS ─────────────────────────────────────
 * The wide layout and the narrow one are different trees, and the phone reaches
 * this screen through a different door — the bottom bar's More sheet, which did
 * not exist until this pass and which is the ONLY way to /approvals below 700px.
 * A test that only ever visits by URL would not notice if that door closed.
 */

test.describe('approvals @smoke', () => {
  test.slow()

  test('an empty queue says so in words, at both widths, and is reachable on a phone', async ({
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
      await page.goto('/approvals')

      const main = page.locator('#main')
      await expect(main).toBeVisible({ timeout: 30_000 })

      // ── THE WORDS, NOT A NUMBER ──────────────────────────────────────────
      // Asserted by TEXT rather than by an element count, because a regression
      // that rendered the right boxes with the wrong words would pass every
      // structural check — the "S Sah" lesson in docs/26 §12.
      await expect(main.getByText('Nothing is waiting on you')).toBeVisible()

      // No digit anywhere in the region. With no posts there is nothing to
      // count, so any figure here would be invented. Once a post IS waiting the
      // header shows a real count, which is why this assertion is scoped to the
      // empty state's own screen rather than to the route forever.
      const text = (await main.innerText()).replace(/\s+/g, ' ')
      expect(
        /(?<![\w—–-])\d[\d,]*(?![\w—–-])/.test(text),
        `approvals at ${width}px shows a figure on an empty queue: ${text.slice(0, 300)}`,
      ).toBe(false)

      // ── AND IT IS NOT THE UNREADABLE CLAIM ───────────────────────────────
      // The two sentences are deliberately different, and the empty one must
      // never borrow the failure's language.
      expect(text).not.toMatch(/could not read/i)
    }
  })

  test('a phone can reach approvals without typing the URL', async ({ page, signedIn }) => {
    void signedIn

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/home')

    // The rail is hidden below 700px. Before this pass the bottom bar's four
    // tabs were the complete map on a phone, and /approvals was not one of them
    // — the section was unreachable by any tap. The More sheet is the door.
    await page.getByRole('button', { name: /^more$/i }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.getByRole('link', { name: /approvals/i }).click()

    await page.waitForURL(/\/approvals/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible()
  })
})
