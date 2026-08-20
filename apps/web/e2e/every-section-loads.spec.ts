import { expect, test } from './fixtures/seeded-user'

/**
 * EVERY SECTION IN THE MENU OPENS, AND SAYS ITS OWN NAME.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The navigation now offers twenty-one destinations, and roughly a third of them
 * are screens no other test visits. "No dead ends" is a product rule here, and
 * until now nothing checked the cheapest way it can break: a route that throws.
 *
 * A throw is not a quiet failure in this app. MEASURED on 2026-08-20: one page
 * erroring in the `(app)` group makes Next try to render `(app)/error.tsx`, and
 * the dev server answers `Could not find the module "…/error.tsx#default" in the
 * React Client Manifest` and then STOPS SERVING. The whole smoke suite went from
 * 59 passing to 59 failing on `ERR_CONNECTION_REFUSED`, and not one of those
 * failures named the page that started it. One broken screen took down every
 * test in the repo and hid itself while doing it.
 *
 * So this walks the menu. It is the cheapest possible assertion — the page
 * rendered and its heading is the section's name — and it is the one that says
 * WHICH section when something is wrong.
 *
 * ── BY NAME, NOT BY STATUS CODE ──────────────────────────────────────────────
 * A 200 is not evidence: an error boundary renders with a 200, and so does a
 * blank page. Reading the `h1` is what separates "this screen exists" from "this
 * URL resolves" — the same rule docs/26 §12 states as read rendered text, not
 * box sizes.
 *
 * ── AND THE LIST IS THE NAV'S OWN ────────────────────────────────────────────
 * Hand-written here rather than imported from `lib/nav/sections.ts`, on purpose.
 * A test that reads the same array the app renders passes whatever that array
 * says, including "empty". These are the twenty-one sections a person should be
 * able to reach, written down independently, so that deleting one from the map
 * fails here rather than shrinking the test with it.
 */

/**
 * href → the `h1` that screen must show.
 *
 * A pattern rather than a literal for the two whose heading is not their section
 * name: /home leads with a GREETING (`greeting-banner.tsx` — deliberately an
 * `<h1>`, because the banner replaced Home's PageTitle and left the app's
 * most-visited screen with no h1 at all), and the greeting changes with the hour.
 */
const SECTIONS: ReadonlyArray<readonly [string, RegExp]> = [
  ['/home', /good (morning|afternoon|evening)/i],
  ['/brain', /^Brand Brain$/],
  ['/posts', /^Posts$/],
  ['/campaigns', /^Campaigns$/],
  ['/assets', /^Assets$/],
  ['/studio', /^Studio$/],
  ['/remix', /^Remix$/],
  ['/planner', /^Planner$/],
  ['/approvals', /^Approvals$/],
  ['/sites', /^Sites$/],
  ['/ads', /^Ads$/],
  ['/inbox', /^Inbox$/],
  ['/leads', /^Leads$/],
  ['/analytics', /^Analytics$/],
  ['/report', /^CMO Report$/],
  ['/radar', /^Radar$/],
  ['/loop', /^The Loop$/],
  ['/playbooks', /^Playbooks$/],
  ['/connections', /^Connections$/],
  ['/wallet', /^Wallet$/],
  ['/settings', /^Settings$/],
]

/**
 * The Brand Brain's own tabs. Their heading is the section's, from the layout,
 * so they are checked for a distinctive string on the page instead.
 */
const BRAIN_TABS: ReadonlyArray<readonly [string, RegExp]> = [
  ['/brain/identity', /identity|brand persona|customer/i],
  ['/brain/voice', /voice/i],
  ['/brain/audience', /audience twin|panel/i],
  ['/brain/knowledge', /knowledge library|where it came from/i],
]

test.describe('every section loads @smoke', () => {
  test.slow()

  test('each of the twenty-one sections opens and shows its own name', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    test.setTimeout(240_000)

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    const broken: string[] = []
    for (const [href, heading] of SECTIONS) {
      await page.goto(href)
      try {
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({
          timeout: 20_000,
        })
      } catch {
        // Collected rather than thrown, so ONE run names every broken section
        // instead of stopping at the first — the failure mode above cost a whole
        // suite to diagnose one page.
        broken.push(`${href} (expected h1 "${heading}")`)
      }
    }

    expect(broken, 'These sections are in the menu and do not render their own heading.').toEqual(
      [],
    )
  })

  test('the Brand Brain tabs open', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(120_000)

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    const broken: string[] = []
    for (const [href, pattern] of BRAIN_TABS) {
      await page.goto(href)
      try {
        await expect(page.locator('#main').getByText(pattern).first()).toBeVisible({
          timeout: 20_000,
        })
      } catch {
        broken.push(href)
      }
    }
    expect(broken, 'These Brand Brain tabs do not render.').toEqual([])
  })

  test('the retired competitors tab still lands somewhere useful', async ({ page, signedIn }) => {
    void signedIn
    // A moved feature must never become a 404. /brain/competitors rendered
    // <ComingSoon feature="Radar"> — it WAS Radar — and now redirects there.
    await page.goto('/brain/competitors')
    await page.waitForURL(/\/radar/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Radar', level: 1 })).toBeVisible()
  })
})
