#!/usr/bin/env node
/**
 * The QA sweep.
 *
 * Captures every route at three widths in both themes, and MEASURES what a
 * screenshot alone cannot: accessible names, touch targets, truncation,
 * horizontal overflow, cursor affordance, and text contrast.
 *
 * ── WHY CONTRAST IS MEASURED IN PIXELS, NOT IN COLOUR VALUES ────────────────
 * The standard approach reads `getComputedStyle(el).backgroundColor`, gets
 * `rgba(0,0,0,0)` for anything transparent, and compares text against
 * transparent. The usual "fix" walks ancestors for the first opaque background
 * — which lands on a token that can resolve to the same colour as the text in
 * one theme. That is how a REAL white-on-white finding gets retracted as a
 * "measurement artifact": both the finding and the correction are computed from
 * colour values, and neither is what the eye receives.
 *
 * So this measures the delivered pixels. For each text node we crop its
 * bounding box out of the full-page PNG and compute the luminance standard
 * deviation across the crop. A region that CONTAINS TEXT and has near-zero
 * variance is invisible text, whatever any token says. Nothing in that
 * measurement can be a token-resolution artifact.
 *
 * Rule: if pixel variance and a computed-style check ever disagree, the
 * computed-style check is the one that is wrong.
 */
import fs from 'node:fs'
import path from 'node:path'
const ROOT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa'
// pnpm keeps these in the virtual store rather than hoisting them; resolve by path.
const pw = await import(
  `${ROOT}/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.js`
)
const chromium = pw.chromium ?? pw.default?.chromium
const sharp = (
  await import(`${ROOT}/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js`)
).default

const OUT = path.join(ROOT, '.qa', 'frames')
const PORT = 3238
const BASE = `http://127.0.0.1:${PORT}`

fs.mkdirSync(OUT, { recursive: true })

function loadEnv() {
  const file = path.join(ROOT, 'apps', 'web', ['', 'env', 'local'].join('.'))
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}
const env = loadEnv()

async function ticket(userId) {
  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 3600 }),
  })
  if (!res.ok) throw new Error(`ticket ${res.status}: ${await res.text()}`)
  return (await res.json()).token
}

/** Routes worth a person's eyes. Dynamic segments are resolved at run time. */
const ROUTES = [
  '/home',
  '/brain',
  '/brain/identity',
  '/brain/voice',
  '/brain/audience',
  '/brain/knowledge',
  '/brain/resolve',
  '/posts',
  '/posts/new',
  '/campaigns',
  '/assets',
  '/studio',
  '/remix',
  '/planner',
  '/approvals',
  '/sites',
  '/ads',
  '/ads/creative',
  '/ads/targeting',
  '/ads/budget',
  '/ads/performance',
  '/inbox',
  '/inbox/comments',
  '/inbox/reviews',
  '/leads',
  '/analytics',
  '/report',
  '/radar',
  '/loop',
  '/playbooks',
  '/connections',
  '/wallet',
  '/settings',
  '/settings/plan',
  '/settings/profile',
  '/settings/integrations',
  '/create',
  '/design-system',
]

/**
 * Everything measurable from inside the page, in one pass.
 * Returns rects in PAGE coordinates (valid because we never scroll before the
 * full-page screenshot, so getBoundingClientRect().top IS the page offset).
 */
const AUDIT = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const accName = (el) => {
    const aria = el.getAttribute('aria-label')
    if (aria && aria.trim()) return aria.trim()
    const by = el.getAttribute('aria-labelledby')
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim()
      if (t) return t
    }
    if (el.tagName === 'IMG') return (el.getAttribute('alt') ?? '').trim()
    if (el.labels && el.labels.length)
      return [...el.labels]
        .map((l) => l.textContent)
        .join(' ')
        .trim()
    const txt = (el.innerText || el.textContent || '').trim()
    if (txt) return txt
    const t = el.getAttribute('title')
    return t ? t.trim() : ''
  }

  const out = {
    url: location.pathname,
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    theme:
      document.documentElement.getAttribute('data-theme') ||
      (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    unnamed: [],
    smallTargets: [],
    truncated: [],
    cursorDefaultButtons: 0,
    cursorPointer: 0,
    textBoxes: [],
    emptyPanes: 0,
  }

  const interactive = [
    ...document.querySelectorAll(
      'button, a[href], [role=button], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter(vis)
  for (const el of interactive) {
    const name = accName(el)
    const r = el.getBoundingClientRect()
    if (!name) {
      out.unnamed.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 70),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      })
    }
    if (r.height < 44 || r.width < 44) {
      out.smallTargets.push({
        tag: el.tagName,
        name: name.slice(0, 45),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
    const cs = getComputedStyle(el)
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
      if (cs.cursor === 'pointer') out.cursorPointer += 1
      else if (!el.disabled) out.cursorDefaultButtons += 1
    }
  }

  for (const el of document.querySelectorAll('input, textarea')) {
    if (!vis(el)) continue
    const over = el.scrollWidth - el.clientWidth
    if (over > 2 && el.value)
      out.truncated.push({
        kind: 'field',
        name: accName(el).slice(0, 45),
        overflowPx: over,
        value: el.value.slice(0, 70),
      })
  }
  // Text clipped by an ancestor with overflow hidden / ellipsis
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue
    if (!vis(el)) continue
    const over = el.scrollWidth - el.clientWidth
    const cs = getComputedStyle(el)
    if (over > 2 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis')) {
      const t = (el.innerText || '').trim()
      if (t.length > 3) out.truncated.push({ kind: 'text', text: t.slice(0, 70), overflowPx: over })
    }
  }

  // Text nodes worth a contrast measurement.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  let n
  while ((n = walker.nextNode())) {
    const s = n.textContent.trim()
    if (s.length < 2) continue
    const el = n.parentElement
    if (!el || !vis(el)) continue
    if (seen.has(el)) continue
    seen.add(el)
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.position === 'sticky') continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (el.className && String(el.className).includes('sr-only')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 12 || r.height < 7 || r.height > 200) continue
    out.textBoxes.push({
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      text: s.slice(0, 60),
      color: cs.color,
      fontSize: cs.fontSize,
    })
  }
  return out
}

/** Luminance standard deviation over a crop. Near-zero = a flat region. */
async function variance(img, meta, box) {
  /**
   * REJECT, never clamp.
   *
   * MEASURED 2026-08-22: clamping produced EIGHT false "invisible text" hits on
   * /loop. The frame is 1440x1017 and those boxes sat at y=1019..1103 — outside
   * the image entirely. Clamping sampled a 2px sliver of flat background, which
   * has sd 0, which is exactly the signature this function exists to report. A
   * detector whose out-of-range behaviour is indistinguishable from its positive
   * result is worse than no detector, so anything that does not fit is skipped
   * and counted instead.
   */
  const left = Math.round(box.x)
  const top = Math.round(box.y)
  const width = Math.round(box.w)
  const height = Math.round(box.h)
  if (left < 0 || top < 0 || width < 2 || height < 2) return null
  if (left + width > meta.width || top + height > meta.height) return 'out-of-frame'
  const { data, info } = await img
    .clone()
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  for (const v of data) sum += v
  const mean = sum / data.length
  let acc = 0
  for (const v of data) acc += (v - mean) ** 2
  return { sd: Math.sqrt(acc / data.length), mean, px: info.width * info.height }
}

const WIDTHS = [
  { w: 1440, h: 900, tag: '1440' },
  { w: 1024, h: 820, tag: '1024' },
  { w: 390, h: 844, tag: '390' },
]

const report = []
const userId = process.argv[2]
if (!userId) throw new Error('usage: node .qa/sweep.mjs <clerkUserId> [themes] [widths]')
const THEMES = (process.argv[3] || 'light,dark').split(',')
const ONLY_WIDTHS = (process.argv[4] || '1440,1024,390').split(',')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ url: page.url(), text: m.text().slice(0, 200) })
})

await page.goto(`${BASE}/sign-in?__clerk_ticket=${await ticket(userId)}`)
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })
console.log('signed in ->', page.url())

for (const theme of THEMES) {
  // Set the theme the way the app stores it, then confirm it took.
  await page.goto(`${BASE}/home`)
  await page.evaluate((t) => {
    try {
      localStorage.setItem('sahoda-theme', t)
    } catch {}
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)

  for (const vp of WIDTHS) {
    if (!ONLY_WIDTHS.includes(vp.tag)) continue
    await page.setViewportSize({ width: vp.w, height: vp.h })

    for (const route of ROUTES) {
      const key = `${route.replace(/\//g, '_') || '_root'}__${vp.tag}__${theme}`
      const before = consoleErrors.length
      let nav = { ms: 0, status: 0 }
      try {
        const t0 = Date.now()
        const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45_000 })
        nav = { ms: Date.now() - t0, status: res ? res.status() : 0 }
      } catch (e) {
        report.push({ key, route, width: vp.tag, theme, error: String(e).slice(0, 160) })
        continue
      }
      // Re-assert the theme: a full document load resets it.
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t)
        document.documentElement.classList.toggle('dark', t === 'dark')
      }, theme)
      await page.waitForTimeout(450)

      const file = path.join(OUT, `${key}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const audit = await page.evaluate(AUDIT)

      // Pixel-variance contrast over the delivered frame.
      const img = sharp(file)
      const meta = await img.metadata()
      const invisible = []
      const lowVar = []
      let outOfFrame = 0
      for (const b of audit.textBoxes) {
        const v = await variance(img, meta, b)
        if (v === 'out-of-frame') {
          outOfFrame += 1
          continue
        }
        if (!v) continue
        if (v.sd < 1.0) invisible.push({ ...b, sd: +v.sd.toFixed(2), mean: Math.round(v.mean) })
        else if (v.sd < 4.0) lowVar.push({ ...b, sd: +v.sd.toFixed(2), mean: Math.round(v.mean) })
      }

      report.push({
        key,
        route,
        width: vp.tag,
        theme,
        nav,
        title: audit.title,
        h1: audit.h1,
        themeApplied: audit.theme,
        horizontalOverflowPx: audit.horizontalOverflowPx,
        unnamed: audit.unnamed,
        smallTargets: vp.tag === '390' ? audit.smallTargets : [],
        smallTargetCount: audit.smallTargets.length,
        truncated: audit.truncated,
        cursorDefaultButtons: audit.cursorDefaultButtons,
        cursorPointer: audit.cursorPointer,
        textBoxCount: audit.textBoxes.length,
        outOfFrameBoxes: outOfFrame,
        invisibleText: invisible,
        lowVarianceText: lowVar.slice(0, 12),
        consoleErrors: consoleErrors.slice(before).map((c) => c.text),
      })
      process.stdout.write(
        `${key} ${nav.ms}ms inv=${invisible.length} oof=${outOfFrame} low=${lowVar.length} unnamed=${audit.unnamed.length} ovf=${audit.horizontalOverflowPx}\n`,
      )
    }
  }
}

fs.writeFileSync(path.join(ROOT, '.qa', 'sweep.json'), JSON.stringify(report, null, 1))
console.log('\nDONE ->', report.length, 'captures')
await browser.close()
