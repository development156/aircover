import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * "Performance over time", now that the history table exists.
 *
 * ── WHAT CHANGED, AND WHY THE OLD VERSION OF THIS FILE HAD TO GO ─────────────
 * Until 2026-08-19 this spec asserted the card said Sahoda "does not keep a
 * history yet". That sentence was true, and the migration made it false — so the
 * test went red the moment the table appeared, which is exactly what it was for.
 * A read that could not distinguish those two states would have gone on saying it.
 *
 * Three states are reachable now and all three are checked here, in a real
 * browser, against the real database:
 *
 *   · the table exists and holds nothing for this workspace — a NEW state, and the
 *     one every customer is in on the day the migration lands;
 *   · one or two measured days — the floor from run 17, which refuses to draw a
 *     line through two readings because two points imply a rate of change that
 *     neither of them measured;
 *   · three measured days — a chart.
 *
 * The history is SEEDED here rather than collected, and deliberately: the nightly
 * pass can only measure posts that really published, and a test that waited for
 * that would be testing Zernio's schedule. What is under test is the read and the
 * floor, and both take rows as their input. That the JOB writes real rows is
 * proven separately, by running it against production and reading them back.
 */

/** Same shape the capture job writes. Service role — test scaffolding only. */
async function seedDay(
  postId: string,
  workspaceId: string,
  day: string,
  value: number,
): Promise<void> {
  const admin = adminClient()
  if (!admin) return
  const { error } = await admin.from('post_metric_snapshots').insert({
    workspace_id: workspaceId,
    post_id: postId,
    channel: 'instagram',
    metric: 'reach',
    value,
    measured_at: `${day}T09:00:00Z`,
  })
  if (error) throw new Error(`could not seed ${day}: ${error.message}`)
}

test.describe('the performance-over-time card @smoke', () => {
  // A cold dev server compiles sign-in, home, onboarding and analytics before the
  // journey starts, and this one reloads the page three times.
  test.slow()

  test('says nothing measured, then refuses two points, then draws three', async ({
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

    await page.goto('/create/post')
    await page.locator('[data-channel-tile="instagram"]').click()
    await page.getByRole('button', { name: /^continue/i }).click()
    await page.waitForURL(/[?&]post=[0-9a-f-]{36}/, { timeout: 30_000 })
    const postId = new URL(page.url()).searchParams.get('post') as string

    const { data: post } = await admin!
      .from('posts')
      .select('workspace_id')
      .eq('id', postId)
      .single()
    const workspaceId = (post as { workspace_id: string }).workspace_id

    // ── 1. THE TABLE IS THERE AND HOLDS NOTHING ───────────────────────────────
    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/has started keeping a history/i)).toBeVisible()
    // NOT the old sentence. Saying "does not keep a history yet" once the table
    // exists would describe the product rather than this workspace.
    await expect(page.getByText(/does not keep a history yet/i)).toHaveCount(0)
    // And not a fault either — nothing failed, there is simply nothing yet.
    await expect(page.getByText(/could not read the history/i)).toHaveCount(0)

    // ── 2. TWO DAYS IS NOT A TREND ────────────────────────────────────────────
    await seedDay(postId, workspaceId, '2026-08-17', 100)
    await seedDay(postId, workspaceId, '2026-08-18', 140)
    await page.reload()

    await expect(page.getByText(/2 days measured so far/i)).toBeVisible()
    await expect(page.getByText(/shows a direction neither of them measured/i)).toBeVisible()
    // No chart. A line between two readings is the thing the floor exists to refuse.
    await expect(page.getByRole('img', { name: /measured days/i })).toHaveCount(0)

    // ── 3. THREE DAYS IS ──────────────────────────────────────────────────────
    await seedDay(postId, workspaceId, '2026-08-19', 190)
    await page.reload()

    await expect(page.getByText(/3 measured days/i)).toBeVisible()
    await expect(page.getByRole('img', { name: /measured days/i })).toBeVisible()
    // Named as what it is. A reader who takes these for per-day figures would
    // subtract them, and the difference is a number no platform ever reported.
    await expect(page.getByText(/running total since each post went out/i)).toBeVisible()
    await expect(page.getByText(/2 days measured so far/i)).toHaveCount(0)
  })
})
