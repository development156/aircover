import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * ONE OBSERVATION → A DRAFT A PERSON APPROVES, END TO END.
 *
 * ── THIS SPENDS REAL CREDITS AND CALLS A REAL MODEL, SO IT IS NOT `@smoke` ──
 * The gate runs on every change and a gate that costs money every time is a gate
 * people learn to skip — the same reasoning that keeps `assets.spec.ts` out of
 * the tag. It is run deliberately, with `RADAR_FIXTURES=1` on the server.
 *
 * ── WHAT IT ACTUALLY PROVES ─────────────────────────────────────────────────
 * That the whole claim of P3 holds against a live ledger and a live provider:
 *
 *   1. the price is on the button BEFORE the click — read off the DOM, not
 *      asserted from `creditCost()`, which would just be the same lookup twice;
 *   2. the balance really moves by that amount, read from the wallet;
 *   3. what arrives is a DRAFT, with `status = 'draft'` in the row itself —
 *      never scheduled, never published;
 *   4. and the draft's body carries the OBSERVATION and not the inference,
 *      because a hatched sentence expanded into a caption loses its hatch.
 */

test.describe('a Radar change becomes a draft', () => {
  test('the cost is shown, then charged, and the output is a draft', async ({ page, signedIn }) => {
    test.setTimeout(300_000)
    const admin = adminClient()
    if (!admin) test.skip(true, 'needs the service-role key')
    if (!admin) return

    await page.goto('/home')
    const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
    if (await create.count()) {
      await create.click()
      await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    }

    const { data: ws } = await admin
      .from('workspaces')
      .select('id')
      .eq('created_by', signedIn.clerkUserId)
      .limit(1)
    const workspaceId = ws?.[0]?.id as string | undefined
    if (!workspaceId) throw new Error('workspace bootstrap did not produce a row')

    // A connected channel, because the panel refuses to offer a spend it cannot
    // fulfil — with nothing connected it renders a link to /connections instead
    // of a button, which is the correct behaviour and not what is under test.
    const { error: connError } = await admin.from('connections').insert({
      workspace_id: workspaceId,
      platform: 'instagram',
      status: 'connected',
      external_account: { id: 'c'.repeat(24), profileId: 'd'.repeat(24) },
      created_by: signedIn.clerkUserId,
    })
    if (connError) throw new Error(`staging the connection failed: ${connError.message}`)

    await page.goto('/radar')
    await expect(page.getByRole('heading', { name: 'Radar', level: 1 })).toBeVisible({
      timeout: 60_000,
    })

    // ── 1 · THE PRICE IS ON THE BUTTON BEFORE ANYTHING IS SPENT ───────────
    const button = page.getByRole('button', { name: /draft a reply to sunrise bakery/i })
    await expect(button).toBeVisible()
    const label = (await button.innerText()).trim()
    const quoted = Number(label.match(/(\d+)\s+credits?/)?.[1])
    expect(quoted, `the button does not quote a price: "${label}"`).toBeGreaterThan(0)

    const { data: before } = await admin
      .from('credit_balances')
      .select('balance_total')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    const balanceBefore = (before?.balance_total as number | undefined) ?? null

    // ── 2 · SPEND ─────────────────────────────────────────────────────────
    await button.click()
    const status = page.getByRole('status').filter({ hasText: /wrote a draft/i })
    await expect(status).toBeVisible({ timeout: 180_000 })
    expect(await status.innerText()).toContain(`${quoted} credit`)

    // ── 3 · THE LEDGER MOVED BY EXACTLY WHAT THE BUTTON SAID ──────────────
    if (balanceBefore !== null) {
      const { data: after } = await admin
        .from('credit_balances')
        .select('balance_total')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      expect(
        balanceBefore - ((after?.balance_total as number | undefined) ?? 0),
        'the ledger moved by an amount the button never showed',
      ).toBe(quoted)
    }

    // ── 4 · WHAT ARRIVED IS A DRAFT, AND IT CARRIES THE OBSERVATION ───────
    const { data: posts } = await admin
      .from('posts')
      .select('id, status, title, body, scheduled_at')
      .eq('workspace_id', workspaceId)
    const draft = (posts ?? []).find((p) => String(p.title).includes('Sunrise Bakery'))
    expect(draft, 'no post was written from the change').toBeTruthy()
    if (!draft) return

    expect(draft.status, 'a Radar output must never be anything but a draft').toBe('draft')
    // The observation, quoted with the date it was read on.
    expect(String(draft.body)).toContain('read on 2026-08-21')
    // And NOT the inference — it would arrive in a caption as a flat assertion.
    expect(String(draft.body)).not.toContain('push on weekend footfall')

    // ── 5 · AND THE READER IS SENT TO APPROVE IT ──────────────────────────
    await expect(page.getByRole('link', { name: /read it and approve it/i })).toBeVisible()
  })
})
