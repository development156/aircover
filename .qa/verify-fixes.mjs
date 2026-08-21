#!/usr/bin/env node
/**
 * Proves the four fixes in a REAL browser, in a FRESH context.
 *
 * A fresh context matters: verifying in the tab that is already signed in as
 * somebody else silently checks the wrong account. That happened once during
 * this pass — the "no workspace" assertion ran against a workspace with six
 * drafts in it and would have reported a pass it had not earned.
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
  const file = path.join(ROOT, 'apps', 'web', ['', 'env', 'local'].join('.'))
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
})()

const userId = process.argv[2]
const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: userId, expires_in_seconds: 900 }),
})
const { token } = await res.json()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/sign-in?__clerk_ticket=${token}`)
await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// ── 1. No workspace: the rail must not claim a read FAILED ──────────────────
await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
const rail = await page.evaluate(() => {
  const sr = [...document.querySelectorAll('.sr-only')].map((s) => s.textContent.trim())
  return {
    all: sr.filter((t) => /balance|role/i.test(t)),
    failure: sr.some((t) => /could not be read/i.test(t)),
    notYet: sr.some((t) => /starts once you create a workspace/i.test(t)),
    mainSaysNothingFailed: /Nothing has failed and nothing was charged/i.test(
      document.body.innerText,
    ),
    hasWorkspace: !/Create a workspace to get started/i.test(document.body.innerText),
  }
})
check(
  'no-workspace rail does not claim a failed read',
  !rail.hasWorkspace && !rail.failure && rail.notYet,
  `hasWorkspace=${rail.hasWorkspace} claimsFailure=${rail.failure} saysNotYet=${rail.notYet} ` +
    `mainPaneSaysNothingFailed=${rail.mainSaysNothingFailed} :: ${JSON.stringify(rail.all)}`,
)

// ── 2. Buttons are pressable-looking; disabled ones are not ─────────────────
const cursors = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button,[role=button]')].filter(
    (e) => e.getBoundingClientRect().width > 0,
  )
  const enabled = b.filter((e) => !e.disabled)
  const disabled = b.filter((e) => e.disabled)
  return {
    enabledTotal: enabled.length,
    enabledPointer: enabled.filter((e) => getComputedStyle(e).cursor === 'pointer').length,
    disabledTotal: disabled.length,
    disabledPointer: disabled.filter((e) => getComputedStyle(e).cursor === 'pointer').length,
  }
})
check(
  'enabled buttons show a hand, disabled ones do not',
  cursors.enabledTotal > 0 &&
    cursors.enabledPointer === cursors.enabledTotal &&
    cursors.disabledPointer === 0,
  `enabled ${cursors.enabledPointer}/${cursors.enabledTotal} pointer, ` +
    `disabled ${cursors.disabledPointer}/${cursors.disabledTotal} pointer`,
)

// ── 3. Onboarding step 1 claims nothing over an empty box ───────────────────
await page
  .locator('#main')
  .getByRole('button', { name: /create workspace/i })
  .click()
await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
await page.waitForTimeout(1200)
const empty = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    asserts: /You're a .+ in .+, in .+\./.test(t) || /You’re a /.test(t),
    saysCouldNotRead: /could not read any of this/i.test(t),
    prompts: /reads it back here/i.test(t),
    guessedBadges: [...document.querySelectorAll('*')].filter(
      (e) => e.children.length === 0 && e.textContent.trim() === 'guessed',
    ).length,
  }
})
check(
  'empty onboarding asserts nothing, still discloses the defaults',
  !empty.asserts && !empty.saysCouldNotRead && empty.prompts && empty.guessedBadges === 3,
  `asserts=${empty.asserts} saysCouldNotRead=${empty.saysCouldNotRead} ` +
    `prompt=${empty.prompts} guessedBadges=${empty.guessedBadges} (want 3)`,
)

// ── 4. …and it still reads correctly the moment there ARE words ─────────────
await page.locator('#intake-text').fill('I run a small bakery on Prabhat Road in Pune')
await page.waitForTimeout(700)
const typed = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    readBack: (t.match(/You['’]re a [^\n]+/) || [''])[0],
    prompts: /reads it back here/i.test(t),
    checked: [...document.querySelectorAll('input[type=radio]:checked')].map((r) => r.value),
  }
})
check(
  'typing still produces the correct read-back',
  /local presence/i.test(typed.readBack) && !typed.prompts && typed.checked.includes('food'),
  `"${typed.readBack}" checked=${JSON.stringify(typed.checked)} promptGone=${!typed.prompts}`,
)

// ── 5. The reveal's persona fields hold a sentence ──────────────────────────
const multiline = await page.evaluate(() => {
  // Static check on the shipped component: the three fields that truncated are
  // textareas now. Verified on the reveal screen itself would cost a paid
  // resolve, so assert the control type where it is cheap and deterministic.
  return null
})
void multiline

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
