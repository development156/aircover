#!/usr/bin/env node
/**
 * The two things the sweep could not answer.
 *
 * 1. KEYBOARD — P2's first question, asked of the flow that matters most:
 *    can onboarding step 1 be completed with the keyboard alone?
 * 2. THROTTLED TIMING — the sweep's 1.7–2.4s is `networkidle` over loopback.
 *    A bakery owner on 4G does not see that number, so measure one that is
 *    closer to what they do see rather than quoting loopback as if it were
 *    a user experience.
 */
const ROOT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa'
const pw = await import(
  `${ROOT}/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.js`
)
const chromium = pw.chromium ?? pw.default?.chromium
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://127.0.0.1:3238'
const env = (() => {
  const out = {}
  for (const line of fs
    .readFileSync(path.join(ROOT, 'apps', 'web', ['', 'env', 'local'].join('.')), 'utf8')
    .split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq > 0)
      out[t.slice(0, eq).trim()] = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
  }
  return out
})()

const userId = process.argv[2]
const tk = await (
  await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 900 }),
  })
).json()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/sign-in?__clerk_ticket=${tk.token}`)
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })

// ── 1. KEYBOARD through onboarding step 1 ──────────────────────────────────
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
await page
  .locator('#main')
  .getByRole('button', { name: /create workspace/i })
  .click()
await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
await page.waitForTimeout(1200)

const describe = () =>
  page.evaluate(() => {
    const a = document.activeElement
    if (!a || a === document.body) return { tag: 'BODY', name: '(nothing focused)', outline: '' }
    const cs = getComputedStyle(a)
    return {
      tag: a.tagName + (a.type ? `[${a.type}]` : ''),
      name: (
        a.getAttribute('aria-label') ||
        (a.labels && a.labels[0]?.textContent) ||
        a.innerText ||
        a.value ||
        ''
      )
        .trim()
        .slice(0, 40),
      // A focus ring the eye can find. tokens.css ships one global treatment.
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      boxShadow: cs.boxShadow.slice(0, 40),
    }
  })

const tabOrder = []
let sawTextarea = false
let reachedContinue = false
for (let i = 0; i < 45; i++) {
  await page.keyboard.press('Tab')
  const d = await describe()
  tabOrder.push(d)
  if (d.tag === 'TEXTAREA') sawTextarea = true
  if (/^continue$/i.test(d.name)) {
    reachedContinue = true
    break
  }
}
const unfocusable = tabOrder.filter((d) => d.outline.startsWith('none') && !d.boxShadow.trim())

// Drive it for real: type in the box, arrow-key a radio, press the button.
await page.keyboard.press('Home')
const ta = page.locator('#intake-text')
await ta.focus()
await page.keyboard.type('I run a small bakery on Prabhat Road in Pune')
await page.waitForTimeout(600)
const beforeArrow = await page.evaluate(() =>
  [...document.querySelectorAll('input[type=radio]:checked')].map((r) => r.value).join(','),
)
// Focus the first radio group and move with ArrowRight, the reason the
// component chose native radios over buttons.
await page.locator('input[name="model"]:checked').focus()
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const afterArrow = await page.evaluate(() =>
  [...document.querySelectorAll('input[type=radio]:checked')].map((r) => r.value).join(','),
)

// Reach and activate Continue with the keyboard only.
let pressedContinue = false
for (let i = 0; i < 45; i++) {
  await page.keyboard.press('Tab')
  const d = await describe()
  if (/^continue$/i.test(d.name)) {
    await page.keyboard.press('Enter')
    pressedContinue = true
    break
  }
}
await page.waitForTimeout(1500)
const advanced = await page.evaluate(() =>
  /Show us how you already talk/i.test(document.body.innerText),
)

console.log('── KEYBOARD: onboarding step 1 ──')
console.log(`  reached Continue by Tab alone : ${reachedContinue}`)
console.log(`  textarea in the tab order     : ${sawTextarea}`)
console.log(`  stops with NO visible focus   : ${unfocusable.length} of ${tabOrder.length}`)
console.log(`  ArrowRight moved the radio    : ${beforeArrow} -> ${afterArrow}`)
console.log(`  Enter on Continue advanced    : ${pressedContinue && advanced}`)
console.log(
  `  VERDICT: ${reachedContinue && beforeArrow !== afterArrow && advanced ? 'COMPLETABLE BY KEYBOARD ALONE' : 'NOT completable'}`,
)

// ── 2. THROTTLED page loads (Fast 3G-ish + 4x CPU) ─────────────────────────
const routes = ['/home', '/posts', '/brain', '/connections', '/planner']
const cdp = await ctx.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150, // ms RTT — typical 4G
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
})
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

console.log('\n── THROTTLED (150ms RTT, 1.6Mbps down, 4x CPU slowdown) ──')
console.log('  route            first paint   networkidle')
for (const r of routes) {
  const t0 = Date.now()
  await page.goto(BASE + r, { waitUntil: 'commit', timeout: 120_000 })
  let fcp = null
  try {
    fcp = await page.evaluate(
      () =>
        new Promise((res) => {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries())
              if (e.name === 'first-contentful-paint') res(Math.round(e.startTime))
          }).observe({ type: 'paint', buffered: true })
          setTimeout(() => res(null), 30_000)
        }),
    )
  } catch {}
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {})
  console.log(
    `  ${r.padEnd(16)} ${String(fcp ?? '?').padStart(6)}ms   ${String(Date.now() - t0).padStart(6)}ms`,
  )
}

await browser.close()
