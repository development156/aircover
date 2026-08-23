import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { adminClient, expect, test } from './fixtures/seeded-user'
import { accentSpendOf } from './helpers/accent'
import { seedFlowWorkspace, workspaceIdFor } from './helpers/flow-seed'
import { walkOnboarding } from './helpers/flow-onboarding'
import {
  framesTaken,
  shot,
  timedGoto,
  useTheme,
  UX_OUT,
  WIDTHS,
  type Theme,
} from './helpers/ux-shot'

/**
 * THE FLOW LANE'S CAMERA — /posts, /posts/[id], /planner, /onboarding.
 *
 * Four routes, every state, three widths, both themes, and one accent
 * measurement per frame. It exists to produce a BEFORE that a lane can be held
 * to, and it is run again unchanged afterwards to produce the AFTER.
 *
 * ── WHY 1024 IS IN THE MATRIX AND IS NOT OPTIONAL ────────────────────────────
 * `globals.css` defines exactly two breakpoints, `narrow` (700) and `wide`
 * (1180). 390 and 1440 therefore land in the two TERMINAL bands and neither one
 * exercises 700–1179 — the band `docs/37` §13 calls the only interesting one,
 * and the band that has produced the most defects in every prior audit here.
 * `onboarding-walk.spec.ts` shoots 390 and 1440 only; this closes that.
 *
 * ── WHY EVERY STATE, NOT EVERY ROUTE ─────────────────────────────────────────
 * `docs/34` §11 records a peer first reporting "/planner has no calendar" and
 * then finding MonthGrid, WeekGrid and ViewToggle all built — only the DEFAULT
 * differed. Sampling one view of a route with view state is the same error as
 * sampling one width, so all three planner views are shot, populated and empty.
 *
 * ── NOTHING HERE PUBLISHES AND NOTHING HERE RESOLVES ─────────────────────────
 * The onboarding walk stops one click short of "Build my brand brain": that
 * button spends credits and calls a model, and the eight screens before it are
 * the ones a run that answers first destroys forever.
 */

const JOURNEY = 'flow'

/** Where the accent numbers land. One row per frame, joinable to the manifest by `file`. */
const ACCENT_LOG = join(UX_OUT, 'accent.jsonl')

/**
 * Measure the frame that was just written and record it.
 *
 * Deliberately NOT swallowed on failure. A frame this cannot decode is a frame
 * whose accent is unknown, and an unknown that logs as absent would quietly
 * shrink the denominator of every average in the report.
 */
function recordAccent(row: { file: string; stop: string; width: number; theme: Theme }): void {
  const spend = accentSpendOf(row.file)
  mkdirSync(UX_OUT, { recursive: true })
  appendFileSync(
    ACCENT_LOG,
    JSON.stringify({
      journey: JOURNEY,
      stop: row.stop,
      width: row.width,
      theme: row.theme,
      file: row.file,
      percent: Number(spend.percent.toFixed(4)),
      sampled: spend.sampled,
      saturated: spend.saturated,
      px: `${spend.width}x${spend.height}`,
    }) + '\n',
  )
}

async function frame(
  page: Page,
  stop: string,
  width: number,
  theme: Theme,
  ms: number | null = null,
  note?: string,
): Promise<void> {
  const row = await shot(page, { journey: JOURNEY, stop, width, theme, ms, note })
  recordAccent({ file: row.file, stop, width, theme })
}

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await create.waitFor({ state: 'visible', timeout: 30_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
}

/** The four routes' EMPTY states — a workspace and nothing in it. */
const EMPTY_STOPS: { route: string; stop: string }[] = [
  { route: '/posts', stop: 'posts-empty' },
  { route: '/posts/new', stop: 'composer-new-empty' },
  { route: '/planner', stop: 'planner-list-empty' },
  { route: '/planner?view=week', stop: 'planner-week-empty' },
  { route: '/planner?view=month', stop: 'planner-month-empty' },
]

const POPULATED_STOPS: { route: string; stop: string }[] = [
  { route: '/posts', stop: 'posts-full' },
  { route: '/planner', stop: 'planner-list-full' },
  { route: '/planner?view=week', stop: 'planner-week-full' },
  { route: '/planner?view=month', stop: 'planner-month-full' },
]

/**
 * Frames per (width, theme). Counted, never guessed.
 *
 * 8 onboarding arrivals + 5 empty + 4 populated + 1 composer-on-a-real-post = 18.
 * The count is asserted, because a selector that stopped matching writes fewer
 * frames and reports green — "a harness that cannot tell nothing-broke from
 * nothing-ran", which this repo has shipped twice.
 */
const ONBOARDING_STOPS = 8
const FRAMES_PER_COMBO = ONBOARDING_STOPS + EMPTY_STOPS.length + POPULATED_STOPS.length + 1

async function run(page: Page, width: number, theme: Theme, clerkUserId: string): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await useTheme(page, theme)
  await bootstrap(page)

  // ── ONBOARDING, EVERY STEP, BEFORE ANY OF THEM IS COMPLETED.
  const walked = await walkOnboarding(page, (stop) => frame(page, stop, width, theme))
  expect(walked, 'the onboarding walk did not reach every step').toBe(ONBOARDING_STOPS)

  // ── THE EMPTY STATES. Still nothing in the workspace.
  for (const { route, stop } of EMPTY_STOPS) {
    const ms = await timedGoto(page, route)
    await frame(page, stop, width, theme, ms)
  }

  // ── SEED, then the same screens with something in them.
  const admin = adminClient()
  expect(
    admin,
    'no service key: every "full" frame would be an empty one mislabelled',
  ).not.toBeNull()
  const workspaceId = await workspaceIdFor(admin!, clerkUserId)
  expect(workspaceId, 'the app did not create a workspace to seed into').not.toBeNull()
  const { divergedPostId, inserted } = await seedFlowWorkspace(admin!, workspaceId!, clerkUserId)
  expect(inserted, 'the seed wrote no posts').toBeGreaterThan(0)
  expect(
    divergedPostId,
    'the two-channel post is the composer frame; without it there is none',
  ).not.toBeNull()

  for (const { route, stop } of POPULATED_STOPS) {
    const ms = await timedGoto(page, route)
    await frame(page, stop, width, theme, ms)
  }

  const ms = await timedGoto(page, `/posts/${divergedPostId}`)
  await frame(page, 'composer-two-channels', width, theme, ms)
}

for (const width of WIDTHS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`flow frames ${width} ${theme}`, async ({ page, signedIn }) => {
      test.setTimeout(600_000)
      const before = framesTaken()
      await run(page, width, theme, signedIn.clerkUserId)
      expect(framesTaken() - before).toBe(FRAMES_PER_COMBO)
    })
  }
}
