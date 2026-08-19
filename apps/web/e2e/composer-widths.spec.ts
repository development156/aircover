import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'

import { bootstrapWorkspace, startPost } from './fixtures/compose'
import { expect, test } from './fixtures/seeded-user'

/**
 * The composer at five widths, in both themes, WITH A WORKSPACE — by reading text.
 *
 * ── WHY FIVE WIDTHS AND NOT TWO ──────────────────────────────────────────────
 * A previous responsive pass sampled 1440 and 390 and missed two defects that
 * only appear between 768 and 1279 — the band where the rail has collapsed to
 * icons but the page has not yet reached the composer's two-column breakpoint at
 * 1180. Two widths is not responsive; it is two screenshots.
 *
 * ── AND WHY WITH A WORKSPACE ─────────────────────────────────────────────────
 * docs/27 §2.1: a green guard measured a topbar three controls short because it
 * never bootstrapped one, and 17px of horizontal overflow stayed green for
 * weeks. Every measurement here is taken in the state a real user is in.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 * Two things, both structural rather than cosmetic:
 *
 *   1. The page never scrolls sideways. `documentElement.scrollWidth` must not
 *      exceed `clientWidth` — the composer holds two 3,000-character text boxes
 *      and a sticky bar, which is exactly the shape that overflows.
 *   2. Every version card still renders its channel name, its own limit and its
 *      own editable box at every width. The one thing this product does cannot
 *      be a thing that only works on a laptop.
 *
 * The screenshots are corroboration, not evidence, and the directory is
 * gitignored: the harness is the artefact worth versioning, not its output.
 */

/**
 * Five, and the middle three are the point. 1180 is where the composer goes to
 * two columns and where the rail finishes collapsing; 768 and 1024 are the band
 * a two-width pass (1440 + 390) never looks at, and where the last two
 * responsive defects in this app actually were.
 */
const WIDTHS = [360, 768, 1024, 1180, 1440] as const
const THEMES = ['light', 'dark'] as const

const BODY = 'Fresh chai every morning at the corner shop, ground by hand before we open.'

/** What each channel must still be saying about itself, whatever the width. */
const CARDS = [
  { channel: 'x', name: 'X', limit: '280' },
  { channel: 'linkedin', name: 'LinkedIn', limit: '3,000' },
] as const

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('the composer across widths @smoke', () => {
  test.setTimeout(25 * 60_000)

  test('never scrolls sideways, and every version keeps its name, limit and box', async ({
    page,
    signedIn,
    browser,
  }) => {
    void signedIn

    await bootstrapWorkspace(page)
    const postId = await startPost(page, 'x')
    await page.locator('[data-channel-tile="linkedin"]').click()
    await page.getByLabel('Your post').fill(BODY)
    // Waited for, not assumed. The body is written on a debounce, and the loop
    // below opens a SEPARATE browser context — so a capture taken before the
    // write lands photographs an empty composer and proves nothing about how a
    // full one lays out.
    await expect(page.getByText('Post saved')).toBeVisible({ timeout: 60_000 })

    const cookies = (await page.context().storageState()).cookies
    const findings: string[] = []

    for (const theme of THEMES) {
      const context = await browser.newContext()
      await context.addCookies(cookies)
      const p = await context.newPage()
      // Console errors are collected per theme and reported as findings. A
      // layout that renders correctly while throwing is not a layout that works.
      p.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        // Next's dev-mode externalisation notice. It does not exist in a
        // production build and is not ours — docs/27 §0 names the same class of
        // artefact for the dev indicator badge.
        if (/in-the-middle|Download the React DevTools/i.test(text)) return
        findings.push(`${theme}: the console reported an error — ${text.slice(0, 160)}`)
      })
      await p.addInitScript((t) => {
        try {
          window.localStorage.setItem('sahoda-theme', t as string)
        } catch {
          /* best effort */
        }
      }, theme)

      for (const width of WIDTHS) {
        await p.setViewportSize({ width, height: 900 })
        await p.goto(`/posts/${postId}`, { waitUntil: 'domcontentloaded' })
        await expect(p.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
        await p.waitForTimeout(800)

        const dir = `composer-proof/${theme}`
        mkdirSync(dir, { recursive: true })
        // Viewport-only, NOT fullPage: a fullPage capture renders sticky and
        // fixed chrome at its scroll offset, which is how the mobile bottom bar
        // came to be written up as a bug that did not exist (docs/27 §0).
        await p.screenshot({ path: `${dir}/composer-${width}.png` })

        const overflow = await horizontalOverflow(p)
        if (overflow > 0) {
          findings.push(`${theme} ${width}px: the page scrolls sideways by ${overflow}px`)
        }

        for (const card of CARDS) {
          const region = p.locator(`[data-version-card="${card.channel}"]`)
          const text = (await region.textContent()) ?? ''
          if (!text.includes(card.name)) {
            findings.push(`${theme} ${width}px: the ${card.name} version does not name itself`)
          }
          if (!text.includes(card.limit)) {
            findings.push(
              `${theme} ${width}px: the ${card.name} version does not show its ${card.limit} limit`,
            )
          }
          const box = p.locator(`[data-variant-editor="${card.channel}"]`)
          if (!(await box.isVisible())) {
            findings.push(`${theme} ${width}px: the ${card.name} box is not on screen`)
          }
          if (!(await box.isEditable())) {
            findings.push(`${theme} ${width}px: the ${card.name} box cannot be typed in`)
          }
        }
      }

      await context.close()
    }

    // Printed rather than counted, so a failure names the width and the theme
    // instead of reporting a number nobody can act on.
    expect(findings, findings.join('\n')).toEqual([])
  })
})
