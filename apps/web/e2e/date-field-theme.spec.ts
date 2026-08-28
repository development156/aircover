import { expect, test } from './fixtures/seeded-user'
import { openPart } from './fixtures/compose'

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
     * ── ONE CLICK TO REACH IT, AND THE FIELD IT REACHES HAS CHANGED ───────────
     * `FinishPanel` asks which route the post takes before offering either set
     * of controls, so the schedule side has to be opened. After that the picker
     * is on screen with its calendar and its time control already visible.
     *
     * `#post-schedule` was the `datetime-local` mask. That mask is gone: the
     * field is a month calendar plus an `<input type="time">`, and the id moved
     * onto the time input. This spec is about `color-scheme` on a NATIVE DATE
     * CONTROL, which that still is, so the guarantee is unchanged and only the
     * element carrying it moved.
     *
     * Worth recording: before this change the spec clicked nothing at all and
     * asserted `#post-schedule` visible, while the mask had been behind "Pick an
     * exact time" since the named-times redesign. It could not have passed. It
     * went unnoticed because this file carries no `@smoke` tag and `turbo test`
     * runs Vitest only, so nothing in the gate has ever executed it — the same
     * gap CLAUDE.md records for `golden-path`, found again.
     *
     * ── AND IT IS THREE PARTS AWAY NOW, NOT ONE ─────────────────────────────
     * The composer lists the three parts of a post down the side, and this
     * panel is the third: refused outright until something is written and a
     * platform is picked. So the spec walks the rail. That is not scaffolding around the subject —
     * a schedule field nobody can reach is not a schedule field, and the route
     * a person takes to it is the only route this spec is entitled to take. The
     * same omission here as before, caught the same way: no `@smoke` tag, so
     * nothing in the gate would have said a word.
     */
    await page.getByLabel('Your post').fill('A post that needs a time on it.')
    await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 90_000 })
    await openPart(page, 2)
    await page.locator('[data-channel-tile="x"]').click()
    await expect(page.locator('[data-version-card="x"]')).toBeVisible({ timeout: 30_000 })

    await openPart(page, 3)
    await page.getByRole('button', { name: /^Schedule it/ }).click()
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
