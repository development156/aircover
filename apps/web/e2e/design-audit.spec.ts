import { test } from './fixtures/seeded-user'
import { adminClient } from './fixtures/seeded-user'
import { mkdirSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

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
  // docs/27 §0 named the four /inbox sub-routes as NOT sampled. These two have
  // static paths and are added here. The other two are
  // /inbox/comments/[accountId]/[platformPostId] and
  // /inbox/threads/[accountId]/[conversationId]: they need a real connected
  // account and a real conversation id, which this harness does not seed, so
  // they stay unsampled rather than being shot in their not-found state and
  // filed as evidence of a design.
  { path: '/inbox/comments', slug: 'inbox-comments', archetype: 'list + detail' },
  { path: '/inbox/reviews', slug: 'inbox-reviews', archetype: 'list + detail' },
  { path: '/campaigns', slug: 'campaigns', archetype: 'collection' },
  { path: '/sites', slug: 'sites', archetype: 'empty' },
  { path: '/assets', slug: 'assets', archetype: 'gallery' },
  { path: '/settings', slug: 'settings', archetype: 'form' },
  { path: '/settings/plan', slug: 'settings-plan', archetype: 'pricing' },
  // The designed-but-unbuilt sections. They belong in this camera for the same
  // reason they belong in the nav: a roadmap screen that is not looked at drifts
  // away from the built ones, and the whole claim of this pass is that it is
  // designed as well as the rest. One per SHAPE — a stage sequence, a recipe
  // library, a watch list, a document, a pipeline, a gallery, a fan-out.
  { path: '/loop', slug: 'loop', archetype: 'roadmap · sequence' },
  { path: '/playbooks', slug: 'playbooks', archetype: 'roadmap · library' },
  { path: '/radar', slug: 'radar', archetype: 'roadmap · watch list' },
  { path: '/report', slug: 'report', archetype: 'roadmap · document' },
  // No longer a roadmap screen: both doors into `leads` are open, so this is a
  // real pipeline over real rows. Kept in the camera because a pipeline is a
  // SHAPE this pass wants photographed, which is why it was here to begin with.
  { path: '/leads', slug: 'leads', archetype: 'pipeline' },
  { path: '/studio', slug: 'studio', archetype: 'roadmap · gallery' },
  // No longer a roadmap screen either: it plans a batch, prices it out of
  // pricing.config.json and charges for it. Still the fan-out shape.
  { path: '/remix', slug: 'remix', archetype: 'fan-out · priced' },
  { path: '/ads', slug: 'ads', archetype: 'roadmap · table' },
  // No longer a roadmap screen. It reads a workspace, a connection and a live
  // platform call, and its most common state is one the platform imposes.
  { path: '/brain/audience', slug: 'brain-audience', archetype: 'two-layer evidence' },
  { path: '/brain/knowledge', slug: 'brain-knowledge', archetype: 'roadmap · empty table' },

  // ── Added by wt-screens ─────────────────────────────────────────────────────
  // docs/27 §0 listed these under "not sampled" and docs/28 did not reach them,
  // so nothing has ever photographed them. They are static paths, so the only
  // reason they were missing is that nobody added the row.
  { path: '/create', slug: 'create', archetype: 'chooser' },
  { path: '/brain/voice', slug: 'brain-voice', archetype: 'long form' },
  { path: '/brain/competitors', slug: 'brain-competitors', archetype: 'long form' },
  { path: '/settings/profile', slug: 'settings-profile', archetype: 'form' },
  { path: '/settings/integrations', slug: 'settings-integrations', archetype: 'form' },
  { path: '/design-system', slug: 'design-system', archetype: 'gallery' },

  // DELIBERATELY still unsampled, and the reason is the same one docs/27 gave
  // for the two /inbox detail routes — a frame of the wrong screen is worse
  // than no frame:
  //
  //   /sign-in, /sign-up  — this fixture is SIGNED IN, so Clerk redirects both
  //                         away. The camera would file /home as evidence of
  //                         the sign-in design.
  //   /onboarding         — the seed bootstraps a workspace before shooting, and
  //                         onboarding is the screen you see when you do NOT
  //                         have one. Same failure: it would photograph the
  //                         completed state and file it as the empty one.
  //
  // Both need a fixture whose user is in the state the screen exists to serve.
  // Auditing them from code is honest; auditing them from a redirect is not.
]

/**
 * A per-route filter, so evidence for ONE screen costs 4 frames instead of 72.
 *
 * MEASURED: a full pass is 72 frames and took ~40 minutes on a loaded box. At
 * that price a session shoots once, edits everything, and shoots again — which
 * is how the 2026-08-20 run ended up with `light-1440/home.png` showing the old
 * layout and `light-390/home.png` showing the new one IN THE SAME RUN. The
 * camera points at a live dev server, so anything edited while it runs is
 * photographed mid-change and filed as evidence of a design that never existed.
 *
 * Cheap enough per route, the discipline becomes possible: shoot one route's
 * before, edit only that route, shoot its after.
 *
 *   DESIGN_AUDIT=1 DESIGN_AUDIT_ROUTES=home,posts DESIGN_AUDIT_OUT=... \
 *     pnpm exec playwright test design-audit
 */
const ONLY = (process.env.DESIGN_AUDIT_ROUTES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const SHOOT = ONLY.length > 0 ? ROUTES.filter((r) => ONLY.includes(r.slug)) : ROUTES

/**
 * Routes whose path does not exist until the workspace has been seeded.
 *
 * ── WHY THIS HAD TO BE ADDED ─────────────────────────────────────────────────
 * `ROUTES` above is a list of literal paths, so the camera could only ever point
 * at a STATIC route. That silently excluded `/posts/[id]` — the per-channel
 * variant editor, which is the one screen carrying the thing this product does
 * that its competitors do not (one body per channel, published independently,
 * `publish_status` per variant). docs/27 §0 listed it under "not sampled" and
 * docs/28 did not reach it either, so the most important screen in the app has
 * never been photographed by anything.
 *
 * The seed already creates exactly what such a shot needs. It is resolved AFTER
 * the insert rather than declared above, because the id is not knowable until
 * Postgres has minted it.
 *
 * A resolver returning `null` SKIPS its route and says so on stdout. It must
 * never fall back to a literal path: `/posts/undefined` renders the 404, and a
 * 404 filed in the audit directory is evidence of a design that does not exist.
 */
interface SeededPost {
  id: string
  channels: string[]
}

const DYNAMIC: ReadonlyArray<{
  slug: string
  archetype: string
  resolve: (posts: readonly SeededPost[]) => string | null
}> = [
  {
    slug: 'posts-detail',
    archetype: 'editor',
    // The post with the MOST channels, so the variant tab strip renders as a
    // strip. Shooting a single-channel post would photograph the one arrangement
    // in which per-channel editing looks like ordinary editing.
    resolve: (posts) => {
      const richest = [...posts].sort((a, b) => b.channels.length - a.channels.length)[0]
      return richest ? `/posts/${richest.id}` : null
    },
  },
]

const SHOOT_DYNAMIC = ONLY.length > 0 ? DYNAMIC.filter((r) => ONLY.includes(r.slug)) : DYNAMIC

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

    // ── Resolve the routes whose path the seed just made knowable.
    const seededPosts = (inserted ?? []) as SeededPost[]
    const resolved: { path: string; slug: string; archetype: string }[] = []
    for (const route of SHOOT_DYNAMIC) {
      const path = route.resolve(seededPosts)
      if (path === null) {
        console.log(`[audit] ${route.slug} SKIPPED: the seed produced nothing to point at`)
        continue
      }
      console.log(`[audit] ${route.slug} resolved to ${path}`)
      resolved.push({ path, slug: route.slug, archetype: route.archetype })
    }
    const shootList = [...SHOOT, ...resolved]

    // ── Shoot. A fresh context per theme so the init script actually applies.
    let written = 0
    let failed = 0
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

        for (const route of shootList) {
          try {
            await shot.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            // Let the route settle; many screens fetch after mount.
            await shot.waitForTimeout(1800)
            await shot.screenshot({ path: `${dir}/${route.slug}.png`, fullPage: true })
            written += 1
          } catch (e) {
            failed += 1
            console.log(`[audit] ${theme}/${vp.name}${route.path} FAILED: ${(e as Error).message}`)
          }
        }
      }
      await context.close()
    }

    // ── Say how many frames actually reached the disk, and fail if none did.
    //
    // This spec asserts nothing ABOUT A DESIGN and still must not. But docs/28
    // §0 records this exact harness reporting `1 passed` having written ZERO
    // PNGs: 28 navigations timed out at load average 41.6, every failure was
    // swallowed by the catch above, and the green line was read as evidence
    // that frames existed. A run that photographed nothing is a broken camera,
    // not a passing test, and that is a fact about the harness.
    console.log(`[audit] frames written: ${written}, failed: ${failed}`)
    expect(written, 'the audit wrote no frames — nothing was photographed').toBeGreaterThan(0)
  })
})
