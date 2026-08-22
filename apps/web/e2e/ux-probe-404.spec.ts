import { expect, test } from './fixtures/seeded-user'
import { useTheme } from './helpers/ux-shot'

/** Throwaway probe: why does the root 404 not resolve a theme? */
test('probe the 404 theme', async ({ page, signedIn }) => {
  void signedIn
  await useTheme(page, 'dark')
  for (const url of ['/home', '/this-route-does-not-exist']) {
    const res = await page.goto(url)
    await page.waitForTimeout(600)
    const info = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      ls: (() => {
        try {
          return localStorage.getItem('sahoda-theme')
        } catch {
          return 'THREW'
        }
      })(),
      themeScripts: [...document.querySelectorAll('script:not([src])')].filter((s) =>
        (s.textContent ?? '').includes('sahoda-theme'),
      ).length,
      title: document.title,
    }))
    console.log('[404probe]', url, res?.status(), JSON.stringify(info))
  }
  expect(true).toBe(true)
})
