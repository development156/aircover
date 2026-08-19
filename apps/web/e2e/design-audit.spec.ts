import { test } from './fixtures/seeded-user'
import { adminClient } from './fixtures/seeded-user'
import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'

/**
 * The design audit's camera.
 *
 * NOT a test — it asserts nothing. It bootstraps one real workspace, seeds it
 * with enough content that dense screens render as dense screens, and shoots
 * every sampled route at two widths in both themes. The output is the evidence
 * docs/26 is argued from.
 *
 * Skipped unless DESIGN_AUDIT=1, because it is slow and the gate must stay
 * fast. It is committed rather than thrown away so the next session can
 * re-shoot the same frames after changing a token and compare like with like.
 *
 * Run:  DESIGN_AUDIT=1 pnpm exec playwright test design-audit --grep-invert @smoke
 */

const OUT = process.env.DESIGN_AUDIT_OUT ?? 'design-audit'

/** One archetype per row — the point is coverage of KINDS of screen, not of URLs. */
const ROUTES: ReadonlyArray<{ path: string; slug: string; archetype: string }> = [
  { path: '/home', slug: 'home', archetype: 'dashboard' },
  { path: '/posts', slug: 'posts', archetype: 'dense list' },
  { path: '/posts/new', slug: 'composer', archetype: 'composer' },
  { path: '/approvals', slug: 'approvals', archetype: 'queue' },
  { path: '/planner', slug: 'planner', archetype: 'calendar' },
  { path: '/brain', slug: 'brain', archetype: 'status hub' },
  { path: '/brain/identity', slug: 'brain-identity', archetype: 'long form' },
  { path: '/analytics', slug: 'analytics', archetype: 'data' },
  { path: '/wallet', slug: 'wallet', archetype: 'money' },
  { path: '/connections', slug: 'connections', archetype: 'integrations' },
  { path: '/inbox', slug: 'inbox', archetype: 'list + detail' },
  { path: '/campaigns', slug: 'campaigns', archetype: 'collection' },
  { path: '/sites', slug: 'sites', archetype: 'empty' },
  { path: '/assets', slug: 'assets', archetype: 'gallery' },
  { path: '/settings', slug: 'settings', archetype: 'form' },
  { path: '/settings/plan', slug: 'settings-plan', archetype: 'pricing' },
]

const VIEWPORTS = [
  { w: 1440, h: 900, name: '1440' },
  { w: 390, h: 844, name: '390' },
] as const

const THEMES = ['light', 'dark'] as const

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem('sahoda-theme', t as string)
    } catch {
      /* storage blocked — the init script is best-effort */
    }
  }, theme)
}

/**
 * Content, not lorem. A dense screen only reveals its density problems when the
 * strings are the length real strings are — short filler makes every table look
 * comfortable.
 */
const SEED_POSTS = [
  {
    title: 'Diwali hamper pre-orders open',
    status: 'scheduled',
    channels: ['instagram', 'linkedin'],
  },
  { title: 'New cold brew — tasting notes', status: 'draft', channels: ['instagram'] },
  { title: 'We are hiring a weekend barista', status: 'review', channels: ['linkedin'] },
  { title: 'Monsoon menu, back by demand', status: 'published', channels: ['instagram', 'x'] },
  { title: 'Storefront closed Tuesday for repairs', status: 'approved', channels: ['gbp'] },
  {
    title: 'Behind the counter: how we roast',
    status: 'draft',
    channels: ['instagram', 'linkedin', 'x'],
  },
  { title: 'Loyalty cards are live', status: 'published', channels: ['gbp', 'instagram'] },
  { title: 'Weekend special: filter coffee flight', status: 'failed', channels: ['x'] },
]

test.describe('design audit', () => {
  test.skip(process.env.DESIGN_AUDIT !== '1', 'set DESIGN_AUDIT=1 to shoot the audit')
  test.setTimeout(15 * 60_000)

  test('shoot every sampled route at two widths in both themes', async ({
    page,
    signedIn,
    browser,
  }) => {
    // ── Bootstrap a real workspace through the app's own RPC path.
    await page.goto('/home')
    const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })

    // ── Seed content directly. Service-role is legitimate in test scaffolding.
    const admin = adminClient()
    if (!admin) throw new Error('design audit needs SUPABASE_SERVICE_ROLE_KEY to seed content')

    const { data: ws } = await admin
      .from('workspaces')
      .select('id')
      .eq('created_by', signedIn.clerkUserId)
      .limit(1)
    const workspaceId = ws?.[0]?.id as string | undefined
    if (!workspaceId) throw new Error('workspace bootstrap did not produce a row')

    const now = Date.now()
    const rows = SEED_POSTS.map((p, i) => ({
      workspace_id: workspaceId,
      title: p.title,
      body: `${p.title}. Full body copy so the editor and the list both render at a realistic length rather than collapsing to a single short line.`,
      status: p.status,
      channels: p.channels,
      created_by: signedIn.clerkUserId,
      scheduled_at:
        p.status === 'scheduled' ? new Date(now + (i + 1) * 86_400_000).toISOString() : null,
    }))
    const { data: inserted, error } = await admin.from('posts').insert(rows).select('id, channels')
    if (error) throw new Error(`seeding posts failed: ${error.message}`)

    const variants = (inserted ?? []).flatMap((p: { id: string; channels: string[] }) =>
      p.channels.map((c) => ({
        workspace_id: workspaceId,
        post_id: p.id,
        channel: c,
        body: 'Fresh batch on the counter from 7am. Come early — the first tray goes fast.',
        char_count: 78,
      })),
    )
    const { error: vErr } = await admin.from('post_variants').insert(variants)
    if (vErr) throw new Error(`seeding variants failed: ${vErr.message}`)

    console.log(
      `[audit] seeded workspace ${workspaceId}: ${rows.length} posts, ${variants.length} variants`,
    )

    // ── Shoot. A fresh context per theme so the init script actually applies.
    for (const theme of THEMES) {
      const context = await browser.newContext()
      const shot = await context.newPage()
      await setTheme(shot, theme)

      // Re-establish the session in this context by copying the signed-in state.
      const state = await page.context().storageState()
      await context.addCookies(state.cookies)

      for (const vp of VIEWPORTS) {
        await shot.setViewportSize({ width: vp.w, height: vp.h })
        const dir = `${OUT}/${theme}-${vp.name}`
        mkdirSync(dir, { recursive: true })

        for (const route of ROUTES) {
          try {
            await shot.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            // Let the route settle; many screens fetch after mount.
            await shot.waitForTimeout(1800)
            await shot.screenshot({ path: `${dir}/${route.slug}.png`, fullPage: true })
          } catch (e) {
            console.log(`[audit] ${theme}/${vp.name}${route.path} FAILED: ${(e as Error).message}`)
          }
        }
      }
      await context.close()
    }
  })
})
