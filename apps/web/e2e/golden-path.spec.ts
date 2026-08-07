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
    const createWorkspace = page.getByRole('button', { name: /create workspace/i })
    await expect(createWorkspace).toBeVisible()

    // ── 2. Bootstrap. One RPC creates the workspace, the owner membership, the
    //      profile and the 100-credit signup grant, then routes to onboarding.
    await createWorkspace.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    // ── 3. Leave onboarding without resolving a Brain — no credits spent.
    await page.goto('/posts')
    await expect(page).toHaveURL(/\/posts/)

    // ── 4. Draft a post. This is a real insert under RLS.
    await page.getByRole('button', { name: /create post/i }).click()
    await page.waitForURL(/\/posts\/[0-9a-f-]{36}/, { timeout: 30_000 })

    const body = page.getByLabel('Body')
    await expect(body).toBeVisible()
    await body.fill('Fresh chai every morning at the corner shop.')

    // Autosave is debounced; the status is the app's own claim that it landed.
    //
    // Matched EXACTLY. A /saved/i regex also matches "Not saved" — the error
    // copy — so the loose version of this assertion passes on a failed save,
    // which is the one outcome it exists to catch.
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 20_000 })

    // ── 5. The post is really persisted — a reload is the honest check, not
    //      the in-memory state we just typed into.
    await page.reload()
    await expect(page.getByLabel('Body')).toHaveValue(/Fresh chai every morning/)

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
    await page.getByRole('button', { name: /create workspace/i }).click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await page.goto('/home')

    // `—` is the honest "could not read" state. After a successful bootstrap the
    // balance IS readable, so an em dash here means the read broke.
    const chip = page.getByRole('link', { name: /credits/i })
    await expect(chip).toBeVisible()
    await expect(chip).not.toContainText('—')
  })
})
