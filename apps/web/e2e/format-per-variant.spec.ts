import { bootstrapWorkspace, saveVersionButton, startPost, versionBox } from './fixtures/compose'
import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * FORMAT IS A PROPERTY OF THE VARIANT, NOT THE POST — proved end to end.
 *
 * ── WHAT ONLY A BROWSER CAN SHOW ─────────────────────────────────────────────
 * The unit tests prove which formats are offered, what each one needs, and that
 * a refusal fires. None of them can show that two channels on ONE post hold two
 * DIFFERENT formats and two different bodies at the same time — which is the
 * whole architectural claim, and the exact thing the deleted wizard got wrong:
 * it collected one format on a Format step and wrote it to every variant, so a
 * carousel chosen for Instagram forced a carousel on X.
 *
 * ── AND WHY THE ROW IS READ WITH A SERVICE-ROLE CLIENT ───────────────────────
 * Because it is a surface that did not write them. Re-reading the composer's own
 * screen would only prove the composer agrees with itself; every value below is
 * read straight out of `post_variants` by a second client, after a reload.
 *
 * `post_variants.format` cannot ride along with the body — the compare-and-set
 * function applied to production has a fixed signature with no format among its
 * arguments — so the format is a SECOND write, and a second write is exactly the
 * kind of thing that silently does nothing.
 */

test.describe('two channels, two bodies, two limits, two formats @smoke', () => {
  test.slow()

  test('each channel keeps its own, through a reload and out the other side', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    await bootstrapWorkspace(page)
    const postId = await startPost(page, 'x')

    // Add LinkedIn alongside X. Two channels on one post, from here on.
    await page.locator('[data-channel-tile="linkedin"]').click()
    await expect(page.locator('[data-version-card="linkedin"]')).toBeVisible()

    // ── TWO LIMITS, ON SCREEN, AT THE SAME TIME ──────────────────────────────
    // X is 280 and LinkedIn is 3,000. Read as TEXT, not as a class: a meter that
    // rendered the right number in the wrong place would pass a numeric check.
    const xCard = page.locator('[data-version-card="x"]')
    const liCard = page.locator('[data-version-card="linkedin"]')
    await expect(xCard).toContainText('280')
    await expect(liCard).toContainText('3,000')

    // ── TWO BODIES ───────────────────────────────────────────────────────────
    const X_BODY = 'Chai. 4pm. Bring a friend.'
    const LI_BODY =
      'We opened at four this afternoon and stayed open late, which is a longer sentence than X would take, and that is the point of writing each channel its own.'
    await versionBox(page, 'X').fill(X_BODY)
    await versionBox(page, 'LinkedIn').fill(LI_BODY)

    // ── TWO DIFFERENT FORMATS ────────────────────────────────────────────────
    // X says text-only; LinkedIn says a set of photos. Different rows, different
    // answers, chosen on each channel's own card.
    await page.locator('[data-variant-format="x"]').selectOption('text')
    await page.locator('[data-variant-format="linkedin"]').selectOption('carousel')

    // Each card states what ITS format needs, before anything is attached.
    await expect(xCard.locator('[data-format-need="x"]')).toContainText('No photo')
    await expect(liCard.locator('[data-format-need="linkedin"]')).toContainText('Two or more')

    // ── SAVED ────────────────────────────────────────────────────────────────
    // Each card's OWN button, and each card's own confirmation.
    //
    // The first version of this waited on the commit bar's "Save all versions"
    // disappearing — which passes the instant the label is "Save this version"
    // instead, i.e. without anything being saved. It raced straight past the
    // write and read an empty row. A detector that passes for the wrong reason
    // is worse than none, and this one was mine.
    await saveVersionButton(page, 'x', 'X').click()
    await expect(xCard.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 })
    await saveVersionButton(page, 'linkedin', 'LinkedIn').click()
    await expect(liCard.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 })

    // ── RELOADED ─────────────────────────────────────────────────────────────
    await page.reload()
    await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
    await expect(versionBox(page, 'X')).toHaveValue(X_BODY)
    await expect(versionBox(page, 'LinkedIn')).toHaveValue(LI_BODY)
    await expect(page.locator('[data-variant-format="x"]')).toHaveValue('text')
    await expect(page.locator('[data-variant-format="linkedin"]')).toHaveValue('carousel')

    // ── READ BACK THROUGH A SURFACE THAT DID NOT WRITE THEM ──────────────────
    const { data, error } = await admin!
      .from('post_variants')
      .select('channel, body, format')
      .eq('post_id', postId)
    expect(error).toBeNull()

    const rows = Object.fromEntries(
      (data ?? []).map((r) => [r.channel as string, r as { body: string; format: string | null }]),
    )
    expect(rows.x?.body).toBe(X_BODY)
    expect(rows.linkedin?.body).toBe(LI_BODY)
    expect(rows.x?.format).toBe('text')
    expect(rows.linkedin?.format).toBe('carousel')
    // The claim, stated as the one assertion that would have failed under the
    // deleted wizard: the two rows do NOT hold the same format.
    expect(rows.x?.format).not.toBe(rows.linkedin?.format)
    expect(rows.x?.body).not.toBe(rows.linkedin?.body)
  })

  test('a channel is only offered the formats it can actually publish', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await bootstrapWorkspace(page)
    await startPost(page, 'instagram')

    const ig = page.locator('[data-variant-format="instagram"]')
    // Instagram has no text-only post — `requiresMedia` on the frozen engine —
    // and it is the only channel with a story.
    await expect(ig.locator('option[value="text"]')).toHaveCount(0)
    await expect(ig.locator('option[value="story"]')).toHaveCount(1)

    await page.locator('[data-channel-tile="x"]').click()
    const x = page.locator('[data-variant-format="x"]')
    await expect(x.locator('option[value="text"]')).toHaveCount(1)
    // X has no story, and no thread either — the thread is storable and
    // deliberately not offered, because the refusal gate cannot read one.
    await expect(x.locator('option[value="story"]')).toHaveCount(0)
    await expect(x.locator('option[value="thread"]')).toHaveCount(0)
    // And it says so, as a sentence rather than a disabled control.
    await expect(page.locator('[data-version-card="x"]')).toContainText('Threads are not built yet')
  })
})

test.describe('relink never loses written words @smoke', () => {
  test.slow()

  test('follows the post again, and gives the copy back', async ({ page, signedIn }) => {
    void signedIn
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    await bootstrapWorkspace(page)
    const postId = await startPost(page, 'x')

    const POST = 'Open till nine tonight.'
    const OWN = 'Open till 9. Chai on the house after 8.'
    const xCard = page.locator('[data-version-card="x"]')

    await page.getByLabel('Your post').fill(POST)
    // Typing into the channel detaches it — this is the state relink exists for.
    await versionBox(page, 'X').fill(OWN)
    await saveVersionButton(page, 'x', 'X').click()
    // Wait for the CARD to say it is saved, not for a bar to change wording.
    await expect(xCard.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 })

    // The post moves on. X does not follow it, because X is its own now.
    const NEW_POST = 'Closed tomorrow for Ganesh Chaturthi.'
    await page.getByLabel('Your post').fill(NEW_POST)
    await expect(versionBox(page, 'X')).toHaveValue(OWN)

    // ── RELINK ───────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: /follow the post again/i }).click()
    await expect(versionBox(page, 'X')).toHaveValue(NEW_POST)

    // NOTHING WAS WRITTEN. Read the row with the client that did not write it:
    // it still holds the words the writer typed.
    const before = await admin!
      .from('post_variants')
      .select('body')
      .eq('post_id', postId)
      .eq('channel', 'x')
      .single()
    expect(before.data?.body).toBe(OWN)

    // And the screen SAYS so, in those words — the promise that makes it
    // acceptable to replace the copy without asking first.
    await expect(page.getByText(/nothing was written/i)).toBeVisible()

    // ── UNDO ─────────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: /put my X copy back/i }).click()
    await expect(versionBox(page, 'X')).toHaveValue(OWN)
  })
})
