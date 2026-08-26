import { expect, test } from './fixtures/seeded-user'

/**
 * WHY E2E AND NOT A COMPONENT TEST
 * The declaration lives in globals.css — a Tailwind build artefact Vitest never
 * loads — and the thing under test is what the UA RESOLVES, which only a real
 * Chromium can answer.
 *
 * WHY IT IS NOT IN composer.spec.ts
 * That file's header defines it as the one-body-per-channel acceptance test.
 * A theme assertion there is off-topic. composer-shots.spec.ts is a camera and
 * asserts nothing.
 *
 * WHAT IT DOES NOT COVER
 * It pins the colour scheme, not legibility. It says nothing about the picker
 * glyph — `getComputedStyle(el, '::-webkit-calendar-picker-indicator')` ignores
 * author declarations and reports the element's own values, so an assertion
 * there is a guaranteed false green — and nothing about the full-ink
 * `dd/mm/yyyy, --:--` mask, which no CSS can reach (`:placeholder-shown` does
 * not match a date input). J1-N is only partly closed.
 */
const FIELD = '#post-schedule'

test.describe('date fields follow the app theme', () => {
  /**
   * The same 300s composer.spec.ts uses, and for the same measured reason: this
   * journey compiles `/home`, `/onboarding` and `/posts/new`, and the fixture's
   * Clerk sign-in counts against the test timeout too. The config's 60s default
   * is a budget the bootstrap alone can spend on a cold dev server.
   */
  test.setTimeout(300_000)

  test('the schedule field follows the app theme, not the OS', async ({ page, signedIn }) => {
    void signedIn
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 90_000 })
    await page.goto('/posts/new')
    await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 90_000 })

    /**
     * ── TWO CLICKS TO REACH THE FIELD, AND THE FIRST ONE IS NEW ───────────────
     * `FinishPanel` now asks which route the post takes before offering either
     * set of controls, so the schedule side has to be opened.
     *
     * The SECOND click is not new and this spec never made it. `ScheduleField`
     * has rendered the native `datetime-local` only behind "Pick an exact time"
     * since the named-times redesign — the whole point of that change was that
     * the raw `dd/mm/yyyy, --:--` mask stopped being the interface. So
     * `#post-schedule` was not in the DOM when this file asserted it was
     * visible, and the assertion could not have passed.
     *
     * It went unnoticed because this spec carries no `@smoke` tag, and
     * `turbo test` runs Vitest only: nothing in the gate has ever executed it.
     * That is the same gap CLAUDE.md records for `golden-path`, found again.
     */
    await page.getByRole('button', { name: /^Schedule it/ }).click()
    await page.locator('[data-schedule-choice="exact"]').click()
    await expect(page.locator(FIELD)).toBeVisible()

    // THE DISCRIMINATING CONDITION. playwright.config.ts declares no
    // `use.colorScheme`, so Chromium is emulating prefers-color-scheme: light.
    // Stamping data-theme='dark' puts the APP and the OS in disagreement — the
    // only state that tells a real fix from `color-scheme: light dark`, which
    // silently resolves back to light here.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

    // 1. the declaration is the theme keyword, not the OS-deferring pair
    await expect
      .poll(() => page.locator(FIELD).evaluate((el) => getComputedStyle(el).colorScheme))
      .toBe('dark')

    // 2. the scheme the UA actually USES, read through a system colour rather
    //    than through the declaration. Measured in Chromium: `Field` resolves to
    //    rgb(255, 255, 255) under a light used-scheme and rgb(59, 59, 59) under
    //    a dark one.
    const usedGround = await page.locator(FIELD).evaluate((el) => {
      const probe = document.createElement('span')
      probe.style.colorScheme = getComputedStyle(el).colorScheme
      probe.style.backgroundColor = 'Field'
      el.parentElement!.append(probe)
      const bg = getComputedStyle(probe).backgroundColor
      probe.remove()
      return bg
    })
    expect(usedGround).toBe('rgb(59, 59, 59)')

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await expect
      .poll(() => page.locator(FIELD).evaluate((el) => getComputedStyle(el).colorScheme))
      .toBe('light')
  })
})
