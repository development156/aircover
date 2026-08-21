import { expectPostSaved, startPost } from './fixtures/compose'
import { makePng } from './fixtures/png'
import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * The media library, end to end, in a real browser against the real database.
 *
 *   fresh account → workspace → upload a real photo → RELOAD → attach it to a
 *   post from the composer → read it back on a screen that did not write it →
 *   try to delete it while a scheduled post depends on it.
 *
 * ── WHAT "READ IT BACK THROUGH A SURFACE THAT DID NOT WRITE IT" MEANS HERE ───
 * The composer writes the attachment. The LIBRARY reads the usage record, and
 * that record is written by a database trigger on `post_media` rather than by
 * either screen. So when /assets says "In 1 post" and names it, three
 * independent things have agreed: the composer's insert, the trigger, and the
 * library's own four-query read. A test that asserted the composer's own pane
 * would prove only that React re-rendered.
 *
 * ── WHY THIS IS NOT TAGGED @smoke ────────────────────────────────────────────
 * It uploads bytes to real storage and it is slower than the gate wants. It is
 * run explicitly. The gate's `--grep @smoke` deliberately does not pick it up.
 */

/**
 * A real 320×320 PNG — Instagram's `imageDims` floor, so the journey's post can
 * actually accept it.
 *
 * The first version of this fixture was 8×8, and the Constraint Engine refused
 * it at attach. That refusal was CORRECT and is now asserted below on its own
 * fixture: a photo too small for the post's channel must not reach the post, and
 * a test that never sees that happen has not tested it.
 */
const PHOTO = makePng(320, 320)

/** Too small for Instagram. Fine in a library; refused on the post. */
const TINY_PHOTO = makePng(8, 8, [20, 20, 20])

/** A file that is NOT an image, to prove the refusal is real. */
const NOT_AN_IMAGE = Buffer.from('this is plain text, not a photo at all', 'utf8')

async function bootstrapWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await expect(create).toBeVisible({ timeout: 30_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
}

test.describe('media library', () => {
  test('a photo is uploaded, survives a reload, reaches a post, and cannot then be deleted', async ({
    page,
    signedIn,
  }) => {
    test.setTimeout(180_000)

    await bootstrapWorkspace(page)

    // ── 1. An empty library says it is empty, and does not pretend otherwise ──
    await page.goto('/assets')
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible()
    await expect(page.getByText('Your library is empty')).toBeVisible()

    // ── 2. Upload a real file ────────────────────────────────────────────────
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'shopfront.png',
      mimeType: 'image/png',
      buffer: PHOTO,
    })
    await expect(page.getByText('Added 1 photo.')).toBeVisible({ timeout: 60_000 })

    // ── 3. RELOAD. In-memory state proves nothing about storage. ─────────────
    await page.reload()
    await expect(page.getByRole('button', { name: /shopfront\.png/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Not used yet')).toBeVisible()

    // The preview is a signed URL against a PRIVATE bucket, and it really loads.
    const thumb = page.locator('img[alt*="shopfront.png"]').first()
    await expect(thumb).toBeVisible()
    const loaded = await thumb.evaluate(
      (img) => (img as HTMLImageElement).naturalWidth > 0 && (img as HTMLImageElement).complete,
    )
    expect(loaded, 'the signed preview URL actually served bytes').toBe(true)

    // ── 4. A refusal that is a real refusal ──────────────────────────────────
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'notes.txt',
      mimeType: 'image/png', // the browser's claim; the server sniffs the bytes
      buffer: NOT_AN_IMAGE,
    })
    await expect(page.getByText(/not an image type the channels accept/i)).toBeVisible({
      timeout: 60_000,
    })

    // ── 5. A post to put it on ───────────────────────────────────────────────
    // Through the shared helper, not hand-rolled. This block drove
    // `/create/post` -> tile -> **Continue** and read the id out of a `?post=`
    // query string; wt-composer deleted that wizard, made `/create/post` a
    // redirect and moved the id into the PATH. Neither of this file's two
    // wizard blocks is inside an @smoke describe, so the gate would never have
    // reported them — they would have sat broken and unrun.
    const postId = await startPost(page, 'instagram')

    const title = page.getByLabel(/title/i).first()
    await title.fill('Diwali offer')
    // The composer names the POST, because the bar reports the post and its
    // versions separately: "All changes saved" is the deleted editor's copy. And
    // `expectPostSaved` rather than a bare check, because `startPost` has already
    // saved once to create the row — see that helper for what was measured.
    await expectPostSaved(page)

    // ── 6. Attach FROM THE LIBRARY, through the composer's media panel ───────
    await page.getByRole('button', { name: /choose from library/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /shopfront\.png/i }).click()

    // The modal CLOSES on success. Asserting the file name alone would have
    // passed while the picker was still open showing a refusal — which is
    // exactly what the first run of this spec did.
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    // The composer's own pane now lists it, UNDER THE NAME THE PERSON GAVE —
    // not the storage uuid, which is what it showed before `readLibraryNames`.
    //
    // `> ul > li` is a DIRECT-child selector on purpose: the picker's own tiles
    // are list items too and stay in the DOM behind the closed dialog, so a
    // descendant match resolves to two elements and Playwright's strict mode
    // (rightly) refuses to guess which one the assertion meant.
    const attached = page.locator('[data-guide="post-media"] > ul > li')
    await expect(attached).toHaveCount(1, { timeout: 30_000 })
    await expect(attached.getByText('shopfront.png')).toBeVisible()

    // ── 7. Read it back on a screen that did not write it ────────────────────
    // /assets reads `asset_usages`, which the DATABASE TRIGGER wrote from the
    // composer's insert. Neither screen wrote that row.
    await page.goto('/assets')
    await expect(page.getByText('In 1 post')).toBeVisible({ timeout: 30_000 })

    // ── 8. Detaching from the post must NOT destroy the library file ─────────
    await page.goto(`/posts/${postId}`)
    await page.getByRole('button', { name: /^remove shopfront\.png$/i }).click()
    await page.getByRole('button', { name: /confirm remove/i }).click()
    await page.goto('/assets')
    // Still in the library, and back to unused.
    await expect(page.getByRole('button', { name: /shopfront\.png/i })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText('Not used yet')).toBeVisible()

    // ── 8b. A photo too small for this post's channel is REFUSED, by name ────
    // The library keeps it — a library is not a post — but Instagram's
    // `imageDims` floor is 320×320 and this one is 8×8, so it cannot go on.
    await page.goto('/assets')
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'too-small.png',
      mimeType: 'image/png',
      buffer: TINY_PHOTO,
    })
    await expect(page.getByText(/Added 1 photo\./)).toBeVisible({ timeout: 60_000 })

    await page.goto(`/posts/${postId}`)
    await page.getByRole('button', { name: /choose from library/i }).click()
    const dialog2 = page.getByRole('dialog')
    await dialog2.getByRole('button', { name: /too-small\.png/i }).click()
    await expect(
      page.getByRole('alert').filter({ hasText: /no channel on this post can use it/i }),
    ).toBeVisible({ timeout: 30_000 })

    // Re-attach the real photo for the delete-gate half.
    await page.goto(`/posts/${postId}`)
    await page.getByRole('button', { name: /choose from library/i }).click()
    const dialog3 = page.getByRole('dialog')
    await dialog3.getByRole('button', { name: /shopfront\.png/i }).click()
    await expect(dialog3).toBeHidden({ timeout: 30_000 })

    // ── 9. THE DELETE GATE ───────────────────────────────────────────────────
    // The post is moved to `scheduled` directly, because this run is forbidden
    // from executing a publish and does not need one: the gate reads the status.
    const admin = adminClient()
    test.skip(admin === null, 'no service key — the scheduled fixture cannot be made')
    if (admin !== null) {
      const moved = await admin
        .from('posts')
        .update({ status: 'scheduled', scheduled_at: new Date(Date.now() + 864e5).toISOString() })
        .eq('id', postId as string)
        .select('id, status')
      expect(moved.error, moved.error?.message ?? '').toBeNull()
      expect(moved.data?.[0]?.status).toBe('scheduled')
    }

    await page.goto('/assets')
    // The tile says so before anyone presses anything.
    await expect(page.getByText('In use')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: /shopfront\.png/i }).click()
    await page.getByRole('button', { name: /^delete shopfront\.png$/i }).click()

    // The refusal, naming the post BY TITLE and saying why.
    const refusal = page.getByRole('alert').filter({ hasText: /cannot lose it/i })
    await expect(refusal).toBeVisible({ timeout: 30_000 })
    await expect(refusal).toContainText('Diwali offer')
    await expect(refusal).toContainText('scheduled to go out')
    // eslint-disable-next-line no-console
    console.log('[assets] REFUSAL:', (await refusal.innerText()).replace(/\s+/g, ' '))

    // And the file is still there after the refusal.
    await page.reload()
    await expect(page.getByRole('button', { name: /shopfront\.png/i })).toBeVisible({
      timeout: 30_000,
    })

    // ── 10. Unlock it, and the delete goes through with a NAMED warning ──────
    if (admin !== null) {
      await admin
        .from('posts')
        .update({ status: 'draft' })
        .eq('id', postId as string)
    }
    await page.reload()
    await page.getByRole('button', { name: /shopfront\.png/i }).click()
    await page.getByRole('button', { name: /^delete shopfront\.png$/i }).click()

    // By NAME, not by contained text. The confirm modal is mounted INSIDE the
    // detail drawer, so both are `role=dialog` and `filter({hasText})` matches
    // the outer one — which contains the modal's markup even while it is closed.
    // That version of this assertion passed against the drawer and proved
    // nothing about the modal.
    const confirm = page.getByRole('dialog', { name: /^Delete/ })
    await expect(confirm).toBeVisible({ timeout: 30_000 })
    await expect(confirm).toContainText('Diwali offer')
    await expect(confirm).toContainText(/removes it from 1 post/i)
    await confirm.getByRole('button', { name: /delete and remove/i }).click()

    // `too-small.png` is still there, so the library is not empty — the one
    // photo the gate was about is gone and nothing else moved.
    await expect(page.getByRole('button', { name: /shopfront\.png/i })).toHaveCount(0, {
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: /too-small\.png/i })).toBeVisible()
  })
})

/**
 * The library at the two widths and both themes the design system is written
 * against, with real content on the screen.
 *
 * A screenshot of an empty screen proves nothing about layout, so this seeds a
 * file first. `shell-widths.spec.ts` reads TEXT rather than box sizes for the
 * shell; this one is the visual record for the library itself.
 */
test.describe('media library · widths and themes', () => {
  for (const [label, width, height] of [
    ['390', 390, 844],
    ['1024', 1024, 768],
    ['1440', 1440, 900],
  ] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`renders at ${label} · ${theme}`, async ({ page, signedIn }) => {
        test.setTimeout(120_000)
        await page.setViewportSize({ width, height })
        await bootstrapWorkspace(page)

        await page.goto('/assets')
        await page
          .locator('input[type="file"]')
          .first()
          .setInputFiles([
            { name: 'shopfront.png', mimeType: 'image/png', buffer: PHOTO },
            { name: 'menu-board.png', mimeType: 'image/png', buffer: PHOTO },
          ])
        await expect(page.getByText(/Added 2 photos\./)).toBeVisible({ timeout: 60_000 })

        await page.evaluate((mode) => {
          document.documentElement.setAttribute('data-theme', mode)
        }, theme)
        await page.reload()
        await page.evaluate((mode) => {
          document.documentElement.setAttribute('data-theme', mode)
        }, theme)

        await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText('2 files')).toBeVisible()

        // A viewport capture, not fullPage: `position: fixed` chrome renders at
        // its scroll offset in a full-page shot, so the mobile bottom bar would
        // appear inlined halfway down the document (docs/26 §11).
        await page.screenshot({ path: `e2e-artifacts/assets-${label}-${theme}.png` })

        // The page must never scroll sideways. Wide content scrolls inside its
        // own container; the body does not.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1)

        // ── The detail drawer, where the delete gate lives ────────────────────
        await page.getByRole('button', { name: /shopfront\.png/i }).click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
        await page.screenshot({ path: `e2e-artifacts/asset-detail-${label}-${theme}.png` })
        await page.keyboard.press('Escape')

        // ── The composer's media panel, the other screen this changed ─────────
        // Same retarget as above: the composer IS the post screen, so there is
        // no second navigation to it.
        await startPost(page, 'instagram')
        await page.evaluate((mode) => {
          document.documentElement.setAttribute('data-theme', mode)
        }, theme)

        const pane = page.locator('[data-guide="post-media"]')
        await expect(pane.getByRole('button', { name: /choose from library/i })).toBeVisible({
          timeout: 30_000,
        })
        await pane.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `e2e-artifacts/composer-media-${label}-${theme}.png` })

        // And the picker itself, which is where a photo is actually chosen.
        await pane.getByRole('button', { name: /choose from library/i }).click()
        await expect(page.getByRole('dialog', { name: /choose a photo/i })).toBeVisible({
          timeout: 15_000,
        })
        await page.screenshot({ path: `e2e-artifacts/library-picker-${label}-${theme}.png` })
      })
    }
  }
})

/**
 * THE GUARANTEE INHERITED FROM `coming-soon-unchanged.spec.ts`.
 *
 * That spec used to hold `/assets` to "every figure is still an em dash",
 * because nothing read the tables. It reads them now, so that sentence stopped
 * describing this screen — but what it PROTECTED has not changed and must not be
 * lost with it: an empty library may not render a count of the customer's files.
 *
 * `0 files` and "Your library is empty" read very differently to a person. The
 * first is a measurement of their business, and on a screen that has only just
 * started querying, it is the measurement most likely to be wrong.
 *
 * Tagged @smoke so the gate keeps holding it, at both widths, exactly as the
 * spec it came from did.
 */
test.describe('an empty library claims nothing @smoke', () => {
  test.slow()

  test('says it is empty and shows no count of the customer’s files', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    test.setTimeout(120_000)
    await bootstrapWorkspace(page)

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/assets')

      await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Your library is empty')).toBeVisible()

      const main = (await page.locator('#main').innerText()).replace(/\s+/g, ' ')

      // No count of THEIR files, in any of the shapes this screen could produce.
      expect(main, `a file count at ${width}px: ${main.slice(0, 300)}`).not.toMatch(
        /\b\d+\s+files?\b/i,
      )
      expect(main).not.toMatch(/\bIn \d+ posts?\b/i)
      expect(main).not.toMatch(/\b0\b/)

      // The upload ceiling IS allowed to be a number: it is a fact about the
      // channels, stated before anyone spends anything, not a claim about the
      // reader. Asserted so the check above can never be "tightened" into
      // banning every digit and quietly deleting this sentence.
      await expect(page.getByText(/up to \d+ MB each/i)).toBeVisible()
    }
  })
})
