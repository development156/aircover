import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * Choosing a format, against the real column.
 *
 * ── WHAT ONLY A BROWSER CAN SHOW HERE ────────────────────────────────────────
 * `step-format.test.tsx` proves which formats are offered, and
 * `format.test.ts` proves which are publishable. Neither can show that the choice
 * REACHES THE ROW — and that is the whole risk: `post_variants.format` cannot be
 * written through `saveVariant`, because the compare-and-set function applied to
 * production has a fixed signature with no format among its arguments and the row
 * schema that would carry one is frozen. The write is therefore a separate action,
 * and a separate action is exactly the kind of thing that silently does nothing.
 *
 * A step that collects an answer nothing acts on is the fake-success state this
 * product refuses. So this reads the column back.
 */

test.describe('the format reaches the row @smoke', () => {
  test.slow()

  test('a chosen format is stored, and clearing it puts the row back', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    // X, so that "text only" is on offer — Instagram has no text-only post.
    await page.goto('/create/post')
    await page.locator('[data-channel-tile="x"]').click()
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/[?&]post=[0-9a-f-]{36}/, { timeout: 30_000 })
    const postId = new URL(page.url()).searchParams.get('post') as string

    // On the Format step, nothing is chosen — the state every post written before
    // today is in, and the one that leaves publishing behaving exactly as it did.
    await expect(page.locator('[data-format="text"]')).toBeVisible()
    await expect(page.locator('[data-format="text"]')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText(/Nothing chosen/i)).toBeVisible()

    // Choose text-only, then write the body — the save is what creates the row, and
    // the format rides along with it.
    await page.locator('[data-format="text"]').click()
    await expect(page.locator('[data-format="text"]')).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/step=content/, { timeout: 30_000 })
    await page.locator('[data-variant-editor="x"]').fill('No picture needed for this one.')
    await page.locator('[data-variant-editor="x"]').blur()

    // ── THE ASSERTION THAT MATTERS: THE COLUMN, NOT THE SCREEN ────────────────
    await expect
      .poll(
        async () => {
          const { data } = await admin!
            .from('post_variants')
            .select('format, body')
            .eq('post_id', postId)
            .eq('channel', 'x')
            .maybeSingle()
          return (data as { format: string | null } | null)?.format ?? null
        },
        { timeout: 20_000, message: 'the chosen format never reached post_variants.format' },
      )
      .toBe('text')

    // And it survives a reload rather than living in React state.
    await page.reload()
    await page.goto(`/create/post?step=format&post=${postId}`)
    await expect(page.locator('[data-format="text"]')).toHaveAttribute('aria-checked', 'true')

    // Clearing is a real answer too: a writer who picked by accident must be able to
    // get back to "nobody has said", or publishing holds them to it for good.
    await page.locator('[data-format="text"]').click()
    await expect(page.getByText(/Nothing chosen/i)).toBeVisible()

    await expect
      .poll(
        async () => {
          const { data } = await admin!
            .from('post_variants')
            .select('format')
            .eq('post_id', postId)
            .eq('channel', 'x')
            .maybeSingle()
          // NOT `?? 'STILL-SET'` — that is the trap this repo keeps meeting. `??`
          // fires on null, so the sentinel would replace the very value being
          // asserted and the check could never pass. Presence of the ROW is what
          // the sentinel is for, so it is decided on the row, not on the field.
          if (data === null) return 'NO-ROW'
          return (data as { format: string | null }).format
        },
        { timeout: 20_000, message: 'clearing the format did not reach the row' },
      )
      .toBeNull()
  })
})
