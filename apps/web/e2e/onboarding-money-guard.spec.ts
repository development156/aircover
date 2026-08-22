import { expect, test } from './fixtures/seeded-user'

/**
 * THE MONEY GUARD, IN A REAL BROWSER.
 *
 * ── WHY A UNIT TEST IS NOT ENOUGH HERE ───────────────────────────────────────
 * `use-build.money.test.tsx` proves the hook charges once. It cannot prove the
 * SCREEN reaches the hook once, and the screen is where the defect was: QA #6
 * was found by double-clicking a button, not by calling a function twice. Four
 * controls are wired to the same paid call, and one of them — "Skip for now" —
 * does not look like a resolve button at all.
 *
 * ── WHY BOTH PRESSES COME FROM ONE `page.evaluate` ───────────────────────────
 * Two Playwright `click()` calls are two round-trips with a React commit in
 * between, so the second would meet an already-disabled button and the REF
 * would never be asked. MEASURED here: dispatched from inside the page,
 * `next.disabled` still reads false after the first click — React does not
 * commit between two calls in one task, which is exactly why the guard is a ref
 * and why the render mirror is documented as not being the guard.
 *
 * ── WHY THE ACTION IS ABORTED AND NOT HELD OPEN ──────────────────────────────
 * This is the trap this file was written around, and it cost a full run.
 *
 * The first version intercepted the action POST and never fulfilled it: no
 * model call, no credits, and the first dispatch stays in flight across the
 * second press. It passed WITH THE GUARD REMOVED. Next 15 serialises server
 * actions through one client-side queue, so hanging the first request stops the
 * other two from ever being SENT. MEASURED with the component instrumented:
 * `resolveOnboarding` was entered three times and exactly one POST left the
 * browser. The count read "one charge" while three charges sat queued behind a
 * request the test itself was holding open.
 *
 * (The QA report records the same shape on the old flow: a never-settling mock
 * swallows the second dispatch even with no guard at all. It is worth writing
 * down twice.)
 *
 * Aborting drains the queue instead. Still no model call and no credits — the
 * request never reaches a server action — but every dispatch that was made gets
 * to be counted. With the guard armed the second and third presses never enter
 * `start` at all, so there is nothing to queue.
 *
 * ── WHY IT COUNTS THE `next-action` HEADER AND NOT THE URL ───────────────────
 * A server action POSTs to the page's own URL, so `method === 'POST'` plus a
 * URL match would also count every other action this screen fires. Only a
 * server action carries `next-action`.
 *
 * Deliberately NOT @smoke: it drives eight screens and mints a Clerk user.
 */

const ANSWERS = {
  name: 'Chai & Chapters',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  category: 'Local business',
  audience: 'weekend readers in Bengaluru',
}

test.describe.configure({ timeout: 600_000 })

test('a double press on the build step reaches the server ONCE', async ({ page, signedIn }) => {
  void signedIn

  /** Every server action this page fires, by the only header that names one. */
  let actionPosts = 0
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action'] !== undefined) actionPosts += 1
  })
  await page.route(
    (url) => url.pathname === '/onboarding',
    async (route, request) => {
      if (request.method() === 'POST' && request.headers()['next-action'] !== undefined) {
        // Fails fast rather than hanging — see the header. The request is
        // counted before it is aborted, and nothing reaches the action.
        await route.abort('failed')
        return
      }
      await route.continue()
    },
  )

  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await expect(create).toBeVisible({ timeout: 30_000 })
  await create.click()
  await expect(create).toBeHidden({ timeout: 30_000 })

  await page.goto('/onboarding')
  await page.getByRole('button', { name: /build my brand brain/i }).click()
  await page.locator('#f-name').fill(ANSWERS.name)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: ANSWERS.category, exact: true }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-aud').fill(ANSWERS.audience)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click() // 04 visual
  await page.getByRole('button', { name: /^Continue$/ }).click() // 05 references
  await page.getByRole('button', { name: /^Continue$/ }).click() // 06 knowledge

  await expect(page.locator('#next')).toHaveText(/build my brand brain/i)
  // The cost is stated ON the screen that spends it, not only on the intro.
  await expect(page.locator('#rail')).toContainText(/free the first time|uses 50 credits/i)

  const before = actionPosts

  // ── THE PRESS ──────────────────────────────────────────────────────────────
  // #next twice AND #skip, all in ONE task. #skip is the cross-button case: two
  // differently-labelled controls calling the same paid function, which is the
  // argument for one shared ref rather than per-button `disabled`.
  await page.evaluate(() => {
    const next = document.getElementById('next') as HTMLButtonElement | null
    const skip = document.getElementById('skip') as HTMLButtonElement | null
    next?.click()
    next?.click()
    skip?.click()
  })

  await expect(page.locator('#proc')).toBeVisible({ timeout: 15_000 })
  // Every dispatch that was made has to be given time to leave. A queued second
  // action is sent only once the first settles, and the first is aborted — the
  // point of the abort is that a second charge would be VISIBLE here, not that
  // it becomes impossible.
  await page.waitForTimeout(4000)

  // THE MONEY. `newResolveObjectRef` mints a fresh ledger key per dispatch, so
  // a second request here is a second `brand_research` charge of 50 credits.
  expect(actionPosts - before).toBe(1)
})
