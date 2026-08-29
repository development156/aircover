import { bootstrapWorkspace, startPost } from './fixtures/compose'
import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * THE MARKETING BRAIN ON A CUSTOMER'S SCREEN.
 *
 * ── WHAT THIS PROVES THAT THE UNIT TESTS CANNOT ──────────────────────────────
 * `tone-drift.test.ts` proves the arithmetic and its floors;
 * `marketing_observations.pglite.test.ts` proves who may read the row. Neither
 * touches the thing a customer actually experiences: that an observation written
 * by the weekly pass appears on /report, with its numbers under it, in a real
 * browser against the real database.
 *
 * ── THE TWO STATES, AND WHY THE EMPTY ONE IS THE IMPORTANT ONE ───────────────
 * Every workspace is in the empty state on the day this ships, and the sentence
 * it gets must not read as a fault. "Sahoda has noticed nothing" and "Sahoda
 * could not look" are different claims with different remedies, and the block
 * has to make the first without ever making the second. That is the half a
 * screenshot would not catch and a passing render would hide.
 *
 * The row is SEEDED rather than computed, deliberately: the pass can only speak
 * about posts that really published over months, and a test that waited for that
 * would be testing the calendar. What is under test is the read and the render.
 *
 * ── IT SKIPS UNTIL THE MIGRATION IS APPLIED, AND SAYS SO ────────────────────
 * `20260825000000_marketing_observations.sql` is written and deliberately NOT
 * applied: applying a migration to the one live database is a founder action,
 * and there is no staging. Until it is applied this spec cannot insert a row, so
 * it skips with the migration named in the reason.
 *
 * A silent skip is the failure this project has already paid for once —
 * twenty-six billing tests that never executed for months and reported green the
 * whole time. So the skip is conditional on the TABLE, not on a flag somebody
 * could forget to unset: the day the migration lands, this runs, with no edit
 * here and nobody having to remember it exists.
 */

const EVIDENCE = {
  data: [
    { label: 'Exclamation marks per post, earlier', value: 1.4, unit: 'per_post' },
    { label: 'Exclamation marks per post, since', value: 0, unit: 'per_post' },
    { label: 'Posts compared', value: 12, unit: 'count' },
  ],
  postIds: ['00000000-0000-4000-8000-000000000001'],
  windowDays: 64,
}

test.describe('@smoke the Marketing Brain', () => {
  test('says nothing yet without calling it a fault, then shows the claim with its numbers', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    await bootstrapWorkspace(page)
    const postId = await startPost(page, 'instagram')
    const { data: post } = await admin!
      .from('posts')
      .select('workspace_id')
      .eq('id', postId)
      .single()
    const workspaceId = (post as { workspace_id: string }).workspace_id

    // Probes the table itself rather than a flag: see the header. `head: true`
    // asks for no rows, so this costs a round trip and reads nothing.
    const probe = await admin!
      .from('marketing_observations')
      .select('id', { head: true, count: 'exact' })
    test.skip(
      probe.error !== null,
      'marketing_observations is not in this database yet — apply 20260825000000_marketing_observations.sql',
    )

    // ── 1. NOTHING NOTICED YET ────────────────────────────────────────────────
    await page.goto('/report')
    await expect(page.getByRole('heading', { name: 'CMO Report', level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    const block = page.getByRole('heading', { name: 'What I noticed on my own' })
    await expect(block).toBeVisible()
    // It names the FLOOR, so the reader knows what would change it.
    await expect(page.getByText(/takes a run of posts, not a few/i)).toBeVisible()
    // And it never claims a failure. This is the assertion that would catch a
    // read error being rendered as an absence.
    await expect(page.getByText(/couldn.t read what it has noticed/i)).toHaveCount(0)

    // ── 2. AN OBSERVATION, WITH ITS RECEIPT ───────────────────────────────────
    const { error } = await admin!.from('marketing_observations').insert({
      workspace_id: workspaceId,
      kind: 'tone_drift',
      subject: 'exclamation_marks',
      claim:
        'You have stopped using exclamation marks. 1.4 per post across your 6 earlier posts, none in the 6 since.',
      evidence: EVIDENCE,
      computed_on: '2026-08-23',
    })
    expect(error).toBeNull()

    await page.reload()
    await expect(page.getByText(/You have stopped using exclamation marks/i)).toBeVisible({
      timeout: 30_000,
    })
    // The arithmetic, on the page rather than in a tooltip. This is the whole
    // difference between Sahoda and an agency asserting the same sentence.
    await expect(page.getByText('Exclamation marks per post, earlier')).toBeVisible()
    await expect(page.getByText(/Sahoda did not ask a model for this/i)).toBeVisible()
    // The floor sentence is gone now that there is something to say.
    await expect(page.getByText(/takes a run of posts, not a few/i)).toHaveCount(0)
  })
})
