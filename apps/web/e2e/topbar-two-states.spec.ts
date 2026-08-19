import { expect, test } from './fixtures/seeded-user'
import type { Page } from '@playwright/test'

/**
 * The topbar at 390px, measured in BOTH account states.
 *
 * `no-truncated-labels.spec.ts` already asserts "the topbar controls neither
 * overlap nor leave the screen" at 390px, and it is green. It signs in and goes
 * straight to /home WITHOUT bootstrapping a workspace — so it measures an
 * account that has none, where the credit pill and the brain ring do not
 * render and the row is three items short of the one a real user sees.
 *
 * This file runs the SAME geometry check the existing guard runs, using the
 * same selector, in BOTH states.
 *
 * When it was written the workspace-bearing state overflowed by 17px — the user
 * menu ended at 407 in a 390px viewport — while the existing guard stayed green
 * throughout. The switcher now collapses to its badge on a phone
 * (`workspace-switcher.tsx`) and the row ends at 376.
 *
 * It is kept, and tagged @smoke, because the DEFECT was never the 17px. The
 * defect was that one account shape went unmeasured, and only a test that
 * bootstraps a workspace can notice when that happens again.
 */

const SELECTOR = 'header button, header a, header [role="status"]'

async function measure(page: Page): Promise<{ pastEdge: string[]; controls: string[] }> {
  return page.evaluate((sel) => {
    const controls = [...document.querySelectorAll(sel)]
      .filter((e) => {
        const cs = getComputedStyle(e)
        return (
          cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().width > 0
        )
      })
      .map((e) => {
        const r = e.getBoundingClientRect()
        return {
          label:
            (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 24) ||
            e.getAttribute('aria-label') ||
            e.tagName,
          right: Math.round(r.right),
        }
      })
    return {
      pastEdge: controls
        .filter((c) => c.right > window.innerWidth + 1)
        .map((c) => `"${c.label}" ends at ${c.right} in a ${window.innerWidth}px viewport`),
      controls: controls.map((c) => `${c.label} → right=${c.right}`),
    }
  }, SELECTOR)
}

test.describe('topbar at 390, both account states @smoke', () => {
  test.setTimeout(4 * 60_000)

  test('fits the viewport with AND without a workspace', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await page.setViewportSize({ width: 390, height: 900 })

    // ── STATE A: no workspace. What the existing guard measures.
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    const before = await measure(page)
    console.log('\n──── STATE A · no workspace (what the green guard sees) ────')
    before.controls.forEach((c) => console.log('   ' + c))
    console.log(`   past the edge: ${before.pastEdge.length}`)

    // ── STATE B: bootstrap a workspace, exactly as a real account does.
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    const after = await measure(page)
    console.log('\n──── STATE B · workspace present (what every real user sees) ────')
    after.controls.forEach((c) => console.log('   ' + c))
    console.log(`   past the edge: ${after.pastEdge.length}`)
    after.pastEdge.forEach((p) => console.log('   ! ' + p))

    // BOTH states, asserted. State A alone is what the pre-existing guard
    // checks, and it is the one that never broke.
    expect(before.pastEdge, 'the topbar overflows at 390 with NO workspace').toEqual([])
    expect(
      after.pastEdge,
      'the topbar overflows at 390 WITH a workspace — the state every real user is in',
    ).toEqual([])
  })
})
