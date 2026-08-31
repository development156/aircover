import { expect, type Page } from '@playwright/test'

/**
 * Start a post the way a person does, and hand back the row it created.
 *
 * ── WHY THIS IS A FIXTURE AND NOT SIX COPIES ─────────────────────────────────
 * Six specs each carried their own version of "go to the create flow, pick a
 * channel, press Continue, read the id out of `?post=`". When the two editors
 * became one composer, all six broke in the same way at the same time — which is
 * the argument for one helper: the journey into the writing surface is one fact
 * about the product, and a spec about templates or about analytics should not
 * have an opinion on it.
 *
 * ── WHAT CREATES THE ROW, AND WHAT NO LONGER DOES ───────────────────────────
 * The composer never creates a post when the screen opens — opening a screen is
 * not intent. It used to create one on a bare CHANNEL PICK, and that was the
 * defect: a person who ticked Instagram and walked away left an empty draft
 * called "Untitled post / No content written yet" on /posts, permanently. Five
 * such rows turned up in fifteen minutes of ordinary use.
 *
 * A row is now written when there is something to write — a title or a body — or
 * when an action genuinely needs one to exist. So this helper types, because
 * that is what a person does and it is now the only honest way to reach a saved
 * post. The id arriving in the address bar is still not a side effect this waits
 * on; it IS the evidence that the first save landed.
 */
export async function bootstrapWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  // Scoped to the PAGE, not the shell: a workspace-less account is offered the
  // bootstrap twice, and an unscoped lookup matches both.
  await page
    .locator('#main')
    .getByRole('button', { name: /create workspace/i })
    .click()
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
  await leaveOnboarding(page)
}

/**
 * PRESS THE BUTTON A REAL PERSON WOULD PRESS TO GET OUT OF THE FLOW.
 *
 * ── WHY EVERY SPEC THAT MAKES A WORKSPACE NOW NEEDS THIS ────────────────────
 * `createWorkspace` redirects into /onboarding — it always has — and the
 * landing rule added in wt-boot means an account with a workspace and no Brand
 * Brain is sent back there when it next arrives at /home. So a spec that
 * bootstrapped and then jumped to /home by URL now finds the onboarding intro,
 * and every selector after that fails naming a control that is on a screen the
 * test is not on.
 *
 * That is not the rule being wrong. It is the SPEC doing something a customer
 * cannot: /onboarding has no navigation, so the only ways off it are finishing
 * the flow or pressing this button. Jumping to /home by URL was always a
 * transition with no user behind it; it simply used to work.
 *
 * So the fixture presses the button. `I'll do this later` calls `saveExit`,
 * which sets the session cookie the rule stands down for — one click, no
 * database write, and the same state a real person reaches by the same means.
 *
 * The apostrophe is CURLY in the markup (`I&rsquo;ll`), so the name is matched
 * on the half that carries no punctuation at all.
 */
export async function leaveOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: /do this later/i }).click()
  await page.waitForURL(/\/home/, { timeout: 60_000 })
}

/**
 * Open the composer on a brand new post, pick `channel`, and return the post id
 * once the row exists.
 */
/**
 * The words that make the draft worth a row.
 *
 * Deliberately bland and deliberately NOT a sentence any assertion would want to
 * match on: every caller that cares about content overwrites either this box or
 * its own channel's card. If a spec ever fails quoting this string, the spec is
 * reading the fixture's scaffolding rather than its own subject.
 */
export const SEED_BODY = 'A draft, opened by the test fixture.'

export async function startPost(page: Page, channel: string): Promise<string> {
  await page.goto('/posts/new')
  await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
  await page.locator(`[data-channel-tile="${channel}"]`).click()
  // The tick alone writes nothing now. Typing is what makes it a draft.
  await page.getByLabel('Your post', { exact: true }).fill(SEED_BODY)
  await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 60_000 })

  const postId = new URL(page.url()).pathname.split('/').pop() as string
  expect(postId).toMatch(/^[0-9a-f-]{36}$/)
  return postId
}

/**
 * The box that holds one channel's copy. One per channel, never shared.
 *
 * BY ROLE, not by label text. The save button beside it carries the accessible
 * name "Save <Channel> copy" — deliberately, so four of them on one screen can be
 * told apart — and a bare `getByLabel('Instagram copy')` matches BOTH, which
 * Playwright reports as a strict-mode violation rather than as the ambiguity it
 * is. Anything looking for the box has to say it wants a textbox.
 */
export function versionBox(page: Page, channel: string) {
  return page.getByRole('textbox', { name: `${channel} copy`, exact: true })
}

/**
 * The save button for one channel's copy.
 *
 * By its ACCESSIBLE NAME, which carries the channel. Four version cards sit on
 * one screen and four buttons reading "Save" would be indistinguishable to
 * anyone navigating by name — and to a `getByRole` lookup. The name also keeps
 * it clear of the conflict notice's own "Use the saved version".
 */
export function saveVersionButton(page: Page, channel: string, label: string) {
  return page.locator(`[data-version-card="${channel}"]`).getByRole('button', {
    name: new RegExp(`^save ${label} copy$`, 'i'),
  })
}

/**
 * Settle on THIS save, not on one that already happened.
 *
 * ── WHAT WAS CLAIMED, AND WHAT WAS MEASURED ──────────────────────────────────
 * Three specs wrote `await expect(page.getByText('Post saved')).toBeVisible()`
 * straight after typing, and the composer has ALWAYS saved once before that
 * point — picking a channel is what creates the row. The stated worry was that
 * the assertion could therefore be satisfied by the earlier save.
 *
 * MEASURED 2026-08-21, with a throwaway spec that read both strings with ZERO
 * wait immediately after `fill`:
 *
 *     savedVisibleImmediately=false   pendingVisibleImmediately=true
 *
 * So it was NOT happening. `use-autosave` sets `unsaved` synchronously on change
 * — its own comment says "Synchronous, local, and impossible to abort" — and
 * React had already repainted "Post not saved yet" before Playwright's first
 * poll. The old assertion was winning a race, every time, rather than being
 * wrong.
 *
 * This helper is kept anyway, and the reason is the difference between VERY
 * LIKELY and CANNOT: the old form depends on a repaint beating a poll, which is
 * a property of neither the app nor the test, and nothing would report it if it
 * ever stopped holding. Requiring the pending state first makes the "Post saved"
 * that follows necessarily the one this edit caused. It also removes the same
 * assertion triplicated across three files.
 *
 * Matched exactly, both of them. `Post saved` is not a substring of
 * `Post not saved yet`, and the error copy is `Post not saved` — so a /saved/i
 * regex would pass on the one outcome these assertions exist to catch.
 */
export async function expectPostSaved(page: Page): Promise<void> {
  await expect(page.getByText('Post not saved yet')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Post saved')).toBeVisible({ timeout: 60_000 })
}
