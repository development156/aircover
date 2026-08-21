import type { SupabaseClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

import { adminClient, test } from './fixtures/seeded-user'
import { shot, timedGoto, useTheme, type Theme } from './helpers/ux-shot'

/**
 * JOURNEY 2 — THE RETURNING USER.
 *
 * A workspace that has been used: a Brand Brain, and posts sitting in four
 * different states. The question this journey asks is not "does it render" but
 * "can this person find what they were doing, and does /home answer *what needs
 * me*".
 *
 * ── WHY THE STATE IS SEEDED AND NOT DRIVEN ───────────────────────────────────
 * Driving it would cost a paid resolve plus twelve composer round-trips per
 * (width, theme), and the journey under examination starts AFTER all of that.
 * The rows are written through `adminClient()` — test scaffolding, never app
 * code — under the workspace the app itself bootstrapped for this run's Clerk
 * user, so `cleanupSupabase` removes every one of them when the test ends. A row
 * hung off any other workspace would leak into the shared dev database.
 */

const JOURNEY = 'j2-returning'

/** A payload matching `BrandMemoryPayloadSchema`. Fixed-length arrays are exactly 3. */
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

interface SeededPost {
  title: string
  body: string
  status: string
  channels: string[]
  scheduledAt: string | null
}

/**
 * Four states, because the returning user's real question is which of their
 * posts is waiting on THEM. A list where everything says "draft" cannot answer
 * that, and neither can a test that seeds four drafts.
 */
const POSTS: SeededPost[] = [
  {
    title: 'Tuesday roast is on the shelf',
    body: 'Tuesday roast is on the shelf. Ethiopian Guji, roasted 48 hours ago, and we will tell you the date before you ask.',
    status: 'draft',
    channels: ['instagram'],
    scheduledAt: null,
  },
  {
    title: 'Saturday cupping, five seats',
    body: 'Saturday cupping is open again. Five seats, no charge, 9am. Bring nobody or bring everybody.',
    status: 'review',
    channels: ['instagram', 'linkedin'],
    scheduledAt: null,
  },
  {
    title: 'What a roast date actually tells you',
    body: 'A roast date is the only number on a coffee bag that changes what is in your cup. Here is how to read one.',
    status: 'scheduled',
    channels: ['linkedin'],
    scheduledAt: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
  },
  {
    title: 'The Guji is finished',
    body: 'The Guji is finished for this week. The Sidamo lands Tuesday.',
    status: 'draft',
    channels: ['x'],
    scheduledAt: null,
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

async function seed(
  admin: SupabaseClient,
  workspaceId: string,
  clerkUserId: string,
): Promise<void> {
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
        publish_status: p.status === 'scheduled' ? 'scheduled' : 'pending',
      })
    }
  }
}

/** The routes a returning person actually opens, in the order they open them. */
const STOPS: string[] = [
  '/home',
  '/posts',
  '/approvals',
  '/planner',
  '/brain',
  '/brain/identity',
  '/brain/voice',
  '/analytics',
  '/wallet',
]

async function run(page: Page, width: number, theme: Theme, clerkUserId: string): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await useTheme(page, theme)

  // Bootstrap through the real UI, then seed on top of the workspace it made.
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 10_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    /* already bootstrapped */
  }

  const admin = adminClient()
  if (admin) {
    const workspaceId = await workspaceIdFor(admin, clerkUserId)
    if (workspaceId) await seed(admin, workspaceId, clerkUserId)
  }

  for (const route of STOPS) {
    const ms = await timedGoto(page, route)
    await shot(page, {
      journey: JOURNEY,
      stop: route.slice(1).replace(/\//g, '-'),
      width,
      theme,
      ms,
      note: admin ? undefined : 'NO SERVICE KEY — this frame is an UNSEEDED workspace',
    })
  }

  // The one interaction that matters here: can they reopen the thing they left?
  await timedGoto(page, '/posts')
  const firstPost = page.getByText(/Saturday cupping/i).first()
  try {
    await firstPost.waitFor({ state: 'visible', timeout: 8000 })
    await firstPost.click()
    await page.waitForTimeout(2000)
    await shot(page, { journey: JOURNEY, stop: 'reopen-the-draft', width, theme })
  } catch {
    await shot(page, {
      journey: JOURNEY,
      stop: 'reopen-the-draft',
      width,
      theme,
      note: 'the seeded post was not reachable from /posts by its own words',
    })
  }
}

const COMBOS: { width: number; theme: Theme }[] = [
  { width: 1440, theme: 'light' },
  { width: 1024, theme: 'light' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 1024, theme: 'dark' },
  { width: 390, theme: 'dark' },
]

for (const { width, theme } of COMBOS) {
  test(`ux j2 returning ${width} ${theme}`, async ({ page, signedIn }) => {
    test.setTimeout(300_000)
    await run(page, width, theme, signedIn.clerkUserId)
  })
}
