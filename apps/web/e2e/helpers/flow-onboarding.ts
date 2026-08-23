import { expect, type Page } from '@playwright/test'

/**
 * WALK ONBOARDING, SHOOTING EACH STEP ON ARRIVAL AND ANSWERING IT AFTERWARDS.
 *
 * ── THE ORDER IS THE WHOLE POINT ─────────────────────────────────────────────
 * Onboarding's last third is reachable ONCE per account: build, result and enter
 * write `brand_memory` and flip `isFirstResolve`. The first eight screens hold
 * nothing but localStorage and are re-walkable, but a run that answers first and
 * shoots second has already lost the empty state of whatever it walked past. A
 * peer lost step 4 permanently that way. Every shot here is taken on ARRIVAL,
 * before a character is typed.
 *
 * ── AND IT STOPS ONE CLICK SHORT ─────────────────────────────────────────────
 * `Build my brand brain` spends credits and calls a model. This walk never
 * presses it. The eight steps before it are the ones a customer meets first and
 * the ones this lane is judging.
 *
 * ── WHY THE SETTLE IS NOT A `waitForTimeout` ─────────────────────────────────
 * The step transition is 520ms and its children rise for up to 360ms more.
 * Shooting on arrival caught headings at 30% opacity, which reads as a rendering
 * defect and is not one. Waiting on the Web Animations API is exact where a
 * fixed sleep is a guess in both directions. The orb drives itself on rAF and
 * never appears there, hence the short backstop after it.
 */

/** Real sentences: the summary renders them back verbatim, so lorem would photograph a lie. */
const ANSWERS = {
  name: 'Chai & Chapters',
  site: 'https://example.com',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  category: 'Local business',
  audience: 'weekend readers in Bengaluru',
  reference: 'https://www.instagram.com/blossombookhouse',
  rival: 'Blossom Book House',
} as const

async function settle(page: Page): Promise<void> {
  await page.mouse.move(-40, -40).catch(() => {})
  await page
    .waitForFunction(
      () => document.getAnimations().filter((a) => a.playState === 'running').length === 0,
      undefined,
      { timeout: 4000 },
    )
    .catch(() => {})
  await page.waitForTimeout(250)
}

const continueButton = (page: Page) => page.getByRole('button', { name: /^Continue$/ })

/**
 * Walk it, calling `shoot(stop)` on arrival at each of the eight steps.
 *
 * Returns HOW MANY steps it actually reached. The caller asserts on that: a
 * heading that stopped matching would otherwise end the walk early and the run
 * would report a green capture of half a flow.
 */
export async function walkOnboarding(
  page: Page,
  shoot: (stop: string) => Promise<void>,
): Promise<number> {
  // A fresh walk. The store is keyed by workspace, so clearing it is the same
  // account arriving with nothing saved — which is what a new customer is.
  await page.goto('/onboarding')
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('sahoda.brandbrain')) window.localStorage.removeItem(key)
    }
  })
  await page.reload()

  let reached = 0

  /* ── intro ── */
  await expect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
    timeout: 60_000,
  })
  await settle(page)
  await shoot('onb-00-intro')
  reached += 1
  await page.getByRole('button', { name: /build my brand brain/i }).click()

  /* ── 01 basics ── */
  await expect(page.getByRole('heading', { name: /what.s your brand called/i })).toBeVisible()
  await settle(page)
  await shoot('onb-01-basics')
  reached += 1
  await page.locator('#f-name').fill(ANSWERS.name)
  await page.locator('#f-site').fill(ANSWERS.site)
  await continueButton(page).click()

  /* ── 02 positioning ── */
  await expect(
    page.getByRole('heading', { name: /what does your brand actually do/i }),
  ).toBeVisible()
  await settle(page)
  await shoot('onb-02-what')
  reached += 1
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: ANSWERS.category, exact: true }).click()
  await continueButton(page).click()

  /* ── 03 audience ── */
  await expect(page.getByRole('heading', { name: /who are you trying to reach/i })).toBeVisible()
  await settle(page)
  await shoot('onb-03-audience')
  reached += 1
  await page.locator('#f-aud').fill(ANSWERS.audience)
  await continueButton(page).click()

  /* ── 04 visual — optional, and the rail has to prove it ── */
  await expect(page.getByRole('heading', { name: /sees your brand the way you do/i })).toBeVisible()
  await settle(page)
  await shoot('onb-04-visual')
  reached += 1
  await continueButton(page).click()

  /* ── 05 references ── */
  await expect(page.getByRole('heading', { name: /what .good. looks like/i })).toBeVisible()
  await settle(page)
  await shoot('onb-05-references')
  reached += 1
  await page.locator('#f-ref').fill(ANSWERS.reference)
  await page.locator('#f-ref').press('Enter')
  await continueButton(page).click()

  /* ── 06 knowledge ── */
  await expect(
    page.getByRole('heading', { name: /what should your AI already know/i }),
  ).toBeVisible()
  await settle(page)
  await shoot('onb-06-knowledge')
  reached += 1
  await continueButton(page).click()

  /* ── 07 rivals — the last screen before anything is spent ── */
  await expect(page.getByRole('heading', { name: /understand your market too/i })).toBeVisible()
  await settle(page)
  await shoot('onb-07-rivals')
  reached += 1
  // Deliberately not pressed: the next control is the paid one.

  return reached
}
