import { expect, test } from '@playwright/test'

/**
 * The half of the golden path that needs no account.
 *
 * `middleware.ts` uses an inverted model — everything is protected except
 * `/sign-in` and `/sign-up` — so these assertions are the guard rail on that
 * inversion. A regression here means either an unprotected route was created,
 * or `auth.protect()` stopped redirecting into our themed pages and started
 * bouncing to Clerk's hosted Account Portal (which has happened once already).
 */

test.describe('unauthenticated access @smoke', () => {
  test('sends a signed-out visitor from a protected route to our own sign-in', async ({ page }) => {
    await page.goto('/posts')

    await expect(page).toHaveURL(/\/sign-in/)
    // Specifically OUR page, not Clerk's hosted portal on accounts.*.dev.
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host)
  })

  test('protects the wallet as well — the inversion covers every app route', async ({ page }) => {
    await page.goto('/wallet')

    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('renders the sign-in form rather than an error boundary', async ({ page }) => {
    await page.goto('/sign-in')

    await expect(page.getByRole('textbox').first()).toBeVisible()
  })

  test('serves the sign-up route publicly', async ({ page }) => {
    const response = await page.goto('/sign-up')

    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveURL(/\/sign-up/)
  })

  test('reports no console errors while rendering sign-in', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/sign-in')
    await expect(page.getByRole('textbox').first()).toBeVisible()

    // Clerk's dev instance prints a development-keys banner as a warning, not an
    // error; a genuine error here is ours.
    expect(errors).toEqual([])
  })
})
