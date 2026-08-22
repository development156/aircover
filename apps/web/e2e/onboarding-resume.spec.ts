import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect as pwExpect, type Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'

/**
 * SAVE AND EXIT, AND COME BACK WHERE YOU LEFT.
 *
 * This is the whole point of the "Save & exit" control, and it is the one
 * behaviour a screenshot cannot prove: two frames of step 04 look identical
 * whether the second one arrived by resuming or by walking there again. So the
 * proof here is the ROUTE taken — leave from step 04, land on /home, come back
 * to /onboarding cold, and be on step 04 with the answers still in the fields.
 */

const SHOT_DIR =
  process.env.ONB_SHOT_DIR ??
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bb4d8b52-5b6d-4620-aa10-5f3d8f86ad38/scratchpad/shots'

async function shoot(page: Page, label: string): Promise<string> {
  mkdirSync(SHOT_DIR, { recursive: true })
  const buf = await page.screenshot()
  const sha = createHash('sha256').update(buf).digest('hex')
  writeFileSync(join(SHOT_DIR, `${label}.png`), buf)
  // eslint-disable-next-line no-console
  console.log(`SHOT ${label} ${buf.length}B sha256=${sha.slice(0, 16)}`)
  return sha
}

const ANSWERS = {
  name: 'Chai & Chapters',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  audience: 'weekend readers in Bengaluru',
}

async function bootstrapWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await pwExpect(create).toBeVisible({ timeout: 30_000 })
  await create.click()
  await pwExpect(create).toBeHidden({ timeout: 30_000 })
}

async function answerThroughToVisual(page: Page): Promise<void> {
  await page.goto('/onboarding')
  await page.getByRole('button', { name: /build my brand brain/i }).click()
  await page.locator('#f-name').fill(ANSWERS.name)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-aud').fill(ANSWERS.audience)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await pwExpect(
    page.getByRole('heading', { name: /sees your brand the way you do/i }),
  ).toBeVisible()
}

test.describe.configure({ timeout: 300_000 })

test('save and exit resumes on the step it was left on, holding the answers', async ({
  page,
  signedIn,
}) => {
  expect(signedIn.clerkUserId).toBeTruthy()
  await bootstrapWorkspace(page)
  await answerThroughToVisual(page)

  // Leave from step 04.
  await shoot(page, 'resume-1-left-from-04')
  await page.getByRole('button', { name: /save & exit/i }).click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  expect(new URL(page.url()).pathname).toBe('/home')

  // Come back COLD — a full navigation, not a history step.
  await page.goto('/onboarding')

  // The step it was left on, not the intro and not step 01.
  await pwExpect(
    page.getByRole('heading', { name: /sees your brand the way you do/i }),
  ).toBeVisible({
    timeout: 30_000,
  })
  await shoot(page, 'resume-2-back-on-04')

  // And the answers are still there, which is the half a step number cannot prove.
  await page.getByRole('button', { name: /^Back$/ }).click()
  await pwExpect(page.locator('#f-aud')).toHaveValue(ANSWERS.audience)
  await page.getByRole('button', { name: /^Back$/ }).click()
  await pwExpect(page.locator('#f-what')).toHaveValue(ANSWERS.what)
  await page.getByRole('button', { name: /^Back$/ }).click()
  await pwExpect(page.locator('#f-name')).toHaveValue(ANSWERS.name)
  await shoot(page, 'resume-3-answers-intact')
})

test('the resumed session does not inflate the signal count', async ({ page, signedIn }) => {
  expect(signedIn.clerkUserId).toBeTruthy()
  await bootstrapWorkspace(page)
  await answerThroughToVisual(page)

  // Add references — the shape the source double-counted, because it persisted
  // the counter and re-added each card on resume with an empty `seen` Set.
  await page.getByRole('button', { name: /^Continue$/ }).click()
  for (const url of ['https://instagram.com/a', 'https://pinterest.com/b']) {
    await page.locator('#f-ref').fill(url)
    await page.locator('#f-ref').press('Enter')
  }
  const before = await page.locator('[data-onb-signals]').getAttribute('data-onb-signals')

  await page.getByRole('button', { name: /save & exit/i }).click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  await page.goto('/onboarding')
  await pwExpect(page.getByRole('heading', { name: /what .good. looks like/i })).toBeVisible({
    timeout: 30_000,
  })

  const after = await page.locator('[data-onb-signals]').getAttribute('data-onb-signals')
  expect(after).toBe(before)
  // Named, so a regression reads as arithmetic rather than as a mismatch.
  expect(Number(after)).toBe(5)
})

/**
 * ONBOARDING MUST NOT OFFER A REMEDY IT CANNOT FULFIL.
 *
 * `no-impossible-remedy.spec.ts` walks every in-scope route as a fresh account
 * and fails on any visible "reload / try again / could not read". /onboarding
 * was DELIBERATELY out of scope for that run. It is in scope now, because the
 * rebuilt stage reads a website and resolves a brain, which is exactly the
 * shape that produced all four historic failures.
 */
test('a fresh account with no workspace is not told anything failed', async ({
  page,
  signedIn,
}) => {
  expect(signedIn.clerkUserId).toBeTruthy()

  await page.goto('/onboarding')
  await pwExpect(page.getByRole('heading', { name: /make a workspace first/i })).toBeVisible({
    timeout: 30_000,
  })

  const hits = await page.evaluate(() => {
    const RE = /\breload\b|\btry again\b|\brefresh\b|could ?n[o']?t (read|check|load|reach)/i
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (own && RE.test(own)) out.push(own.slice(0, 160))
    }
    return out
  })
  expect(
    hits,
    `nothing has failed on this account, so nothing may say so:\n${hits.join('\n')}`,
  ).toEqual([])

  // And the ONE thing it does offer is a remedy that can actually succeed.
  await pwExpect(page.getByRole('button', { name: /create workspace/i })).toBeVisible()
  await shoot(page, 'no-workspace-gate')
})
