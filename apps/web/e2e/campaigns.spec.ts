import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * CAMPAIGNS, end to end, against the real app and the real database:
 *
 *   fresh account → workspace → a real post → a real campaign
 *   → the post grouped under it → the grid → the label back on the planner
 *
 * ── WHY THIS READS TEXT AND NOT BOXES ────────────────────────────────────────
 * A regression pass on this app once asserted widths, offsets and overflow flags
 * at six viewports, went green everywhere, and shipped a rail rendering the
 * literal string "S Sah". Every number was right and the pixels were not. So
 * every assertion below names a WORD a person would read — the campaign's name,
 * the channel column, the stage — and the two that matter most check that two
 * different states do not render the same words.
 *
 * ── WHERE THESE ROWS LIVE, AND WHY A PEER'S RUN CANNOT SEE THEM ──────────
 * This file writes campaigns, posts and membership rows into the DEV database,
 * which several lanes share. Isolation is therefore stated with its evidence
 * rather than assumed. MEASURED, three links:
 *
 *   1. `fixtures/seeded-user.ts` mints a FRESH Clerk user per test — a unique
 *      `+clerk_test` address — and deletes it in a `finally`, so every test in
 *      this file runs in a workspace that did not exist when the run started.
 *   2. `bootstrap_workspace` inserts `created_by = v_user`, the Clerk id off the
 *      JWT. Teardown deletes `workspaces where created_by = <that id>`, so the
 *      root it removes is exactly the root this run created.
 *   3. Every `workspace_id` foreign key in the schema is `on delete cascade` —
 *      `campaigns` and `campaign_posts` included — so that one delete takes
 *      everything below it. Nothing here is cleaned up by name.
 *
 * Two things this file adds on top, because per-run isolation should not be the
 * only thing between an assertion and somebody else's row:
 *
 *   · Every name it writes carries `RUN`. No assertion here can match a row this
 *     run did not create, and anything a failed teardown leaves behind is
 *     attributable to the run that left it.
 *   · Counts are read from the campaign's OWN row, never from anywhere in the
 *     table — a bare `1` is satisfied by any row that happens to hold one.
 *
 * Every row this touches is created by the run and removed after it.
 */

/**
 * Unique per run. `Date.now()` is legitimate here: this is scaffolding choosing
 * a name, not product code inventing a figure.
 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const CAMPAIGN = `Diwali week ${RUN}`
const OVERFLOW_CAMPAIGN = `Overflow check ${RUN}`

/**
 * Write a real post on two channels, and hand back its id.
 *
 * ── THE COMPOSER REWRITE LANDED, AND THIS FLIPPED BACK ───────────────────
 * The previous version of this note said, at length, that `[data-composer]` and
 * `[data-version-card]` existed only on `wt-composer` and `wt-editor2` and that
 * "whoever merges wt-composer should expect to restore it". That is this commit.
 * The helper drove `/create/post` -> tile -> **Continue** because on that tree
 * `create-flow.tsx` was alive; here it is deleted, `/create/post` is a redirect,
 * and there is no Continue to wait for. MEASURED before the change: both @smoke
 * tests in this file failed at `getByRole('button', {name: /^continue/i})` after
 * the full 180s timeout, twice each.
 *
 * ── WHAT THIS TREE DOES ──────────────────────────────────────────────────
 * `/posts/new` IS the composer; the row is created by the first save that has
 * something to write, which picking a channel is, and the id then arrives in the
 * PATH — not in a `?post=` query string, which nothing emits any more.
 *
 * ── AND WHY THE CHANNELS ARE READ BACK RATHER THAN REASONED ABOUT ───────
 * The grid this spec exists to check takes its COLUMNS from `posts.channels`
 * (`lib/campaigns/rollup.ts#channelUnion`), a server read of the row — so the row
 * is asked directly rather than argued about from a debounce window. The reload
 * at the end of the helper is that question, and it survived the rewrite: only
 * the selector changed, from a channel TAB to a version CARD, because docs/26
 * §10.4 makes the versions a stack rather than tabs.
 */
async function writePostOnTwoChannels(page: Page, body: string): Promise<string> {
  await page.goto('/posts/new')
  await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 90_000 })

  // The words come first, because the screen is a numbered sequence and the
  // channel step is refused until there is something for it to shape. This
  // helper used to pick both channels before writing a word; that order is not
  // slow now, it is impossible.
  await page.getByLabel('Your post').fill(body)

  // Read the id off the PATH. Nothing emits `?post=` any more, and a spec that
  // waits for one waits until its timeout.
  await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 60_000 })
  const postId = new URL(page.url()).pathname.split('/').pop() as string
  expect(postId).toMatch(/^[0-9a-f-]{36}$/)

  await page.locator('[data-channel-tile="instagram"]').click()
  await page.locator('[data-channel-tile="linkedin"]').click()

  // These cards are the PICKER's answer, not the row's. The reload below is
  // what asks the row.
  await expect(page.locator('[data-version-card="instagram"]')).toBeVisible()
  await expect(page.locator('[data-version-card="linkedin"]')).toBeVisible()
  await expect(page.getByText('Post saved')).toBeVisible({ timeout: 60_000 })

  // ── THE GUARANTEE THIS HELPER CARRIES, RETARGETED AND NOT DROPPED ──────────
  // The previous version ended by reloading and finding a channel TAB per
  // channel, with the note that this is "THE ROW, not the screen that wrote it":
  // the grid downstream takes its COLUMNS from `posts.channels`
  // (lib/campaigns/rollup.ts#channelUnion), so what matters is that the SERVER
  // believes both channels are on the post. The composer has no tabs — docs/26
  // §10.4 makes the per-channel versions a STACK on purpose, because a control
  // showing one version at a time hides the one thing this product does. So the
  // reload stays and the selector moves: two version cards after a round trip
  // are the same claim about the same column, read through a surface that did
  // not write it.
  await page.reload()
  await expect(page.locator('[data-version-card="instagram"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-version-card="linkedin"]')).toBeVisible()

  return postId
}

test.describe('campaigns @smoke', () => {
  test('a campaign can be named, filled with a post, and read per channel', async ({
    page,
    signedIn: _signedIn,
  }) => {
    // This journey is the first thing to touch six routes, and a cold Turbopack
    // compile of one of them can outlast the default budget on its own. Marked
    // slow rather than given a larger global timeout: the app is not slow, the
    // first compile is, and raising the ceiling for the whole suite would hide a
    // route that genuinely became slow later.
    test.slow()
    // ── 1. Bootstrap a workspace. Campaigns belong to one, and the screen says
    //      so rather than showing an empty list.
    //
    //      The SENTENCE moved and the guarantee did not. This page used to
    //      carry its own "Create a workspace first" copy; wt-boot replaced every
    //      such per-page variant with ONE first-run screen rendered by
    //      `(app)/layout.tsx`, because writing that sentence twenty-one times is
    //      how /analytics came to tell a workspace-less account to connect a
    //      channel instead. What this step has always asserted is that the page
    //      names the missing workspace rather than showing an empty list, and
    //      that is what is asserted here.
    await page.goto('/campaigns')
    await expect(
      page.locator('#main').getByText(/create a workspace to get started/i),
    ).toBeVisible()
    // Not an empty campaigns list wearing a different hat.
    await expect(
      page.locator('#main').getByRole('button', { name: /create workspace/i }),
    ).toBeVisible()

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    // ── 2. With a workspace and no campaigns, the screen offers to make one.
    //      This is the EMPTY state, and it must not be the unreadable one: the
    //      two claims are different and only one of them invites an action.
    await page.goto('/campaigns')
    await expect(page.getByRole('heading', { name: /no campaigns yet/i })).toBeVisible()
    await expect(page.getByText(/could not read your campaigns/i)).toHaveCount(0)

    // ── 3. Write a real post first, so the campaign has something to group.
    //      Two channels, because one body per channel is the thing the grid is
    //      for and a single-channel post would not show it.
    await writePostOnTwoChannels(page, 'Diwali sweets, boxed and ready from Friday.')

    // ── 4. Create the campaign. A real insert under RLS.
    await page.goto('/campaigns')
    await page.getByRole('button', { name: /^create campaign$/i }).click()
    await page.getByLabel('Name').fill(CAMPAIGN)
    await page.getByLabel('What it is for').fill('Fill the Saturday lunch slot')
    // The dialog's own submit, not the trigger that opened it.
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^create campaign$/i })
      .click()

    // Straight into the campaign, because the next thing anyone wants is to put
    // posts in it.
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: CAMPAIGN, level: 1 })).toBeVisible()
    await expect(page.getByText('Fill the Saturday lunch slot')).toBeVisible()

    // Empty campaign: a real sentence, not a grid of dashes.
    await expect(page.getByRole('heading', { name: /nothing in this campaign yet/i })).toBeVisible()

    // ── 5. Put the post in it.
    await page.getByRole('button', { name: /^add posts$/i }).click()
    const picker = page.getByRole('dialog')
    await picker.getByText('Untitled post').first().click()
    await picker.getByRole('button', { name: /add to campaign/i }).click()

    // ── 6. THE GRID. One row for the post, one COLUMN PER CHANNEL — this is the
    //      whole point of the screen. Instagram and LinkedIn each get their own
    //      column because each has its own body and publishes on its own.
    const grid = page.getByRole('table', { name: /every post in this campaign/i })
    await expect(grid).toBeVisible({ timeout: 30_000 })
    await expect(grid.getByRole('columnheader', { name: /instagram/i })).toBeVisible()
    await expect(grid.getByRole('columnheader', { name: /linkedin/i })).toBeVisible()

    // Nothing has published, so no cell may claim it has. Read as WORDS: "Live"
    // is the one word a cell must not carry here.
    await expect(grid.getByText('Live', { exact: true })).toHaveCount(0)

    // ── NO CELL STANDS IN FOR A VALUE WITH A DASH ─────────────────────────────
    // Checked per CELL, and checked for a dash that IS the cell's whole content.
    //
    // The first version of this assertion scanned the grid's entire text for the
    // character and failed on `— still being written`, which is the status
    // chip's screen-reader hint. That is prose, and the house style keeps em
    // dashes in prose deliberately (repo CLAUDE.md: "never run a bulk em-dash
    // strip"). The rule docs/26 §4 actually states is narrower and this is it:
    // a dash may not be rendered IN PLACE OF a missing value.
    const cellTexts = await grid.locator('tbody td').allInnerTexts()
    for (const text of cellTexts) {
      expect(text.trim(), 'a cell must not stand in for a missing value with a dash').not.toMatch(
        /^[—–-]$/,
      )
    }

    // ── 7. The campaign shows up on the planner, on the post it groups.
    await page.goto('/planner')
    await expect(page.getByRole('link', { name: CAMPAIGN }).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── 8. Back on the list: a real count of real rows, and the stage filter
    //      uses the value the column accepts.
    await page.goto('/campaigns')
    const table = page.getByRole('table', { name: /your campaigns/i })
    const row = table.getByRole('row').filter({ hasText: CAMPAIGN })
    await expect(row.getByRole('link', { name: CAMPAIGN })).toBeVisible()
    // Read from THIS campaign's ROW. `table.getByText('1')` is satisfied by any
    // row in the table that happens to hold a one, which on a shared database is
    // a count this run did not produce.
    await expect(row.getByText('1', { exact: true })).toBeVisible()

    // "Finished" is the label; `finished` is the value. The chip that stood here
    // before said "Completed", which the check constraint has never accepted.
    await page.getByRole('link', { name: /^Finished/ }).click()
    await page.waitForURL(/stage=finished/, { timeout: 15_000 })
    // Filtered to a stage this campaign is not in, so it is gone — proof the
    // filter matched a real value rather than nothing.
    await expect(page.getByRole('link', { name: CAMPAIGN })).toHaveCount(0)

    // Waited for, like the step above it. Without this the assertion can be made
    // against the FILTERED page that has not navigated yet, and its 15s of retries
    // are spent on a list that is correctly empty — MEASURED once on a production
    // server, where the click and the assertion land closer together than a dev
    // server ever let them.
    await page.getByRole('link', { name: /^All/ }).click()
    await page.waitForURL((url) => !url.search.includes('stage='), { timeout: 15_000 })
    await expect(page.getByRole('link', { name: CAMPAIGN })).toBeVisible()
  })

  test('the grid scrolls inside its own box and never sideways-scrolls the page', async ({
    page,
    signedIn: _signedIn,
  }) => {
    test.slow()

    // ── WHY THIS ASSERTS A SCROLL AND NOT A WIDTH ────────────────────────────
    // A guard on this app once asserted widths, offsets and overflow flags at six
    // viewports, went green everywhere, and shipped a rail rendering "S Sah".
    // `documentElement.scrollWidth` is also the wrong number here specifically:
    // it read 414 against a 380 client width even in states that were fine,
    // because a table inside a scroll box contributes to it either way. The only
    // honest question is the one a person on a phone asks — CAN I PUSH THE PAGE
    // SIDEWAYS — so this pushes it and reads how far it went.
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    // A post on two channels, so the grid has more columns than a phone can hold.
    // A BODY is written here where the old flow needed none: creation is lazy, so
    // a post with channels and no words is a post that was never created.
    await writePostOnTwoChannels(page, 'Two channels, so the grid has a column to scroll to.')

    await page.goto('/campaigns')
    await page.getByRole('button', { name: /^create campaign$/i }).click()
    await page.getByLabel('Name').fill(OVERFLOW_CAMPAIGN)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^create campaign$/i })
      .click()
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}/, { timeout: 30_000 })

    await page.getByRole('button', { name: /^add posts$/i }).click()
    const picker = page.getByRole('dialog')
    await picker.getByText('Untitled post').first().click()
    await picker.getByRole('button', { name: /add to campaign/i }).click()
    await expect(page.getByRole('table', { name: /every post in this campaign/i })).toBeVisible({
      timeout: 30_000,
    })

    await page.setViewportSize({ width: 390, height: 844 })

    const measured = await page.evaluate(() => {
      const box = document.querySelector('#main table')!.parentElement!
      // Push the DOCUMENT as far right as it will go, then read where it landed.
      window.scrollTo(9999, 0)
      const pageMoved = window.scrollX
      window.scrollTo(0, 0)
      // And the box must still scroll on its own — the fix must not have been
      // "make the grid narrower", which would hide columns instead of showing them.
      box.scrollLeft = 9999
      const boxMoved = box.scrollLeft
      box.scrollLeft = 0
      return { pageMoved, boxMoved }
    })

    expect(measured.pageMoved, 'the page must not scroll sideways on a phone').toBe(0)
    expect(
      measured.boxMoved,
      'the grid itself must still scroll to reach its columns',
    ).toBeGreaterThan(0)
  })
})

/**
 * ADS is designed and nothing on it runs. These assertions are the contract that
 * makes that safe rather than confusing.
 */
test.describe('ads is designed, not running @smoke', () => {
  const ROUTES = ['/ads', '/ads/creative', '/ads/targeting', '/ads/budget', '/ads/performance']

  test('every Ads screen loads, offers no fake control, and shows no invented figure', async ({
    page,
    signedIn: _signedIn,
  }) => {
    // Five routes, each compiled for the first time. See the note above.
    test.slow()
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await leaveOnboarding(page)

    for (const route of ROUTES) {
      await page.goto(route)
      const main = page.locator('#main')

      // The claim is made once per screen, at the top, before anything below it.
      await expect(main.getByText(/coming soon/i).first()).toBeVisible()

      // ── THE RULE THAT MATTERS MOST ─────────────────────────────────────────
      // A `<button disabled>` is still announced as a button, so it still offers
      // an action that does not exist. Every picture-of-a-control on these
      // screens is a div, so no disabled button may exist on any of them.
      const disabledButtons = main.locator('button:disabled, [aria-disabled="true"]')
      expect(
        await disabledButtons.count(),
        `${route} must not render a disabled control for an unbuilt feature`,
      ).toBe(0)

      // ── NO INVENTED FIGURES ────────────────────────────────────────────────
      // Ads is where a fake number is most tempting: a reach estimate, a CPM, a
      // spend total. `data-inert-control` marks every picture-of-a-control, and
      // not one of them may contain a digit.
      const inert = main.locator('[data-inert-control]')
      for (let i = 0; i < (await inert.count()); i += 1) {
        const text = await inert.nth(i).innerText()
        expect(text, `${route}: an inert control carries a figure — "${text}"`).not.toMatch(/\d/)
      }

      // Every tab is a real link to a real screen, so nothing here dead-ends.
      await expect(main.getByRole('navigation', { name: /ads sections/i })).toBeVisible()
    }
  })
})
