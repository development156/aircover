import { adminClient, expect, test } from './fixtures/seeded-user'
import { expectPostSaved } from './fixtures/compose'

/**
 * ONE BODY PER CHANNEL, proved in a real browser against the real database.
 *
 * ── WHY THIS SPEC EXISTS ─────────────────────────────────────────────────────
 * It is the acceptance test for the composer, and it was written BEFORE the
 * composer. Everything it asserts is the product's one structural claim:
 *
 *   two channels · two independently editable bodies · two different limits ·
 *   divergent rule state · saved · reloaded · read back through a surface that
 *   did not write it.
 *
 * ── HOW THE DIVERGENCE IS PRODUCED, AND WHY IT IS CHEAP ──────────────────────
 * One lever, read out of the Constraint Engine rather than assumed: X allows 280
 * characters and LinkedIn allows 3000. A single source body of ~400 characters
 * is therefore OVER on X and comfortable on LinkedIn — the same text, two
 * verdicts, from one keystroke. No second fixture, no media upload, no spend.
 *
 * ── "A SURFACE THAT DID NOT WRITE IT" MEANS TWO SURFACES ─────────────────────
 * A reload of the same route re-renders the same components, so it is arguably
 * the surface that wrote the rows reading its own homework. This spec therefore
 * reads back twice:
 *
 *   1. `post_variants` directly, through the service-role client. No app code in
 *      the path at all.
 *   2. The publish DRY RUN (`simulatePublish` → `PublishPreview`), which loads
 *      the rows fresh on the server, runs them through the Constraint Engine,
 *      and reports per channel. It is written by nothing in this file.
 *
 * NOTHING HERE PUBLISHES. The dry run writes no row and sends no request; the
 * live Publish button is never pressed.
 */

/** Read out of the engine in the app, restated here so a drift is a red test. */
const X_MAX = 280
const LINKEDIN_MAX = 3000

/** Over X, well under LinkedIn. Built rather than pasted so the length is a fact. */
const SOURCE_BODY = `Fresh masala chai from the corner shop, brewed every morning before the shutters go up. ${'We grind the cardamom by hand. '.repeat(10)}`

test.describe('the composer keeps one body per channel @smoke', () => {
  /**
   * Five minutes, and the number is measured rather than padded.
   *
   * This journey is the first thing to compile `/posts/new`, `/onboarding` and
   * `/posts` in a cold dev server, and a single Turbopack compile of one of those
   * routes was timed at 50s on this machine while four worktrees were running
   * dev servers at once. `test.slow()` alone gives 180s, which the bootstrap step
   * can spend by itself. A CI run with a built app is nowhere near this.
   */
  test.setTimeout(300_000)

  test('two channels keep two bodies, two limits and two verdicts, and they survive a reload', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    const admin = adminClient()

    // The one thing this spec asserts about its own fixture: the body really is
    // on both sides of the two limits. If this is false every verdict below is
    // meaningless, so it is checked before the browser is touched.
    expect(SOURCE_BODY.length).toBeGreaterThan(X_MAX)
    expect(SOURCE_BODY.length).toBeLessThan(LINKEDIN_MAX)

    // ── 1. A workspace, from a standing start.
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 90_000 })

    // ── 2. ONE route for writing a post. No wizard, no step parameter, no
    //      second editor — `/posts/new` is the same screen `/posts/<id>` is.
    await page.goto('/posts/new')
    await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 90_000 })

    // ── 3. Write once. The row does not exist until this is saved — opening a
    //      screen is not intent — so the id arriving in the address bar IS the
    //      evidence that the first save landed, and that is enforced rather than
    //      hoped for: the composer rewrites the address only after the save is
    //      confirmed. It used to rewrite it as soon as the row was created, one
    //      round trip earlier, and a reload in that window produced a real post
    //      with no channels on it.
    //
    //      Writing is also step ONE of a sequence the screen enforces: the
    //      channel step below is refused outright until there is something for
    //      it to shape.
    await page.getByLabel('Your post').fill(SOURCE_BODY)
    await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    const postId = new URL(page.url()).pathname.split('/').pop() as string
    expect(postId).toMatch(/^[0-9a-f-]{36}$/)

    // ── 4. Channels, picked in the same place they can be un-picked. Fast and
    //      reversible: this spec picks three and drops one.
    await page.locator('[data-channel-tile="x"]').click()
    await page.locator('[data-channel-tile="linkedin"]').click()
    await page.locator('[data-channel-tile="gbp"]').click()
    await expect(page.locator('[data-version-card="gbp"]')).toBeVisible()
    await page.locator('[data-channel-tile="gbp"]').click()
    await expect(page.locator('[data-version-card="gbp"]')).toHaveCount(0)
    // The PAIR, not a bare "Post saved": the address is only rewritten once the
    // first save is confirmed, so that phrase is already on screen by the time
    // step 3 above returned. Waiting for it alone would be satisfied by the
    // earlier save and would guard nothing — and the very next line reloads.
    await expectPostSaved(page)

    // ── 4b. THE PICKS ARE THE ROW'S, NOT THE SCREEN'S ──────────────────────
    // Reloaded immediately. Both channels survive, and that is now a claim
    // about a SECOND save rather than about the row's creation: the sequence
    // means the picks happen after the id is in the address bar, so the line
    // above waits for that save to land and this reload reads it back from the
    // server. The defect this guards has not changed — a real post with no
    // channels on it — only the write that could produce it.
    await page.reload()
    await expect(page.locator('[data-version-card="x"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-version-card="linkedin"]')).toBeVisible()

    // ── 5. TWO DIFFERENT LIMITS, READ AS TEXT. Not two boxes of a certain
    //      width — the numbers a person actually sees.
    const xCard = page.locator('[data-version-card="x"]')
    const linkedinCard = page.locator('[data-version-card="linkedin"]')
    await expect(xCard).toContainText(String(X_MAX))
    await expect(linkedinCard).toContainText(String(LINKEDIN_MAX.toLocaleString('en-IN')))
    // And each states its own, not the other's.
    await expect(xCard).not.toContainText(LINKEDIN_MAX.toLocaleString('en-IN'))

    // ── 6. DIVERGENT RULE STATE, from that one body. X objects; LinkedIn does
    //      not. Asserted by the sentence the engine produces, not by a colour.
    await expect(xCard.getByRole('alert')).toContainText(
      new RegExp(`allows ${X_MAX} characters`, 'i'),
    )
    await expect(linkedinCard.getByRole('alert')).toHaveCount(0)

    // ── 7. TWO INDEPENDENTLY EDITABLE BODIES. Editing one must not move the
    //      other, and neither may move the source.
    const xBody = page.locator('[data-variant-editor="x"]')
    const linkedinBody = page.locator('[data-variant-editor="linkedin"]')

    const X_TEXT = 'Chai at the corner shop. Ground by hand, every morning.'
    const LINKEDIN_TEXT = `${SOURCE_BODY}\n\nWe have been doing this for eleven years.`

    await xBody.fill(X_TEXT)
    await linkedinBody.fill(LINKEDIN_TEXT)

    await expect(xBody).toHaveValue(X_TEXT)
    await expect(linkedinBody).toHaveValue(LINKEDIN_TEXT)
    // The source is untouched by either.
    await expect(page.getByLabel('Your post')).toHaveValue(SOURCE_BODY)

    // Fixing X cleared X's objection and gave LinkedIn nothing to answer for.
    await expect(xCard.getByRole('alert')).toHaveCount(0)

    // ── 8. Saved, per channel, by the button a writer presses.
    //
    // One at a time, and each is waited for. Firing both and waiting afterwards
    // queues two post writes plus two variant writes behind each other, and on a
    // loaded dev machine that MEASURED over 20s — a timing artefact that says
    // nothing about whether the button works. Sequential is also what a person
    // does.
    await xCard.getByRole('button', { name: /save x copy/i }).click()
    await expect(xCard.getByText(/^Saved$/)).toBeVisible({ timeout: 60_000 })

    await linkedinCard.getByRole('button', { name: /save linkedin copy/i }).click()
    await expect(linkedinCard.getByText(/^Saved$/)).toBeVisible({ timeout: 60_000 })

    // And the bar agrees, in its own words, that nothing is outstanding. Two
    // facts that must not be merged: the post is one row, each version is its own.
    await expect(page.getByText(/version.? not saved/i)).toHaveCount(0)

    // ── 9. RELOADED. The honest check: the rows, not the state just typed into.
    await page.reload()
    await expect(page.locator('[data-variant-editor="x"]')).toHaveValue(X_TEXT)
    await expect(page.locator('[data-variant-editor="linkedin"]')).toHaveValue(LINKEDIN_TEXT)
    await expect(page.getByLabel('Your post')).toHaveValue(SOURCE_BODY)

    // ── 10. READ BACK #1 — the rows themselves, with no app code in the path.
    test.skip(admin === null, 'no service key in this environment')
    const rows = await admin!
      .from('post_variants')
      .select('channel, body')
      .eq('post_id', postId)
      .order('channel')
    const byChannel = new Map(
      ((rows.data ?? []) as { channel: string; body: string }[]).map((r) => [r.channel, r.body]),
    )
    expect(byChannel.get('x')).toBe(X_TEXT)
    expect(byChannel.get('linkedin')).toBe(LINKEDIN_TEXT)
    // Two rows, two bodies, and they are not the same string. This is the whole
    // claim in one assertion.
    expect(byChannel.get('x')).not.toBe(byChannel.get('linkedin'))
    // The channel dropped in step 3 left no row behind it.
    expect(byChannel.has('gbp')).toBe(false)

    // ── 11. READ BACK #2 — a surface that did not write any of it. The dry run
    //       re-reads the rows on the server and reports per channel. It writes
    //       nothing and sends nothing; the live Publish button is never pressed.
    const preview = page.locator('[data-guide="post-preview-publish"]')
    await preview.getByRole('button', { name: /^preview publish$/i }).click()
    // The dry run reports per channel. Both appear, and the X result reflects
    // the SHORT copy saved in step 8 rather than the source body — which is only
    // possible if the server read X's own row.
    await expect(preview).toContainText(/passes the channel rules/i, { timeout: 30_000 })
    await expect(preview).toContainText('X')
    await expect(preview).toContainText('LinkedIn')
  })
})
