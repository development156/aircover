import type { Locator, Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'
import { framesTaken, shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * JOURNEY 1 — THE NEW USER.
 *
 * Sign up, onboard, reach a first scheduled post, COUNTING EVERY CLICK.
 *
 * ── WHY THIS SPEC ASSERTS ALMOST NOTHING ─────────────────────────────────────
 * The defect this lane exists to catch is a screen that passes every assertion
 * while the thing the screen is FOR is absent. So this file's product is frames
 * and a click count, not a pass. Where a control does not appear it records the
 * fact and captures the screen anyway — a dead end is a finding, not a failure,
 * and a spec that throws at the first one stops looking exactly where the
 * looking matters.
 *
 * Each (width, theme) is its own `test`, so each gets its own fresh Clerk user
 * from the `signedIn` fixture. Nothing is shared between them.
 *
 * NOT tagged `@smoke`: the gate must not spend credits, and this journey does.
 */

const JOURNEY = 'j1-new-user'

interface Counter {
  clicks: number
  log: string[]
}

/** Every interaction goes through here, so the count cannot drift from the story. */
async function tap(c: Counter, what: string, locator: Locator): Promise<void> {
  c.clicks += 1
  c.log.push(`${c.clicks}. ${what}`)
  await locator.click()
}

async function present(locator: Locator, ms = 6000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: ms })
    return true
  } catch {
    return false
  }
}

async function run(page: Page, width: number, theme: Theme): Promise<void> {
  const c: Counter = { clicks: 0, log: [] }
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await useTheme(page, theme)

  const frame = async (stop: string, ms: number | null = null, note?: string): Promise<void> => {
    await shot(page, { journey: JOURNEY, stop, width, theme, ms, note })
  }

  // ── STOP 1. The first screen a signed-up account ever sees.
  const t1 = await timedGoto(page, '/home')
  await frame('01-home-no-workspace', t1)

  // ── STOP 2. Bootstrap the workspace.
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  if (await present(create)) {
    await tap(c, 'Create workspace (empty state)', create)
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(800)
    await frame('02-onboarding-intake')
  } else {
    await frame('02-onboarding-intake', null, 'no Create workspace control on /home')
  }

  // ── STOP 3. Screen one of three: say what you do.
  const intake = page.getByRole('textbox').first()
  if (await present(intake)) {
    await intake.fill(
      'We roast and sell single-origin coffee from a small shop in Pune, and we run a Saturday cupping class.',
    )
    await page.waitForTimeout(300)
    await frame('03-intake-typed')
    const cont = page.getByRole('button', { name: /continue|next/i }).first()
    if (await present(cont, 3000)) {
      await tap(c, 'Continue (intake)', cont)
      await page.waitForTimeout(900)
    }
  }
  await frame('04-door')

  // ── STOP 4. The door: give us something to read.
  const doorText = page.getByPlaceholder(/we bake sourdough/i)
  if (await present(doorText, 4000)) {
    await doorText.fill(
      'Kalyani Coffee Roasters. We roast in small batches every Tuesday and sell only what we roasted that week. Our Saturday cupping class is free and always full.',
    )
    await frame('05-door-typed')
    const read = page.locator('[data-guide="onboarding.door-read"]')
    if (await present(read, 3000)) {
      await tap(c, 'Read this (door)', read)
      await page.waitForTimeout(2500)
      await frame('06-door-read')
    }
  }
  const doorContinue = page.locator('[data-guide="onboarding.door-continue"]')
  if (await present(doorContinue, 8000)) {
    await tap(c, 'Continue (door)', doorContinue)
    await page.waitForTimeout(900)
  }
  await frame('07-question')

  // ── STOP 5. The one question, then the paid resolve.
  const answer = page.getByRole('textbox').first()
  if (await present(answer, 4000)) {
    await answer.fill('We will never sell a bean we did not roast ourselves.')
    await frame('08-question-answered')
  }
  const resolve = page.locator('[data-guide="onboarding.resolve"]')
  if (await present(resolve, 4000)) {
    await tap(c, 'Resolve my brand (50 credits)', resolve)
    await page.waitForTimeout(1200)
    await frame('09-resolving')
    // The model call is real. Give it a genuine window, then photograph whatever
    // state the screen is in — including a failure, which is itself the finding.
    await page.waitForTimeout(45_000)
    await frame('10-reveal-or-error')
  } else {
    await frame('10-reveal-or-error', null, 'no resolve control found')
  }

  // ── STOP 6. Approve, and land in the app for the first time.
  const approve = page.getByRole('button', { name: /approve|save|finish|looks right/i }).first()
  if (await present(approve, 5000)) {
    await tap(c, 'Approve the brain', approve)
    await page.waitForTimeout(4000)
  }
  await frame('11-home-after-onboarding')

  // ── STOP 7. Write the first post.
  const t2 = await timedGoto(page, '/posts')
  await frame('12-posts-empty', t2)
  const createPost = page.getByRole('link', { name: /create post/i }).first()
  if (await present(createPost, 5000)) {
    await tap(c, 'Create post', createPost)
    await page.waitForURL(/\/posts\/new/, { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(1200)
  } else {
    await timedGoto(page, '/posts/new')
  }
  await frame('13-composer-blank')

  // Step one, then step two. The composer is a numbered sequence: the channel
  // step is refused until the post says something, so a journey that ticked a
  // channel on a blank screen was photographing a state a person cannot reach.
  const body = page.getByLabel('Your post')
  if (await present(body, 5000)) {
    await body.fill('Saturday cupping is open again. Five seats, no charge, 9am.')
    await page.waitForURL(/\/posts\/[0-9a-f-]{36}$/, { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }
  await frame('14-composer-written')

  // The composer lists the three parts of a post down the side. The platform
  // part is refused until something is written, so the journey goes there only
  // now — and photographing the rail is part of the point.
  const platformPart = page.locator('[data-rail-step="2"] button')
  if (await present(platformPart, 5000)) {
    await tap(c, 'Go to the platform part', platformPart)
    await page.waitForTimeout(800)
  }
  const tile = page.locator('[data-channel-tile="instagram"]')
  if (await present(tile, 5000)) {
    await tap(c, 'Pick the Instagram channel', tile)
    await page.waitForTimeout(1200)
  }
  await frame('15-composer-channel-picked')

  // ── STOP 8. Schedule it. This is the goal of the journey.
  const sendPart = page.locator('[data-rail-step="3"] button')
  if (await present(sendPart, 5000)) {
    await tap(c, 'Go to the send part', sendPart)
    await page.waitForTimeout(800)
  }
  const schedule = page.getByRole('button', { name: /schedule/i }).first()
  if (await present(schedule, 5000)) {
    await tap(c, 'Schedule', schedule)
    await page.waitForTimeout(1500)
    await frame('16-schedule-open')
    const confirm = page.getByRole('button', { name: /schedule|confirm|set time/i }).last()
    if (await present(confirm, 4000)) {
      await tap(c, 'Confirm the schedule', confirm)
      await page.waitForTimeout(2500)
    }
  }
  await frame('17-scheduled')

  const t3 = await timedGoto(page, '/posts')
  await frame('18-posts-with-scheduled', t3)

  await shot(page, {
    journey: JOURNEY,
    stop: '99-clickcount',
    width,
    theme,
    note: `CLICKS=${c.clicks} :: ${c.log.join(' | ')}`,
  })
  console.log(`[ux] ${JOURNEY} ${width}/${theme} CLICKS=${c.clicks}`)
  for (const line of c.log) console.log(`[ux]   ${line}`)
}

const COMBOS: { width: number; theme: Theme }[] = [
  { width: 1440, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 1024, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 390, theme: 'dark' },
  { width: 1024, theme: 'dark' },
]

for (const { width, theme } of COMBOS) {
  test(`ux j1 new user ${width} ${theme}`, async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(360_000)
    const before = framesTaken()
    await run(page, width, theme)
    // The one thing this file must not do is report green having captured
    // nothing. Every stop below writes a frame whatever it finds, so a run that
    // signed in and walked the journey cannot produce fewer than its stops.
    expect(framesTaken() - before).toBeGreaterThanOrEqual(17)
  })
}
