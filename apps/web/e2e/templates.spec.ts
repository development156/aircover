import { bootstrapWorkspace, SEED_BODY, startPost } from './fixtures/compose'
import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * Templates, end to end, against the real table.
 *
 * ── WHAT ONLY A BROWSER SHOWS ───────────────────────────────────────────────
 * `template-card.test.tsx` proves the count rule and `readTemplates` is a pure
 * read. Neither can show that a template SURVIVES — that the words reach the row,
 * come back after a reload, and can start a post through a surface that did not
 * write them. That round trip is the feature.
 *
 * The cross-tenant half is checked against the database directly, because a
 * browser can only ever be one workspace at a time and the question is what the
 * OTHER workspace can see.
 */

const NAME = `E2E template ${Date.now().toString(36)}`
const BODY = 'Fresh chai every morning at the corner shop.'

test.describe('templates @smoke', () => {
  test.slow()

  test('saves, survives a reload, and starts a post', async ({ page, signedIn }) => {
    void signedIn
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    await bootstrapWorkspace(page)
    await startPost(page, 'x')

    // ── 1. AN EMPTY LIBRARY IS AN EMPTY STATE, NOT A ZERO ────────────────────
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
    await expect(page.getByText(/\d+ saved/)).toHaveCount(0)

    // ── 2. SAVE THIS POST AS A TEMPLATE ─────────────────────────────────────
    //
    // Written into THE POST, not into one channel's version. A template is a
    // starting point for a piece of writing; a channel version is that writing
    // adapted to one platform's rules. Saving X's 280-character version as the
    // template every future post starts from would quietly make X authoritative
    // over LinkedIn and Instagram, which is the exact collapse this product
    // exists to avoid.
    await page.getByLabel('Your post', { exact: true }).fill(BODY)
    // The X version follows the post, so it holds these words too — and the box
    // is what proves the mirror reached the screen and not just the state.
    await expect(page.locator('[data-variant-editor="x"]')).toHaveValue(BODY)
    await page.locator('[data-template-save]').click()
    await page.getByLabel(/template name/i).fill(NAME)
    await page.getByRole('button', { name: /^save template$/i }).click()
    await expect(page.getByText(new RegExp(`Saved as .${NAME}`))).toBeVisible({ timeout: 20_000 })

    // The ROW, not the screen. A card that said "Saved" without a row is the
    // fake-success state this product refuses.
    const { data: saved } = await admin!
      .from('templates')
      .select('id, name, body, workspace_id')
      .eq('name', NAME)
      .maybeSingle()
    expect(saved).not.toBeNull()
    expect((saved as { body: string }).body).toBe(BODY)

    // ── 3. IT SURVIVES A RELOAD, AND THE COUNT NOW EXISTS ───────────────────
    await page.reload()
    await expect(page.getByText('1 saved')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(NAME)).toBeVisible()

    // ── 4. START A NEW POST FROM IT ─────────────────────────────────────────
    // A fresh post, so the template's words can only have come from the click.
    await startPost(page, 'linkedin')
    const secondPost = new URL(page.url()).pathname.split('/').pop() as string

    // ── WHERE A TEMPLATE LANDS, AND WHY IT IS NOT THE VERSION BOX ───────────
    // A template is a starting point for THE POST, not for one channel — so it
    // fills the post's own body. Every channel still following the post moves
    // with it, which is how the LinkedIn version comes to hold these words
    // without anyone typing them there.
    //
    // This asserted `''` until a bare channel tick stopped creating a row: the
    // fixture now has to WRITE something to reach a saved post, so the box
    // legitimately holds the fixture's own seed. Pinning the seed by name is
    // stronger than the `not.toHaveValue(BODY)` it could have become — it says
    // exactly what is in the box before the click, so "the template put these
    // words here" is still the only reading of the line after it.
    await expect(page.locator('[data-variant-editor="linkedin"]')).toHaveValue(SEED_BODY)
    await page.getByText(NAME).click()
    await expect(page.getByLabel('Your post', { exact: true })).toHaveValue(BODY)
    await expect(page.locator('[data-variant-editor="linkedin"]')).toHaveValue(BODY)
    await page
      .locator('[data-version-card="linkedin"]')
      .getByRole('button', { name: /^save linkedin copy$/i })
      .click()

    // ── 5. READ IT BACK THROUGH A SURFACE THAT DID NOT WRITE IT ─────────────
    await expect
      .poll(
        async () => {
          const { data } = await admin!
            .from('post_variants')
            .select('body')
            .eq('post_id', secondPost)
            .eq('channel', 'linkedin')
            .maybeSingle()
          return (data as { body: string } | null)?.body ?? null
        },
        { timeout: 20_000, message: 'the template body never reached the new post' },
      )
      .toBe(BODY)

    // Reloaded. The composer knows nothing about templates, so words that come
    // back from the server reached the row rather than living in React state.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'LinkedIn copy', exact: true })).toHaveValue(
      BODY,
    )

    // ── 6. DELETING THE TEMPLATE LEAVES THE POST ALONE ──────────────────────
    // There is no link to cascade along: a template is COPIED at the moment it is
    // used, and `posts` has no template_id. Asserted rather than assumed, because
    // the design that would break this is the obvious one.
    await admin!.from('templates').delete().eq('name', NAME)

    const { data: after } = await admin!
      .from('post_variants')
      .select('body')
      .eq('post_id', secondPost)
      .eq('channel', 'linkedin')
      .maybeSingle()
    expect((after as { body: string } | null)?.body).toBe(BODY)
  })
})
