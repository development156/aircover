import { expect, test } from './fixtures/seeded-user'
import { framesTaken, readManifest, shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * P1 of the `wt-page-rest` lane: LOOK FIRST, DECIDE SECOND.
 *
 * Photographs every route this lane owns at the three widths that matter and in
 * both themes, so a hierarchy judgement is made against a frame rather than
 * against a file. It asserts three things a capture spec must assert or it is a
 * harness that cannot tell "nothing broke" from "nothing ran":
 *
 *   1. it wrote as many frames as it has stops;
 *   2. those frames are DISTINCT by sha, so a failed viewport resize or a theme
 *      that never took shows up as a duplicate rather than as 180 green rows;
 *   3. every frame's `domTheme` matches the theme it is labelled with.
 *
 * 1024 IS NOT OPTIONAL. This app has exactly two breakpoints (700, 1180), so
 * 390 and 1440 both land in terminal bands and NEITHER exercises 700-1179.
 *
 * ── WHAT THIS SPEC CANNOT SEE ────────────────────────────────────────────────
 * It photographs ONE account state — a freshly-minted user with one empty
 * workspace. That is deliberate (it is what every beta user meets on day one,
 * and it is the primary deliverable for /inbox), but it means no frame here
 * shows a populated ledger, a real conversation or a connected channel. Frames
 * of those states are captured separately and are labelled as such.
 */

const JOURNEY = process.env.REST_JOURNEY ?? 'rest-before'
const WIDTHS = [390, 1024, 1440] as const
const THEMES: Theme[] = ['light', 'dark']

/**
 * Ordered by what a beta user sees most, which is also the order this lane
 * works in. `/settings` leads because docs/37 §2.3 measures it directly and it
 * is this lane's proof case.
 */
const ROUTES = [
  '/settings',
  '/settings/plan',
  '/settings/profile',
  '/settings/integrations',
  '/wallet',
  '/inbox',
  '/inbox/comments',
  '/inbox/reviews',
  '/connections',
  '/brain',
  '/brain/identity',
  '/brain/voice',
  '/brain/audience',
  '/brain/competitors',
  '/brain/knowledge',
  '/brain/resolve',
  '/approvals',
  '/campaigns',
  '/assets',
  '/sites',
  '/loop',
  '/radar',
  '/leads',
  '/remix',
  '/playbooks',
  '/report',
  '/studio',
  '/ads',
  '/ads/creative',
  '/ads/targeting',
  '/ads/budget',
  '/ads/performance',
  '/sign-in',
  '/sign-up',
] as const

for (const theme of THEMES) {
  test(`page-rest frames · ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(1_200_000)
    const before = framesTaken()
    const rowsBefore = readManifest().length

    await useTheme(page, theme)

    // A workspace has to exist or every route renders its no-workspace form and
    // the run photographs one sentence twenty-eight times.
    await page.goto('/home')
    const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
    try {
      await create.waitFor({ state: 'visible', timeout: 8_000 })
      await create.click()
      await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    } catch {
      /* already has one */
    }

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
      for (const route of ROUTES) {
        const ms = await timedGoto(page, route)
        await shot(page, {
          journey: JOURNEY,
          stop: `${route.slice(1).replace(/\//g, '-')}__${width}`,
          width,
          theme,
          ms,
        })
      }
    }

    expect(framesTaken() - before).toBe(WIDTHS.length * ROUTES.length)

    /**
     * AND THE FRAMES MUST BE DISTINCT — but keyed on the RESOLVED route.
     *
     * A count cannot tell you a viewport resize silently failed; only the sha
     * can. The first version of this check keyed on the STOP, and it went red on
     * its first run against `/brain/competitors`, which `redirect()`s to
     * `/radar` on purpose (that file's header explains why). Two stops that land
     * on the same URL SHOULD photograph identically; the check was asserting
     * that a deliberate redirect is a defect.
     *
     * Keyed on `route` — the pathname the browser actually settled on — a
     * redirect collapses into one key and stops being a finding, while two
     * genuinely different pages rendering the same pixels still is one.
     *
     * WHAT IT CANNOT SEE: two routes that differ only in something a PNG cannot
     * carry (a title, an aria-label, a link target). It compares rasters, so
     * anything invisible is invisible to it too.
     */
    const mine = readManifest().slice(rowsBefore)
    const bySha = new Map<string, Set<string>>()
    for (const r of mine) {
      const key = `${r.sha}`
      bySha.set(key, (bySha.get(key) ?? new Set<string>()).add(`${r.route}@${r.width}`))
    }
    const dupes = [...bySha.values()].filter((routes) => routes.size > 1).map((s) => [...s])
    expect(dupes, `different routes, identical pixels: ${JSON.stringify(dupes)}`).toEqual([])

    const expected = theme === 'dark' ? 'dark' : 'light'
    const mislabelled = mine.filter((r) => r.domTheme !== expected).map((r) => r.stop)
    expect(mislabelled, `frames labelled ${theme} whose DOM was not`).toEqual([])
  })
}
