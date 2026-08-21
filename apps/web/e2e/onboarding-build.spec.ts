import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect as pwExpect, type Page } from '@playwright/test'

import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * THE TAIL: build -> result -> enter.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM THE WALK ────────────────────────────────
 * The first eight screens hold nothing but localStorage, so they are re-walkable
 * for ever. This third of the flow is NOT: it calls the model, writes
 * `brand_memory`, and by doing so flips `isFirstResolve` — so the free path, the
 * "your first Brand Brain was free" line and the first-run result card exist
 * exactly once per workspace. Mixing it into the walk would burn the account on
 * the first of four chrome passes and leave the other three walking a charged
 * flow that looks nothing like a new user's.
 *
 * It is deliberately NOT @smoke: it spends a real model call, and a gate that
 * costs money every time it runs is a gate people learn to skip.
 */

const SHOT_DIR =
  process.env.ONB_SHOT_DIR ??
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bb4d8b52-5b6d-4620-aa10-5f3d8f86ad38/scratchpad/shots'

async function shoot(page: Page, label: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.mouse.move(0, 0)
  const buf = await page.screenshot()
  const sha = createHash('sha256').update(buf).digest('hex')
  writeFileSync(join(SHOT_DIR, `${label}.png`), buf)
  // eslint-disable-next-line no-console
  console.log(`SHOT ${label} ${buf.length}B sha256=${sha.slice(0, 16)}`)
}

const ANSWERS = {
  name: 'Chai & Chapters',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  category: 'Local business',
  audience: 'weekend readers in Bengaluru',
}

test.describe.configure({ timeout: 600_000 })

test('builds, shows a derived confidence, and enters the app', async ({ page, signedIn }) => {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await pwExpect(create).toBeVisible({ timeout: 30_000 })
  await create.click()
  await pwExpect(create).toBeHidden({ timeout: 30_000 })

  await page.goto('/onboarding')
  // The FIRST build is free and the intro says so before anything is spent.
  await pwExpect(page.getByText(/free the first time/i)).toBeVisible()
  await page.getByRole('button', { name: /build my brand brain/i }).click()

  await page.locator('#f-name').fill(ANSWERS.name)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: ANSWERS.category, exact: true }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-aud').fill(ANSWERS.audience)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click() // 04 visual, optional
  await page.getByRole('button', { name: /^Continue$/ }).click() // 05 references, optional
  await page.getByRole('button', { name: /^Continue$/ }).click() // 06 knowledge, optional

  await pwExpect(page.getByRole('heading', { name: /understand your market too/i })).toBeVisible()
  const signals = await page.locator('[data-onb-signals]').getAttribute('data-onb-signals')
  // MEASURED, not asserted from intuition: name + what + cat + aud = 4.
  expect(Number(signals)).toBe(4)

  await page.getByRole('button', { name: /build my brand brain/i }).click()

  /* ── the build screen ── */
  await pwExpect(page.getByRole('heading', { name: /building your brand brain/i })).toBeVisible({
    timeout: 15_000,
  })
  await shoot(page, 'build-processing')
  // NO PERCENTAGE. The status line names a facet; it never counts toward a
  // denominator that does not exist.
  await pwExpect(page.locator('#proc')).not.toContainText(/%/)
  // And it must not claim a tone, which the result screen says it does not have.
  await pwExpect(page.locator('#proc')).not.toContainText(/tone of voice/i)

  /* ── the result ── */
  await pwExpect(page.getByRole('heading', { name: /your brand brain is ready/i })).toBeVisible({
    timeout: 300_000,
  })
  await shoot(page, 'build-result-1440-light')

  // Every cell is something the flow actually collected.
  await pwExpect(page.locator('#bb-grid')).toContainText(ANSWERS.name)
  await pwExpect(page.locator('#bb-grid')).toContainText(ANSWERS.audience)
  // No website was given, so the cell says so rather than reporting a failed read.
  await pwExpect(page.locator('#bb-grid')).toContainText('Not given')
  await pwExpect(page.locator('#bb-grid')).not.toContainText(/not read|did not run/i)

  /**
   * THE CONFIDENCE READING IS DERIVED.
   *
   * Four signals and four core answers is 46 — `(4/16)*70 + 4*7` — which is
   * below the 52 that reads "Medium". The bar's WIDTH is asserted against the
   * same arithmetic, so a decorative value that merely looked plausible would
   * fail here.
   */
  await pwExpect(page.locator('.conf__v')).toHaveText('Getting started')
  // POLLED, not sampled once: the bar animates from 0 after a 420ms delay, so a
  // single read lands on "0%" and would look like a value that was never
  // computed. The VALUE is decided the moment the card renders; only its
  // rendering is deferred, which is the difference this wait keeps visible.
  await pwExpect
    .poll(() => page.locator('#conf-fill').evaluate((el) => (el as HTMLElement).style.width), {
      timeout: 10_000,
    })
    .toBe('46%')
  const width = await page.locator('#conf-fill').evaluate((el) => (el as HTMLElement).style.width)
  // And it is not a full bar. Three minutes is not a fully understood brand.
  expect(Number.parseInt(width, 10)).toBeLessThan(97)

  // The free path is stated, because the money surface must say what happened.
  await pwExpect(page.getByText(/first Brand Brain was free/i)).toBeVisible()

  await page.emulateMedia({ colorScheme: null })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await shoot(page, 'build-result-1440-dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await shoot(page, 'build-result-390-dark')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await shoot(page, 'build-result-390-light')
  await page.setViewportSize({ width: 1440, height: 900 })

  /* ── enter ── */
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 60_000 })
  expect(new URL(page.url()).pathname).toBe('/home')

  /* ── and the brain is really on the row, not just on the screen ──
     Evidence, not the assertion. The service-role read can legitimately come
     back empty here (the key may be absent, and the table is behind RLS), and
     an empty read is NOT proof the write failed — asserting on it would make
     this test report a missing credential as a broken product. The real proof
     is one paragraph down and comes from the APP: re-entry stops offering the
     free path, and `isFree` is `activeBrandMemory(workspace.id) === null`. That
     can only flip if the row landed. */
  const admin = adminClient()
  if (admin) {
    const { data, error } = await admin
      .from('brand_memory')
      .select('version, source, status')
      .eq('status', 'active')
    // eslint-disable-next-line no-console
    console.log(
      `brand_memory rows: ${data?.length ?? 'unreadable'}${error ? ` (${error.message})` : ''}`,
    )
  }

  /* ── re-entry: onboarding does not offer to start over from nothing ── */
  await page.goto('/onboarding')
  await pwExpect(
    page.getByRole('heading', { name: /teach Sahoda|brand brain is ready/i }),
  ).toBeVisible({
    timeout: 30_000,
  })
  // The second build is NOT free, and the screen quotes the real price.
  await pwExpect(page.getByText(/free the first time/i)).toHaveCount(0)
  await shoot(page, 'build-reentry')
  expect(signedIn.clerkUserId).toBeTruthy()
})
