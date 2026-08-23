import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

import { adminClient, expect, test } from './fixtures/seeded-user'
import { measureAccentSpend } from './helpers/accent-spend'
import { framesTaken, parkPointer, shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * THE /home AND /analytics CAMERA, AND THE ACCENT METER.
 *
 * Twelve compositions per data state — two routes x three widths x two themes —
 * captured twice each: a FIXED-VIEWPORT frame, which is what the accent meter
 * reads, and a FULL-PAGE frame, which is what a person reads. See
 * `helpers/accent-spend.ts` for why those cannot be the same frame.
 *
 * ── 1024 IS NOT OPTIONAL ─────────────────────────────────────────────────────
 * docs/37 §13: this app has exactly two breakpoints, `narrow` 700 and `wide`
 * 1180. So 390 and 1440 both land in TERMINAL bands and neither one exercises
 * 700-1179 — the band where /home's `max-wide:grid-cols-1` collapses a two-column
 * page into one, and the band no audit of /home has ever measured.
 *
 * ── ONE CLERK USER PER DATA STATE, NOT ONE PER FRAME ─────────────────────────
 * The house pattern (`ux-j2`) declares one `test()` per (width, theme) and so
 * mints six users per journey. This suite has minted 12,196 Clerk users against
 * PRODUCTION. Every run here is a deliberate, acknowledged production-targeting
 * run, so the loop is inside the test: two users per pass, both deleted by the
 * fixture, and the rows counted afterwards.
 *
 * ── AND IT DOES NOT RUN UNLESS ASKED ─────────────────────────────────────────
 * `PAGE_DASH_CAPTURE=1`. The ux-* specs run on any bare `playwright test` and
 * mint users for a reader who only wanted to check one assertion. This one is a
 * camera, it has no verdict to contribute to the gate, and a camera that fires
 * when nobody asked is how the count above happened.
 */

const CAPTURE = process.env.PAGE_DASH_CAPTURE === '1'
/** `before` or `after`. Written into the row so one file holds both passes. */
const PHASE = process.env.PAGE_DASH_PHASE ?? 'before'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.UX_OUT ?? join(HERE, '..', '..', '..', '.ux')
const METER = join(OUT, 'accent-spend.jsonl')

const ROUTES = ['/home', '/analytics'] as const

/**
 * The viewport the meter reads, per width.
 *
 * Stated rather than inherited, because the denominator IS the measurement. 844
 * is a mid-range Android's usable height in portrait; 768 and 900 are the two
 * laptop heights this product is actually opened at. A later pass MUST use these
 * same numbers or its fractions are not comparable to this one's.
 */
const VIEWPORT_H: Record<number, number> = { 390: 844, 1024: 768, 1440: 900 }
const WIDTHS = [390, 1024, 1440] as const
const THEMES: Theme[] = ['light', 'dark']

/* ── THE POPULATED WORKSPACE ─────────────────────────────────────────────────
   Four posts in four states, because "which of these is waiting on me" is the
   question /home exists to answer and four drafts cannot answer it. Two channels
   PUBLISHED, because `hasPublished` is what gates half of /analytics — and their
   metrics will come back pending or unresolved from a Zernio account that has
   never heard of them, which is not a gap in the fixture. It is the state every
   beta workspace is in and the one both pages are worst at. */

const BRAIN = {
  voice: {
    descriptor: 'Warm, plain and specific. Talks about the work, not about itself.',
    formality_label: 'Friendly and direct',
    signature_phrases: ['roasted this week', 'come and taste it', 'we will tell you honestly'],
    banned_phrases: ['artisanal', 'game-changing', 'unlock'],
  },
  brand_persona: {
    archetype: 'The Craftsman',
    one_liner: 'A small Pune roastery that sells only what it roasted this week.',
    core_values: ['freshness over volume', 'say what is true', 'teach the customer'],
  },
  customer_persona: {
    one_liner: 'Pune coffee drinkers who have started caring where the beans came from.',
    primary_pain_point: 'Supermarket coffee is stale and nobody will say how old it is.',
    primary_fear: 'Paying specialty prices for something ordinary.',
    desired_identity: 'Someone who knows the difference and buys from people who do too.',
  },
  hook: {
    core_promise: 'Roasted this week or we do not sell it.',
    primary_emotion: 'trust',
    sample_hooks: [
      'Tuesday roast is on the shelf.',
      'Five seats at Saturday cupping, no charge.',
      'We will tell you the roast date before you ask.',
    ],
  },
  taboo: { red_lines: ['no health claims', 'never disparage another roaster'] },
  alignment: {
    signal_lock: 'moderate',
    note: 'Built from a short description and one refusal. Narrow but consistent.',
  },
}

interface SeedPost {
  title: string
  body: string
  status: string
  channels: string[]
  scheduledAt: string | null
  /** Channels whose variant is marked published — what `hasPublished` reads. */
  published: string[]
}

const POSTS: SeedPost[] = [
  {
    title: 'Saturday cupping, five seats',
    body: 'Saturday cupping is open again. Five seats, no charge, 9am. Bring nobody or bring everybody.',
    status: 'review',
    channels: ['instagram', 'linkedin'],
    scheduledAt: null,
    published: [],
  },
  {
    title: 'What a roast date actually tells you',
    body: 'A roast date is the only number on a coffee bag that changes what is in your cup. Here is how to read one.',
    status: 'scheduled',
    channels: ['linkedin'],
    scheduledAt: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
    published: [],
  },
  {
    title: 'Tuesday roast is on the shelf',
    body: 'Tuesday roast is on the shelf. Ethiopian Guji, roasted 48 hours ago, and we will tell you the date before you ask.',
    status: 'published',
    channels: ['instagram'],
    scheduledAt: null,
    published: ['instagram'],
  },
  {
    title: 'The Guji is finished',
    body: 'The Guji is finished for this week. The Sidamo lands Tuesday.',
    status: 'published',
    channels: ['x'],
    scheduledAt: null,
    published: ['x'],
  },
]

async function workspaceIdFor(admin: SupabaseClient, clerkUserId: string): Promise<string | null> {
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('created_by', clerkUserId)
    .limit(1)
  return data?.[0]?.id ?? null
}

async function seed(admin: SupabaseClient, workspaceId: string, clerkUserId: string) {
  await admin.from('brand_memory').insert({
    workspace_id: workspaceId,
    version: 1,
    status: 'active',
    payload: BRAIN,
    source: 'resolved',
    created_by: clerkUserId,
  })

  for (const p of POSTS) {
    const { data } = await admin
      .from('posts')
      .insert({
        workspace_id: workspaceId,
        title: p.title,
        body: p.body,
        status: p.status,
        channels: p.channels,
        scheduled_at: p.scheduledAt,
        created_by: clerkUserId,
      })
      .select('id')
      .limit(1)
    const postId = data?.[0]?.id
    if (!postId) continue
    for (const channel of p.channels) {
      await admin.from('post_variants').insert({
        workspace_id: workspaceId,
        post_id: postId,
        channel,
        body: p.body,
        char_count: p.body.length,
        publish_status: p.published.includes(channel)
          ? 'published'
          : p.status === 'scheduled'
            ? 'scheduled'
            : 'pending',
      })
    }
  }
}

/**
 * Spend some credits, THROUGH THE ONLY LEGAL WRITER.
 *
 * `credit_balances` has exactly one write path and it is `app.apply_ledger_entry`
 * (20260718000006). A direct insert would produce a balance the ledger cannot
 * explain, which is the one thing the money surfaces are built not to show.
 * `app.*` is not exposed through PostgREST, so this goes over a direct connection.
 *
 * Best-effort: a workspace with only its welcome grant is a perfectly real
 * workspace, and the frame says so rather than the run failing.
 */
async function spendSome(workspaceId: string): Promise<boolean> {
  const url = process.env.SUPABASE_DB_URL
  if (!url) return false
  const { Client } = (await import('pg')).default
  const client = new Client({ connectionString: url })
  try {
    await client.connect()
    await client.query(
      `select app.apply_ledger_entry($1::uuid, 'DEBIT', $2::int, $3::text, $4::text)`,
      [workspaceId, 30, `page-dash-${workspaceId}`, 'draft_post'],
    )
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

/** Click through the app's own bootstrap, exactly as a person does. */
async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 15_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    /* already bootstrapped by an earlier navigation in this session */
  }
}

/**
 * One route, one width, one theme: two frames and one meter row.
 *
 * The viewport frame is taken FIRST and the full-page frame second, both after
 * the same navigation, so the two describe one render rather than two loads.
 */
async function capture(page: Page, state: string, route: string, width: number, theme: Theme) {
  const height = VIEWPORT_H[width] ?? 900
  await page.setViewportSize({ width, height })
  const ms = await timedGoto(page, route)
  await parkPointer(page)

  const stop = `${state}__${route.slice(1).replace(/\//g, '-')}`

  // The meter's frame. `viewportOnly` is the load-bearing flag on this line.
  const viewportRow = await shot(page, {
    journey: `page-dash-${PHASE}`,
    stop: `${stop}__viewport`,
    width,
    theme,
    ms,
    viewportOnly: true,
  })
  const spend = measureAccentSpend(await page.screenshot({ clip: { x: 0, y: 0, width, height } }))

  // The frame a person reads. Full page, so a screen that runs long shows it.
  const pageRow = await shot(page, {
    journey: `page-dash-${PHASE}`,
    stop: `${stop}__full`,
    width,
    theme,
    ms,
  })

  mkdirSync(OUT, { recursive: true })
  appendFileSync(
    METER,
    JSON.stringify({
      phase: PHASE,
      state,
      route,
      width,
      height,
      theme,
      domTheme: viewportRow.domTheme,
      ...spend,
      viewportFile: viewportRow.file,
      fullFile: pageRow.file,
      fullBytes: pageRow.bytes,
      viewportSha: viewportRow.sha,
      fullSha: pageRow.sha,
      /** How long the full page runs. The other half of a composition verdict. */
      documentHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    }) + '\n',
  )

  return spend
}

/**
 * Median luminance per `${route}@${width}@${theme}`, kept for the assertion below.
 */
const litness = new Map<string, number>()

async function walk(page: Page, state: string): Promise<void> {
  for (const theme of THEMES) {
    await useTheme(page, theme)
    for (const width of WIDTHS) {
      for (const route of ROUTES) {
        const spend = await capture(page, state, route, width, theme)
        litness.set(`${route}@${width}@${theme}`, spend.medianLuminance)
      }
    }
  }
}

/**
 * DID THE STYLESHEET ACTUALLY LOAD?
 *
 * ── THE FAILURE THIS EXISTS FOR, WHICH IS NOT HYPOTHETICAL ──────────────────
 * A peer lane recorded on 2026-08-23 that its capture spec reported green over
 * **34 unstyled PNGs**. Every assertion a camera normally makes survived it: the
 * frame COUNT was right, the shas were DISTINCT (unstyled pages still differ
 * from each other), and `domTheme` read back correctly, because `data-theme` is
 * an attribute and an attribute does not need CSS. This spec asserted exactly
 * those three things and would have reported the same green.
 *
 * ── AND WHY IT IS LIGHT-AGAINST-DARK RATHER THAN A THRESHOLD ────────────────
 * An unstyled page renders white in BOTH themes. A per-frame threshold catches
 * that in dark and cannot catch it in light, where `--canvas` is `#fafafa` and
 * sits four points from the browser's own default. Comparing the two themes of
 * the SAME route and width needs no absolute number at all: if the stylesheet
 * did not load, the pair collapses onto one value, and no threshold has to be
 * guessed. MEASURED on this branch, the smallest real gap across the twelve
 * pairs is far wider than this floor.
 */
const LIGHT_DARK_FLOOR = 40

function assertThemesActuallyDiffer(): void {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const light = litness.get(`${route}@${width}@light`)
      const dark = litness.get(`${route}@${width}@dark`)
      expect(light, `no light frame for ${route}@${width}`).toBeDefined()
      expect(dark, `no dark frame for ${route}@${width}`).toBeDefined()
      expect(
        (light as number) - (dark as number),
        `${route} @ ${width}: light median luminance ${light} against dark ${dark}. ` +
          'A gap this small means both frames rendered the same ground — which is what a ' +
          'page with no stylesheet looks like, in both themes, with the right sha and the ' +
          'right data-theme on it.',
      ).toBeGreaterThan(LIGHT_DARK_FLOOR)
    }
  }
}

const EXPECTED = THEMES.length * WIDTHS.length * ROUTES.length * 2

test.describe('page-dash camera', () => {
  test.skip(!CAPTURE, 'set PAGE_DASH_CAPTURE=1 — this mints Clerk users against production')

  test('empty — a workspace and nothing else', async ({ page, signedIn }) => {
    test.setTimeout(600_000)
    const before = framesTaken()
    await bootstrap(page)
    await walk(page, 'empty')
    // Proves the camera fired. A run whose selectors all missed writes zero PNGs
    // and otherwise reports green — the failure this repo names "a harness that
    // cannot tell nothing-broke from nothing-ran".
    expect(framesTaken() - before).toBe(EXPECTED)
    assertThemesActuallyDiffer()
    void signedIn
  })

  test('populated — four posts, two published, credits spent', async ({ page, signedIn }) => {
    test.setTimeout(600_000)
    const before = framesTaken()
    await bootstrap(page)

    const admin = adminClient()
    expect(admin, 'the populated pass needs the service key to seed and clean up').not.toBeNull()
    const workspaceId = await workspaceIdFor(admin as SupabaseClient, signedIn.clerkUserId)
    expect(workspaceId, 'the app did not bootstrap a workspace').toBeTruthy()
    await seed(admin as SupabaseClient, workspaceId as string, signedIn.clerkUserId)
    await spendSome(workspaceId as string)

    await walk(page, 'populated')
    expect(framesTaken() - before).toBe(EXPECTED)
    assertThemesActuallyDiffer()
  })
})
