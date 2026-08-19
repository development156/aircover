import { test } from './fixtures/seeded-user'

/**
 * A read-only probe. Asserts nothing; PRINTS what the shell actually is at
 * mobile width, so the audit quotes measurements rather than impressions.
 *
 * Two things it exists to settle:
 *  · the black circle in the bottom-left of every dev screenshot — product
 *    chrome, or Next's dev indicator living outside our tree?
 *  · does anything overflow the viewport at 390, and which controls fall under
 *    the 44px touch floor?
 *
 * Skipped unless DESIGN_AUDIT=1.
 */
test.describe('shell probe', () => {
  test.skip(process.env.DESIGN_AUDIT !== '1', 'set DESIGN_AUDIT=1')

  test('measure the shell at 390', async ({ page, signedIn }) => {
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const report = await page.evaluate(() => {
      const out: string[] = []

      // 1. Is the bottom-left circle ours?
      const portals = Array.from(document.querySelectorAll('nextjs-portal, [data-nextjs-toast]'))
      out.push(`next dev portals in document: ${portals.length}`)
      const atCorner = document.elementFromPoint(38, window.innerHeight - 40)
      out.push(
        `element at bottom-left corner: <${atCorner?.tagName.toLowerCase()}> ` +
          `class="${(atCorner as HTMLElement)?.className || ''}"`,
      )

      // 2. Horizontal overflow of the document
      out.push(
        `documentElement scrollWidth=${document.documentElement.scrollWidth} clientWidth=${document.documentElement.clientWidth}`,
      )
      const wide = Array.from(document.querySelectorAll<HTMLElement>('header *, [class*=topbar] *'))
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
        .map(
          (el) =>
            `<${el.tagName.toLowerCase()} class="${el.className}"> right=${Math.round(el.getBoundingClientRect().right)}`,
        )
      out.push(`topbar children past the right edge: ${wide.length}`)
      wide.slice(0, 6).forEach((w) => out.push('   ' + w))

      // 3. Touch targets under 44px among interactive shell controls
      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>(
          'header a, header button, nav a, nav button, [class*=bottom] a, [class*=bottom] button',
        ),
      )
      const small = interactive
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
        .map(
          ({ el, r }) =>
            `${(el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 28)} → ${Math.round(r.width)}×${Math.round(r.height)}`,
        )
      out.push(`interactive shell controls under 44px: ${small.length} of ${interactive.length}`)
      small.forEach((s) => out.push('   ' + s))

      return out
    })

    console.log('\n──── SHELL PROBE @390 ────')
    report.forEach((l) => console.log('  ' + l))
  })
})
