import { bootstrapWorkspace, openPart, startPost } from './fixtures/compose'
import { adminClient, expect, signInSecondContext, test } from './fixtures/seeded-user'

/**
 * Two people, one post, one channel — against the REAL database.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE PGLITE PROOF ────────────────────
 * `packages/db/tests/post_variant_cas.pglite.test.ts` executes the compare-and-set
 * SQL and proves it refuses a stale write. That is a proof about SQL. It says
 * nothing about whether the RUNNING APP reaches that SQL: the version column is
 * stripped by a frozen schema before any screen sees it, the client has to detect
 * at runtime that the column exists at all, and every one of those steps was
 * written and shipped before the column did exist.
 *
 * So this is the first time the detection, the round trip and the refusal run
 * end to end. The discriminator is exact and needs no instrumentation: **a legacy
 * upsert cannot refuse anything and cannot move `version`.** If the notice appears
 * and the counter advances, the compare-and-set path is live. If the app were
 * still on the old path, both would be silently absent and every save would
 * succeed — which is the defect, and it looks like success.
 *
 * ── TWO CONTEXTS, NOT TWO TABS ───────────────────────────────────────────────
 * docs/23 specifies contexts, because two tabs share one cookie jar and one
 * storage state. A concurrent edit is a race between independent clients, so the
 * test has to be independent clients.
 */

const CHANNEL = 'instagram'

/** Bootstrap a workspace and a post with Instagram picked. Returns the post id. */
async function newPost(page: import('@playwright/test').Page): Promise<string> {
  await bootstrapWorkspace(page)
  return startPost(page, CHANNEL)
}

/**
 * Open a post and go to the part holding each platform's own copy.
 *
 * The composer lists the three parts of a post down the side and opens on the
 * WORDS every time — a writer coming back to a draft is here to read it. Every
 * box in this file is a channel's own copy, which lives one press away, so the
 * two steps are one helper rather than a line every spec forgets.
 */
async function openPost(page: import('@playwright/test').Page, postId: string): Promise<void> {
  await page.goto(`/posts/${postId}`)
  await openPart(page, 2)
}

const copyBox = (page: import('@playwright/test').Page) =>
  page.getByRole('textbox', { name: 'Instagram copy', exact: true })
/** Anchored: the notice's own "Use the saved version" also contains "saved". */
const saveButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^save instagram copy$/i })

/**
 * The card's own claim that this channel's copy is in its row.
 *
 * The state moved OFF the button when the composer replaced the two editors. The
 * old editor relabelled one Save button between "Save variant" and "Saved"; four
 * version cards on one screen cannot do that, because four buttons whose name
 * changes with their state are four buttons a screen-reader user cannot tell
 * apart. The button keeps a stable name and the card says what it is.
 */
const savedChip = (page: import('@playwright/test').Page) =>
  page.locator(`[data-version-card="${CHANNEL}"]`).getByText(/^Saved$/)

async function saveCopy(page: import('@playwright/test').Page, text: string): Promise<void> {
  await copyBox(page).fill(text)
  await saveButton(page).click()
}

/** What the row actually holds. Nothing on any screen renders `version`. */
async function readVariant(postId: string): Promise<{ body: string; version: number } | null> {
  const admin = adminClient()
  if (!admin) return null
  const { data } = await admin
    .from('post_variants')
    .select('body, version')
    .eq('post_id', postId)
    .eq('channel', CHANNEL)
    .maybeSingle()
  return (data as { body: string; version: number } | null) ?? null
}

test.describe('concurrent edit, against the real database @smoke', () => {
  // Two contexts, two sign-ins and a dozen navigations. The cost is the journey,
  // not any single assertion.
  test.setTimeout(180_000)

  test('the first save creates rather than being refused, and the counter then moves', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    const postId = await newPost(page)
    await openPost(page, postId)

    // ── (d) THE CREATE ARM ────────────────────────────────────────────────────
    // docs/23's SQL as printed only UPDATEs, and the app's write is an upsert — so
    // with that SQL the FIRST save of every channel would come back with no row and
    // be reported as a clash with a writer who does not exist. This is that case,
    // against the real table.
    await saveCopy(page, 'The first draft.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/Someone else saved the/i)).toHaveCount(0)

    const created = await readVariant(postId)
    test.skip(created === null, 'no service key in this environment')
    expect(created?.body).toBe('The first draft.')
    // Created, so it starts at 1 — via the create arm or the old upsert; this line
    // alone does not tell them apart, which is what the next save is for.
    expect(created?.version).toBe(1)

    // ── (a) THE APP IS ON THE COMPARE-AND-SET PATH ────────────────────────────
    // MEASURED, not read off the source. The old upsert never touched `version`,
    // so a counter at 2 is only reachable through the new function.
    await saveCopy(page, 'The second draft.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    const updated = await readVariant(postId)
    expect(updated?.body).toBe('The second draft.')
    expect(updated?.version).toBe(2)
  })

  test('a stale save is refused, keeps both texts, and can still be won', async ({
    page,
    browser,
    signedIn,
  }) => {
    const postId = await newPost(page)
    await openPost(page, postId)
    await saveCopy(page, 'A wrote this first.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    // B opens the same post in its OWN session, and reads the row as it is now.
    const other = await signInSecondContext(browser, signedIn)
    await openPost(other, postId)
    await expect(copyBox(other)).toHaveValue('A wrote this first.')

    // A saves again. B is now holding a version that no longer exists.
    await saveCopy(page, 'A wrote this second, unaware of B.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    // ── (b) B IS REFUSED ──────────────────────────────────────────────────────
    await saveCopy(other, 'B wrote this, unaware of A.')
    const notice = other.getByRole('alert').filter({ hasText: /Someone else saved the/i })
    await expect(notice).toBeVisible({ timeout: 20_000 })

    // ── (c) THE REFUSAL IS NOT A SECOND WAY TO LOSE WORK ──────────────────────
    // B's own words are still in the box. This is the one a "reload?" dialog
    // destroys, and the reason this notice has no such button.
    await expect(copyBox(other)).toHaveValue('B wrote this, unaware of A.')
    // Both versions named, in words a shop owner uses, and the CHANNEL named —
    // "this post" would not be actionable when a conflict is per-variant.
    await expect(notice).toContainText(/Instagram/i)
    await expect(notice).toContainText('A wrote this second, unaware of B.')
    // Exactly two verbs. NO dismiss: dismissing leaves a variant that cannot save
    // and a writer typing into a box whose contents can no longer land.
    await expect(notice.getByRole('button')).toHaveCount(2)
    await expect(notice.getByRole('button', { name: /dismiss|close|ok|cancel/i })).toHaveCount(0)
    // And the draft is still offered as unsaved, because it is. The button keeps
    // one stable name, so what is asserted is that it is OFFERED — enabled — and
    // that the card is not claiming the copy landed.
    await expect(saveButton(other)).toBeEnabled()
    await expect(savedChip(other)).toHaveCount(0)

    // Nothing of A's was lost either — the refused write changed no row.
    const afterRefusal = await readVariant(postId)
    test.skip(afterRefusal === null, 'no service key in this environment')
    expect(afterRefusal?.body).toBe('A wrote this second, unaware of B.')

    // ── KEEP MINE WINS, rather than failing forever ───────────────────────────
    await notice.getByRole('button', { name: /keep mine/i }).click()
    await expect(savedChip(other)).toBeVisible({ timeout: 60_000 })

    const kept = await readVariant(postId)
    expect(kept?.body).toBe('B wrote this, unaware of A.')
    // 1 created, 2 A's second save, 3 B's retry. The refused write did not count.
    expect(kept?.version).toBe(3)
  })

  test('the compare-and-set cannot be aimed at another workspace’s row', async ({
    page,
    signedIn,
  }) => {
    // ── (e) EVERY ARGUMENT IN AN RPC SIGNATURE IS ATTACKER-SUPPLIED ───────────
    // `p_workspace_id` is not derived inside the function; it is passed in. So the
    // question is not "does the app send the right one" — it is what the function
    // does when it is sent the wrong one.
    //
    // Called with the SERVICE ROLE deliberately, which bypasses row-level security
    // entirely. That makes this a test of the function's own `where workspace_id =`
    // clause rather than of the policies above it — the layer that still holds when
    // the caller is a server, a job, or anything else RLS does not stop.
    const admin = adminClient()
    test.skip(admin === null, 'no service key in this environment')

    const postId = await newPost(page)
    await openPost(page, postId)
    await saveCopy(page, 'Belongs to the first workspace.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    const stamp = Date.now().toString(36)
    // A second workspace owned by the SAME test user, so cleanup removes it with
    // the rest and no real tenant is anywhere near this.
    const { data: second, error: madeSecond } = await admin!
      .from('workspaces')
      .insert({
        name: `E2E other ${stamp}`,
        slug: `e2e-other-${stamp}`,
        created_by: signedIn.clerkUserId,
      })
      .select('id')
      .single()
    expect(madeSecond).toBeNull()
    const otherWorkspace = (second as { id: string }).id

    for (const workspaceId of [otherWorkspace, '00000000-0000-4000-8000-000000000000']) {
      const { data, error } = await admin!.rpc('save_post_variant', {
        p_post_id: postId,
        p_workspace_id: workspaceId,
        p_channel: CHANNEL,
        p_body: 'WRITTEN FROM THE WRONG ACCOUNT',
        p_extras: null,
        p_char_count: 30,
        p_expected_version: 1,
        p_is_linked: false,
      })

      // No row back. Not an error — a refusal, which is the same answer a stale
      // version gets, and correctly so: neither one matched.
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    // The words are the assertion. A guard that returns nothing while still having
    // written would be the worst of both.
    const row = await readVariant(postId)
    expect(row?.body).toBe('Belongs to the first workspace.')
    expect(row?.version).toBe(1)
  })

  test('"use the saved version" loads into the box and writes nothing', async ({
    page,
    browser,
    signedIn,
  }) => {
    const postId = await newPost(page)
    await openPost(page, postId)
    await saveCopy(page, 'A first.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    const other = await signInSecondContext(browser, signedIn)
    await openPost(other, postId)
    await expect(copyBox(other)).toHaveValue('A first.')

    await saveCopy(page, 'A second.')
    await expect(savedChip(page)).toBeVisible({ timeout: 60_000 })

    await saveCopy(other, 'B stale.')
    const notice = other.getByRole('alert').filter({ hasText: /Someone else saved the/i })
    await expect(notice).toBeVisible({ timeout: 20_000 })

    await notice.getByRole('button', { name: /use the saved version/i }).click()

    // Into the BOX, not the row — so it can still be edited or undone.
    await expect(copyBox(other)).toHaveValue('A second.')
    await expect(notice).toHaveCount(0)
    // Offered as unsaved, because nothing has been written.
    await expect(saveButton(other)).toBeEnabled()
    await expect(savedChip(other)).toHaveCount(0)

    const row = await readVariant(postId)
    test.skip(row === null, 'no service key in this environment')
    // The row is untouched: version still 2 (created, then A's second save).
    expect(row?.body).toBe('A second.')
    expect(row?.version).toBe(2)
  })
})
