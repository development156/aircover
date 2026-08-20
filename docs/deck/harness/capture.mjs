/**
 * Capture the deck frames.
 *
 * Discipline, learned from a peer that lost 28 frames at once: ONE screen at a
 * time, written to disk and stat'd before the next is attempted, with a retry.
 * A run that dies half way keeps everything it had already taken.
 *
 * Usage:  node capture.mjs [onlyKey ...]
 */
import { readFileSync, mkdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

// pnpm hoists into .pnpm/, so resolve from apps/web rather than guessing a path.
const req = createRequire(
  '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots/apps/web/noop.js',
)
const { chromium } = req('@playwright/test')
const { clerkSetup, setupClerkTestingToken } = req('@clerk/testing/playwright')

const WT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots'
const SCRATCH =
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bba3e938-0904-498b-b8eb-82ebf7aa416b/scratchpad'
const OUT = `${WT}/docs/deck`
const BASE = 'http://127.0.0.1:3221'

mkdirSync(OUT, { recursive: true })

function envOf(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const fileEnv = envOf(`${WT}/apps/web/.env`)
process.env.CLERK_SECRET_KEY = fileEnv.CLERK_SECRET_KEY
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = fileEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const user = JSON.parse(readFileSync(`${SCRATCH}/deck-user.json`, 'utf8'))
const ids = JSON.parse(readFileSync(`${SCRATCH}/seed-ids.json`, 'utf8'))

/** Free MB, so a capture is never started into a box that will reap it. */
function freeMb() {
  const out = execFileSync('free', ['-m'], { encoding: 'utf8' })
  return Number(out.split('\n')[1].trim().split(/\s+/)[6])
}

// ── VIEWPORTS ───────────────────────────────────────────────────────────────
const ALL_VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'mobile', width: 390, height: 844 },
]
// ONLY_VP lets a re-shoot target one size without disturbing frames already taken.
const VIEWPORTS = process.env.ONLY_VP
  ? ALL_VIEWPORTS.filter((v) => v.tag === process.env.ONLY_VP)
  : ALL_VIEWPORTS

/** Bring the Channel variants section into a mobile frame. */
async function scrollToVariants(page) {
  const section = page.locator('[data-guide="post-variants"]').first()
  await section.waitFor({ state: 'visible', timeout: 15_000 })
  await section.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await page.evaluate(() => window.scrollBy(0, -70))
  await page.waitForTimeout(700)
}

// ── THE SCREENS ─────────────────────────────────────────────────────────────
// `go` may navigate, click, wait — whatever it takes to reach the state.
const SCREENS = [
  { key: 'home', path: '/home' },
  { key: 'posts', path: '/posts' },
  {
    key: 'post-detail',
    path: `/posts/${ids.heroPostId}`,
    // On mobile the editor stacks Media -> Post -> Channel variants, so the part
    // that makes this screen matter sits below an 844px fold. Without this the
    // Instagram and LinkedIn mobile frames were byte-identical.
    async go(page, vp) {
      if (vp.tag !== 'mobile') return
      await scrollToVariants(page)
    },
    noScrollReset: true,
  },
  {
    // The same post, LinkedIn tab: different copy, a 3,000 limit, and no warning.
    // The editor shows one variant at a time, so the contrast needs two frames.
    key: 'post-detail-linkedin',
    path: `/posts/${ids.heroPostId}`,
    async go(page, vp) {
      const tab = page
        .getByRole('tab', { name: /linkedin/i })
        .or(page.getByRole('button', { name: /^linkedin$/i }))
        .first()
      await tab.waitFor({ state: 'visible', timeout: 15_000 })
      await tab.click()
      await page.waitForTimeout(900)
      if (vp.tag === 'mobile') await scrollToVariants(page)
    },
    noScrollReset: true,
  },
  { key: 'planner', path: '/planner' },
  {
    // The brief asks for the month view; /planner opens on List.
    key: 'planner-calendar',
    path: '/planner',
    async go(page, vp) {
      const btn = page
        .getByRole('button', { name: /^calendar$/i })
        .or(page.getByRole('link', { name: /^calendar$/i }))
        .first()
      await btn.waitFor({ state: 'visible', timeout: 15_000 })
      await btn.click()
      await page.waitForTimeout(1500)
      // The "Plan my week" panel sits above the grid, so the month falls below the
      // fold. Anchor the month heading to the top of the viewport rather than
      // wheeling a fixed distance — a fixed 620px overshoots at 390px wide and
      // leaves a clipped week row across the top of the frame.
      const month = page.getByText(/August 2026/).first()
      await month.waitFor({ state: 'visible', timeout: 15_000 })
      await month.evaluate((el) => {
        const card = el.closest('section, div[class*="rounded"]') ?? el
        card.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
      await page.evaluate(() => window.scrollBy(0, -70))
      await page.waitForTimeout(800)
    },
    noScrollReset: true,
  },
  { key: 'analytics', path: '/analytics' },
  { key: 'brain', path: '/brain' },
  { key: 'inbox', path: '/inbox' },
  { key: 'connections', path: '/connections' },
  { key: 'wallet', path: '/wallet' },
  { key: 'assets', path: '/assets' },
  { key: 'campaigns', path: '/campaigns' },
  { key: 'settings', path: '/settings' },
]

const only = process.argv.slice(2)
const wanted = only.length ? SCREENS.filter((s) => only.includes(s.key)) : SCREENS

// ── SIGN IN ─────────────────────────────────────────────────────────────────
async function signIn(page) {
  await setupClerkTestingToken({ page })
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: user.clerkUserId, expires_in_seconds: 900 }),
  })
  if (!res.ok) throw new Error(`sign-in ticket failed ${res.status}: ${await res.text()}`)
  const { token } = await res.json()
  await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })
}

/** Everything that must not appear in a projected frame. */
const CLEAN_CSS = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast], [data-nextjs-dialog-overlay] {
    display: none !important;
  }
  html { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`

await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY })

const taken = []
const missed = []

/**
 * A fresh browser + signed-in page.
 *
 * Rebuilt on demand because Chromium's RENDERER can die under memory pressure
 * ("Page crashed") while node stays healthy. The first run retried inside the
 * dead page and lost seven consecutive desktop frames to one crash — a retry
 * that reuses the corpse is not a retry.
 */
async function newSession(vp) {
  const browser = await chromium.launch({
    args: [
      '--force-color-profile=srgb',
      '--disable-dev-shm-usage',
      '--js-flags=--max-old-space-size=512',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'nextjs-portal{display:none!important}'
    document.documentElement.appendChild(style)
  })
  await signIn(page)
  return { browser, context, page }
}

for (const vp of VIEWPORTS) {
  let session = await newSession(vp)
  let { page } = session
  console.log(`[${vp.tag}] signed in`)

  for (const screen of wanted) {
    const file = `${OUT}/${screen.key}-${vp.tag}.png`
    let ok = false
    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
      const mb = freeMb()
      if (mb < 700) {
        console.log(`[${vp.tag}] ${screen.key}: only ${mb}MB free — waiting 20s`)
        await new Promise((r) => setTimeout(r, 20_000))
      }
      try {
        await page.goto(`${BASE}${screen.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 90_000,
        })
        await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {})
        if (screen.go) await screen.go(page, vp)
        await page.addStyleTag({ content: CLEAN_CSS })
        await page.mouse.move(vp.width - 2, vp.height - 2)
        if (!screen.noScrollReset) await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(1200)
        await page.screenshot({ path: file, scale: 'device' })

        const size = statSync(file).size
        if (size < 3000) throw new Error(`suspiciously small frame (${size}b)`)
        console.log(`[${vp.tag}] ✓ ${screen.key}  ${(size / 1024).toFixed(0)}KB  ${page.url()}`)
        taken.push({ key: screen.key, vp: vp.tag, file, bytes: size, url: page.url() })
        ok = true
      } catch (err) {
        const why = err.message.split('\n')[0]
        console.log(`[${vp.tag}] ✗ ${screen.key} attempt ${attempt}: ${why}`)
        // A dead renderer poisons every later goto on the same page. Rebuild.
        if (/crash|Target closed|has been closed|Session closed/i.test(why)) {
          console.log(`[${vp.tag}]   renderer died — rebuilding the browser`)
          await session.browser.close().catch(() => {})
          await new Promise((r) => setTimeout(r, 5000))
          session = await newSession(vp)
          page = session.page
        }
        if (attempt === 3) missed.push({ key: screen.key, vp: vp.tag, why })
      }
    }
  }

  await session.browser.close().catch(() => {})
  console.log(`[${vp.tag}] done\n`)
}

// A frame that is BYTE-IDENTICAL to another is a silent no-op wearing the clothes
// of a success — a tab that did not switch, a scroll that did not move. The only
// quality gate used to be "bigger than 3KB", which such a frame passes.
const byHash = new Map()
for (const t of taken) {
  const h = createHash('md5').update(readFileSync(t.file)).digest('hex')
  if (!byHash.has(h)) byHash.set(h, [])
  byHash.get(h).push(`${t.key}-${t.vp}`)
}
const dupes = [...byHash.values()].filter((g) => g.length > 1)
if (dupes.length > 0) {
  console.log('── IDENTICAL FRAMES (a capture did not do what it claimed) ──')
  for (const g of dupes) console.log('  ' + g.join('  ==  '))
  console.log('')
}

console.log('── CAPTURED ──')
for (const t of taken)
  console.log(`  ${t.file.replace(WT + '/', '')}  (${(t.bytes / 1024).toFixed(0)}KB)`)
if (missed.length) {
  console.log('\n── NOT CAPTURED ──')
  for (const m of missed) console.log(`  ${m.key} @ ${m.vp}: ${m.why}`)
}
console.log(`\n${taken.length} frames, ${missed.length} missed`)
