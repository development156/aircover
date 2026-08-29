import { bootstrapWorkspace, startPost } from './fixtures/compose'
import { expect, test } from './fixtures/seeded-user'

/**
 * Saving one channel's copy, in a real browser, against the real database.
 *
 * ── THE GAP THIS FILLS ───────────────────────────────────────────────────────
 * `golden-path.spec.ts` types into the CANONICAL body, which `use-autosave`
 * writes through `savePost`. Nothing in the suite had ever pressed "Save
 * variant" — so `saveVariant`, the write that produces the row that actually
 * goes to a platform, had no browser coverage at all.
 *
 * That mattered the moment `saveVariant` gained a second path. The compare-and-set
 * added on 2026-08-19 only runs when the caller supplies a version, and the
 * version only exists once migration 20260819000000 is applied — which it is not.
 * So production takes the OLD path, and the old path is now reached through a
 * branch. If that branch ever inverted, every variant save in production would
 * call a database function that is not there, and the unit tests would not
 * notice: they mock the database, so the function exists in all of them.
 *
 * This one does not mock it. It runs against the schema production actually has.
 *
 * A CLASH IS DELIBERATELY NOT TESTED HERE. Detecting one needs the version
 * column, and a test written against a column that does not exist would either
 * fail every run or pass by never reaching its own assertions. The clash is
 * proven where it can be: the SQL is executed in
 * `packages/db/tests/post_variant_cas.pglite.test.ts`, and the screen's behaviour
 * in `src/components/posts/variant-conflict-flow.test.tsx`. The two-browser-context
 * journey in docs/23 becomes runnable the day the migration lands.
 */

test.describe('saving a channel variant @smoke', () => {
  test('writes the channel copy and it survives a reload', async ({ page, signedIn }) => {
    void signedIn

    // ── 1. A workspace, from a standing start.
    await bootstrapWorkspace(page)

    // ── 2. A post with Instagram picked, so the composer opens that channel's
    //      version card. No navigation follows: the card is already on screen.
    await startPost(page, 'instagram')

    // ── 3. The per-channel box — not the post's own body beside it.
    const copy = page.getByRole('textbox', { name: 'Instagram copy', exact: true })
    await expect(copy).toBeVisible()

    const written = 'Fresh chai, every morning, on the corner.'
    await copy.fill(written)

    // ── 4. Press the button a writer presses. Anchored, because the conflict
    //      notice's own "Use the saved version" also contains the word "saved".
    const save = page.getByRole('button', { name: /^save instagram copy$/i })
    await expect(save).toBeEnabled()
    await save.click()

    // The app's claim that the write landed, SCOPED to this channel's version
    // card — the composer shows one card per channel, so an unscoped match would
    // be satisfied by a sibling, and the conflict notice's "Use the saved
    // version" contains the word too.
    await expect(page.locator('[data-version-card="instagram"]').getByText(/^Saved$/)).toBeVisible({
      timeout: 60_000,
    })
    // ── AND IT IS A STATUS, NEVER AN ACTION ───────────────────────────────────
    // Kept from wt-screens, which is where this was found. The line above used to
    // read `getByRole('button', { name: /^saved$/i })`, which REQUIRED the
    // confirmation to be a disabled button — so the test pinned docs/26 §10.2's
    // defect in place as the correct behaviour, and any session fixing it would
    // have been told by a green suite that it had broken saving. A disabled
    // button is still announced as a button: the reader is offered "Saved,
    // button", takes it, and nothing happens.
    await expect(page.getByRole('button', { name: /^saved$/i })).toHaveCount(0)

    // Nothing was refused. A clash cannot happen here — there is one writer — so
    // this notice appearing would mean the version path fired against a database
    // with no version column.
    //
    // Named, rather than asserting the page carries no alerts at all: this editor
    // legitimately shows others — Instagram requires an image, and a post with no
    // image says so through the same role. "No alerts" would fail for reasons
    // that have nothing to do with saving.
    await expect(page.getByText(/Someone else saved the/i)).toHaveCount(0)

    // ── 5. The honest check: the row, re-read, not the state we just typed into.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Instagram copy', exact: true })).toHaveValue(
      written,
    )
  })
})
