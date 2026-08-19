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
 * ── WHAT "PICKING A CHANNEL CREATES THE ROW" MEANS ───────────────────────────
 * The composer never creates a post when the screen opens — opening a screen is
 * not intent. It creates one on the first save that has something to write, and
 * choosing a channel is such a change. So the id arriving in the address bar is
 * not a side effect this helper waits on; it IS the evidence that the first save
 * landed, and every caller below depends on that being true.
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
}

/**
 * Open the composer on a brand new post, pick `channel`, and return the post id
 * once the row exists.
 */
export async function startPost(page: Page, channel: string): Promise<string> {
  await page.goto('/posts/new')
  await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
  await page.locator(`[data-channel-tile="${channel}"]`).click()
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
