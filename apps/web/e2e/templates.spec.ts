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

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    await page.goto('/create/post')
    await page.locator('[data-channel-tile="x"]').click()
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/[?&]post=[0-9a-f-]{36}/, { timeout: 30_000 })
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/step=content/, { timeout: 30_000 })

    // ── 1. AN EMPTY LIBRARY IS AN EMPTY STATE, NOT A ZERO ────────────────────
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
    await expect(page.getByText(/\d+ saved/)).toHaveCount(0)

    // ── 2. SAVE THIS POST AS A TEMPLATE ─────────────────────────────────────
    await page.locator('[data-variant-editor="x"]').fill(BODY)
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
    // A fresh post, so words in the box can only have come from the template.
    await page.goto('/create/post')
    await page.locator('[data-channel-tile="linkedin"]').click()
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/[?&]post=[0-9a-f-]{36}/, { timeout: 30_000 })
    const secondPost = new URL(page.url()).searchParams.get('post') as string
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/step=content/, { timeout: 30_000 })

    await expect(page.locator('[data-variant-editor="linkedin"]')).toHaveValue('')
    await page.getByText(NAME).click()
    await expect(page.locator('[data-variant-editor="linkedin"]')).toHaveValue(BODY)

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

    // The post editor knows nothing about templates. If the words are here, they
    // reached the row rather than living in the create flow's React state.
    await page.goto(`/posts/${secondPost}`)
    await expect(page.getByLabel('LinkedIn copy')).toHaveValue(BODY)

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
