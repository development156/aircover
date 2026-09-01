import { expectPostSaved, leaveOnboarding, dismissPlanOffer } from './fixtures/compose'
import { expect, test } from './fixtures/seeded-user'

/**
 * The golden path, end to end, against the real app and the real database:
 *
 *   fresh account → workspace bootstrap (100-credit signup grant)
 *   → draft a post → see the grant in the wallet ledger
 *
 * What is deliberately NOT here: the paid Brand Resolve. It spends 50 credits
 * and calls a real model provider on every run, and a gate that costs money
 * every time it runs is a gate people learn to skip. Onboarding is entered and
 * left, which is what the golden path needs to prove.
 *
 * Every row this touches is created by the run and removed after it (see
 * `fixtures/seeded-user.ts`). Nothing depends on a pre-existing account,
 * workspace or post.
 */

test.describe('golden path @smoke', () => {
  test('a fresh account can bootstrap a workspace, draft a post, and see its credits', async ({
    page,
    signedIn,
  }) => {
    // ── 1. Signed in, but no workspace yet — the state a wiped database leaves.
    await page.goto('/home')
    // Scoped to the PAGE, not the shell. A workspace-less account is offered the
    // bootstrap twice — once quietly in the topbar switcher and once as the empty
    // state's primary action — so an unscoped by-name lookup matches two elements
    // and fails Playwright's strict mode. The empty state's button is the one
    // this journey is about: it is what a new account actually presses.
    const createWorkspace = page.locator('#main').getByRole('button', { name: /create workspace/i })
    await expect(createWorkspace).toBeVisible()

    // ── 2. Bootstrap. One RPC creates the workspace, the owner membership, the
    //      profile and the 100-credit signup grant, then routes to onboarding.
    await createWorkspace.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    // ── 3. Leave onboarding without resolving a Brain — no credits spent.
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/posts/)

    // ── 4. Draft a post. This is a real insert under RLS.
    //
    // A LINK, not a button. `CreatePostButton` was a <button> that wrote an empty
    // draft and jumped straight to /posts/<id>; commit faded84 made it a <Link>.
    // Its ARIA role changed with it, so `getByRole('button')` stopped matching
    // and this step had been timing out ever since — invisibly, because the e2e
    // suite has never run inside the gate.
    await page.getByRole('link', { name: /create post/i }).click()
    await page.waitForURL(/\/posts\/new/, { timeout: 30_000 })

    // There is ONE screen for writing a post, and it does not create a row when
    // it opens — opening a screen is not intent. Nor does a bare channel tick:
    // that used to write a row, and it left an empty "Untitled post" behind for
    // everyone who ticked a channel and changed their mind. The row appears on
    // the first save that has something to WRITE, so the words come first here
    // and the id then arrives in the address bar without the screen changing.
    await page.locator('[data-channel-tile="instagram"]').click()

    const body = page.getByLabel('Your post', { exact: true })
    await expect(body).toBeVisible()
    await body.fill('Fresh chai every morning at the corner shop.')

    await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    const postId = new URL(page.url()).pathname.split('/').pop()
    expect(postId).toMatch(/^[0-9a-f-]{36}$/)

    // A SECOND edit, and the transition belongs to THAT one.
    //
    // `expectPostSaved` asserts the pair — "Post not saved yet" and then "Post
    // saved" — because waiting only for "Post saved" was MEASURED not to be
    // satisfied by an earlier save, and only held because a synchronous repaint
    // beat Playwright's first poll. That pairing is what makes it honest, and it
    // is also why it cannot be pointed at the save above: creation is what puts
    // the id in the address bar, so by the time `waitForURL` returns that save
    // has already landed and its "not saved yet" is long gone. Asserting it
    // there would be waiting for a state the previous line guarantees is over.
    //
    // So the golden path writes twice, which is what writing is: the words, then
    // the second thought. The reload below reads the second thought back.
    await body.fill('Fresh chai every morning at the corner shop. Open from six.')
    await expectPostSaved(page)

    // ── 5. The post is really persisted — a reload is the honest check, not
    //      the in-memory state we just typed into.
    await page.reload()
    await expect(page.getByLabel('Your post', { exact: true })).toHaveValue(
      /Fresh chai every morning/,
    )

    // ── 6. It shows up in the list.
    await page.goto('/posts')
    await expect(page.getByText(/Fresh chai every morning/).first()).toBeVisible()

    // ── 7. The signup grant is visible in the wallet, with its ledger row.
    //
    // Located by the tour anchors rather than by copy: they are the app's own
    // stable handles, and using them here means the E2E also notices if one
    // disappears.
    await page.goto('/wallet')

    // bootstrap_workspace grants 100 credits, so a fresh workspace shows exactly
    // that — not a placeholder, and not an em dash.
    await expect(page.locator('[data-guide="wallet.balance"]')).toContainText('100')

    const ledger = page.locator('[data-guide="wallet.ledger"]')
    await expect(ledger).toBeVisible()
    // The signup grant is the only entry a fresh workspace has. Asserted as the
    // reader sees it — a positive 100 — not as the raw `GRANT` enum, which
    // `describeEntry` deliberately never renders. (That this assertion had to
    // change is itself the corroboration: the UI really does humanise it.)
    await expect(ledger).toContainText('+100')
    await expect(ledger).not.toContainText(/GRANT|entry_type|idempotency/i)
  })

  test('the credit chip reports a real balance rather than an em dash', async ({
    page,
    signedIn,
  }) => {
    await page.goto('/home')
    // Scoped for the same reason as above — the offer appears in the shell too.
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)
    await page.goto('/home')
    await dismissPlanOffer(page)

    // `—` is the honest "could not read" state. After a successful bootstrap the
    // balance IS readable, so an em dash here means the read broke.
    // By the tour anchor, not by copy — the same rule this spec already applies
    // to the wallet balance and ledger below, and for the same reason: /credits/i
    // is not unique on this screen. It matches the topbar chip AND the planner's
    // "Plan my week · 20 credits" button, so the unscoped lookup fails strict
    // mode. Pricing copy will keep growing; the anchor will not.
    const chip = page.locator('[data-guide="topbar.credits"]')
    await expect(chip).toBeVisible()
    await expect(chip).not.toContainText('—')
  })
})
