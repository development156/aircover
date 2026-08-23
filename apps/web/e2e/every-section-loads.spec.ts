import { expect, test } from './fixtures/seeded-user'
import { bootstrapWorkspace, leaveOnboarding } from './fixtures/compose'

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
  // WAS `/audience twin|panel/i`, which named the coming-soon screen this tab used
  // to hold. That screen is gone: the tab now reads a workspace, a connection and a
  // live platform call. A stale pattern here is a test that PINS A DEFECT — it makes
  // a correct replacement look like a regression, and it was the only thing standing
  // between this suite and green. `Who follows you` is the one heading every one of
  // the screen's eight states renders, so it identifies the tab without pinning any
  // single state's copy.
  ['/brain/audience', /who follows you/i],
  // WAS `/knowledge library|where it came from/i`, which named the coming-soon
  // screen. That screen is gone: the tab now reads `knowledge_documents` and a
  // full-text index. Stale for exactly the reason the audience note above gives —
  // a pattern that pins the old copy makes a correct replacement look like a
  // regression, and this was one of three smoke failures that were all the same
  // thing: tests describing a screen that no longer exists.
  //
  // The subtitle is chosen because `Shell` renders it in EVERY state the page
  // has — no workspace, empty, populated, and unreadable — so it identifies the
  // tab without pinning any one state's copy.
  ['/brain/knowledge', /documents Sahoda has read/i],
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
    await leaveOnboarding(page)

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
    await leaveOnboarding(page)

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
    //
    // The workspace is bootstrapped FIRST, which this test did not used to need.
    // Since wt-boot, an account with no workspace gets the first-run screen in
    // place of any (app) page, so without one the redirect would land correctly
    // on /radar and then be asserted against a screen that is deliberately not
    // Radar. Giving it a workspace tests the stronger claim: the old URL reaches
    // the real destination, not merely a non-404.
    await bootstrapWorkspace(page)
    await page.goto('/brain/competitors')
    await page.waitForURL(/\/radar/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Radar', level: 1 })).toBeVisible()
  })
})
