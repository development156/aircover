import { bootstrapWorkspace, startPost } from './fixtures/compose'
import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * Choosing a format, against the real column.
 *
 * ── WHAT ONLY A BROWSER CAN SHOW HERE ────────────────────────────────────────
 * `format.test.ts` proves which formats are publishable, and `formatsFor` derives
 * what is offered from the channel's own spec. Neither can show that the choice
 * REACHES THE ROW — and that is the whole risk: `post_variants.format` cannot be
 * written through `saveVariant`, because the compare-and-set function applied to
 * production has a fixed signature with no format among its arguments and the row
 * schema that would carry one is frozen. The write is therefore a separate action,
 * and a separate action is exactly the kind of thing that silently does nothing.
 *
 * A control that collects an answer nothing acts on is the fake-success state
 * this product refuses. So this reads the column back.
 *
 * ── AND IT IS PER CHANNEL NOW ────────────────────────────────────────────────
 * The deleted wizard collected ONE format on a Format step and wrote it to every
 * variant, so a carousel chosen for Instagram forced a carousel on X. The column
 * was always per channel; the control now is too, and it lives on the channel's
 * own version card beside the body it describes.
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

    await bootstrapWorkspace(page)

    // X, so that "text only" is on offer — Instagram has no text-only post, and
    // `formatsFor` does not offer one there.
    const postId = await startPost(page, 'x')

    const select = page.locator('[data-variant-format="x"]')

    // NOTHING STATED is the starting answer — the state every post written before
    // the column existed is in, and the one that leaves publishing behaving
    // exactly as it did.
    await expect(select).toBeVisible()
    await expect(select).toHaveValue('')

    // Instagram's absent option is asserted from the other side: X offers text,
    // so the list is derived rather than hardcoded.
    await expect(select.locator('option[value="text"]')).toHaveCount(1)

    // Write the body first — the row has to exist before a format can sit on it,
    // and the variant save is what creates it.
    await page.locator('[data-variant-editor="x"]').fill('No picture needed for this one.')
    await page
      .locator('[data-version-card="x"]')
      .getByRole('button', { name: /^save x copy$/i })
      .click()
    await expect(page.locator('[data-version-card="x"]').getByText(/^Saved$/)).toBeVisible({
      timeout: 60_000,
    })

    await select.selectOption('text')

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
    await expect(page.locator('[data-variant-format="x"]')).toHaveValue('text')

    // Clearing is a real answer too: a writer who picked by accident must be able to
    // get back to "nobody has said", or publishing holds them to it for good.
    await page.locator('[data-variant-format="x"]').selectOption('')
    await expect(page.locator('[data-variant-format="x"]')).toHaveValue('')

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
