#!/usr/bin/env node
/**
 * sandbox-probe — measure what THIS environment can actually do, and write the
 * answer down so no session has to guess again.
 *
 *   node scripts/sandbox-probe.mjs
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * A claude.ai/code sandbox and a laptop are not the same machine, and the
 * difference is narrow and non-obvious. MEASURED 2026-08-25 (REQUESTS §25):
 * Chromium there loads http://127.0.0.1 with 200 and http://example.com with
 * 200, but EVERY https:// URL fails with ERR_CONNECTION_RESET — while Node's
 * own fetch gets 200 for the same URL in the same process. Outbound 443 is
 * reset for the Chromium process specifically, before it reaches anything.
 *
 * That is not a certificate problem and --ignore-certificate-errors does not
 * fix it. A session that assumes otherwise burns an afternoon.
 *
 * This probe replaces the assumption with six measurements and a JSON file
 * (.sandbox-capabilities.json, gitignored) that /kickoff reads.
 *
 * It NEVER fails a session: every path exits 0.
 */
import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

const say = (m) => console.log(m)
const ok = (m) => console.log(`  yes  ${m}`)
const no = (m) => console.log(`  NO   ${m}`)
const dim = (m) => console.log(`       ${m}`)

const result = {
  measuredAt: new Date().toISOString(),
  node: { httpsFetch: null },
  chromium: {
    present: null,
    executablePath: null,
    foundBy: null,
    httpLoopback: null,
    httpOutbound: null,
    httpsOutbound: null,
  },
  verdict: null,
  notes: [],
}

// ── 1 · Node's own network ───────────────────────────────────────────────────
say('\n1 · Node')
try {
  const r = await fetch('https://example.com/', { signal: AbortSignal.timeout(15000) })
  result.node.httpsFetch = r.status
  ok(`https from Node — ${r.status}`)
} catch (e) {
  result.node.httpsFetch = false
  no(`https from Node — ${String(e.message).slice(0, 60)}`)
}

// ── 2 · Is there a browser at all? ───────────────────────────────────────────
say('\n2 · Chromium')
let chromium = null
try {
  // playwright is a dependency of @sahoda/web, NOT of the repo root. Importing
  // it by bare name from here reports NO_BROWSER on a machine that has one —
  // which this probe did to itself on the first run. Resolve from apps/web.
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { resolve } = await import('node:path')
  const req = createRequire(pathToFileURL(resolve(process.cwd(), 'apps/web/package.json')))
  let spec
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    try {
      spec = req.resolve(name)
      break
    } catch {}
  }
  if (!spec) throw new Error('playwright not resolvable from apps/web')
  const pw = await import(pathToFileURL(spec).href)
  // @playwright/test is CJS: the named export does not survive, and `chromium`
  // arrives only under `default`. Reading pw.chromium alone reported
  // "not importable" on a machine with a working browser.
  chromium = pw.chromium ?? pw.default?.chromium
  if (!chromium) throw new Error('module resolved but exports no chromium')

  /**
   * ── ASK THREE PLACES, NOT ONE ─────────────────────────────────────────────
   * `chromium.executablePath()` is where Playwright EXPECTS the binary, which
   * is not the same question as where one IS.
   *
   * MEASURED 2026-08-28 in this sandbox: it returns
   * `/opt/pw-browsers/chromium-1228/chrome-linux64/chrome`, and what exists is
   * `.../chromium-1228/chrome-linux/chrome` — same build, different directory
   * name between Playwright versions. Builds 1194 and 1228 were both installed
   * and 1194 drives the suite fine. This probe reported NO_BROWSER anyway,
   * skipped all three network probes (leaving them `null` rather than `false`,
   * which is the tell), and `browser-run.mjs` inherited that and told sessions
   * the suite could never run here. It ran, 3 of 3, in the same hour.
   *
   * Worse, the probe never read `PLAYWRIGHT_CHROMIUM_PATH` — the opt-in the
   * playwright config itself honours (`playwright.config.ts:168`) and the
   * variable that makes those passing runs work. The tool that answers "can
   * this box drive a browser" could not see the browser the repo had already
   * been told about.
   *
   * So: an explicit override wins, then Playwright's own guess, then a scan of
   * PLAYWRIGHT_BROWSERS_PATH for any chromium build with a real binary. The
   * path that won is recorded, because "which browser answered" is the first
   * thing the next session will want and it was never written down.
   */
  const candidates = []
  for (const env of ['PLAYWRIGHT_CHROMIUM_PATH', 'SAHODA_CHROMIUM_PATH']) {
    if (process.env[env]) candidates.push({ how: env, path: process.env[env] })
  }
  try {
    candidates.push({ how: 'playwright default', path: chromium.executablePath() })
  } catch {}
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (root && existsSync(root)) {
    const { readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    // Newest build first: a directory sorts numerically after its prefix.
    const builds = readdirSync(root)
      .filter((d) => d.startsWith('chromium-'))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))
    for (const b of builds) {
      for (const dir of ['chrome-linux', 'chrome-linux64']) {
        candidates.push({ how: `scan ${b}/${dir}`, path: join(root, b, dir, 'chrome') })
      }
    }
  }

  const found = candidates.find((c) => c.path && existsSync(c.path))
  result.chromium.present = Boolean(found)
  result.chromium.executablePath = found ? found.path : null
  result.chromium.foundBy = found ? found.how : null
  if (found) {
    ok(`browser binary present — ${found.how}`)
    dim(found.path)
  } else {
    no(`browser binary NOT installed`)
    dim(`looked in ${candidates.length} place(s); none existed`)
  }
} catch (e) {
  result.chromium.present = false
  no(`playwright not importable — ${String(e.message).slice(0, 50)}`)
}

// ── 3 · What can the browser actually reach? ─────────────────────────────────
// Three probes, deliberately: loopback, plain HTTP outbound, HTTPS outbound.
// The SHAPE of the answer is the diagnosis. All three failing is a missing
// browser or a dead sandbox; only the third failing is the known 443 reset.
if (result.chromium.present) {
  let browser
  try {
    browser = await chromium.launch({
      args: ['--no-sandbox'],
      // The binary discovery above is pointless if the launch still uses
      // Playwright's default guess.
      ...(result.chromium.executablePath ? { executablePath: result.chromium.executablePath } : {}),
    })
    const probe = async (url, label, key) => {
      const page = await browser.newPage()
      try {
        const r = await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' })
        result.chromium[key] = r ? r.status() : true
        ok(`${label} — ${r ? r.status() : 'loaded'}`)
      } catch (e) {
        const m = String(e.message).split('\n')[0].slice(0, 64)
        result.chromium[key] = false
        no(`${label} — ${m}`)
      } finally {
        await page.close().catch(() => {})
      }
    }
    // A local listener we control, so loopback is tested without depending on the app.
    const srv = (await import('node:http')).createServer((_q, s) => s.end('ok'))
    await new Promise((r) => srv.listen(0, '127.0.0.1', r))
    const port = srv.address().port
    await probe(`http://127.0.0.1:${port}/`, 'http loopback', 'httpLoopback')
    srv.close()
    await probe('http://example.com/', 'http outbound', 'httpOutbound')
    await probe('https://example.com/', 'https outbound', 'httpsOutbound')
  } catch (e) {
    no(`could not launch — ${String(e.message).slice(0, 60)}`)
  } finally {
    await browser?.close().catch(() => {})
  }
}

// ── 4 · The verdict, in one word a session can branch on ─────────────────────
const c = result.chromium
if (!c.present) {
  result.verdict = 'NO_BROWSER'
  result.notes.push('Playwright browsers are not installed. `npx playwright install chromium`.')
} else if (c.httpsOutbound) {
  result.verdict = 'FULL'
  result.notes.push('Chromium reaches HTTPS. The whole suite can run here.')
} else if (c.httpLoopback) {
  result.verdict = 'LOCAL_ONLY'
  result.notes.push(
    'Chromium reaches loopback but NOT https on its own socket. That USED to make ' +
      'the whole suite unrunnable here. It no longer does — see the Node transport ' +
      'below.',
  )
  result.notes.push(
    'This is NOT a certificate problem. --ignore-certificate-errors is the wrong ' +
      'remedy and is forbidden here: the connection is reset before any certificate ' +
      'is presented, and the proxy never logs the attempt (REQUESTS §25).',
  )
} else {
  result.verdict = 'NO_NETWORK'
  result.notes.push('Chromium cannot reach even loopback. Something is broken beyond egress.')
}

// ── 5 · When the browser cannot do https, route it through Node ─────────────
// This is the difference between "Playwright is UNRUN here" and a real run.
// apps/web/e2e/helpers/node-transport.ts intercepts every request and fetches
// it with Node instead, which the sandbox allows. Proven against a proxy that
// resets every CONNECT: clerk.com 200 over 62 requests, 0 failed.
if (result.verdict === 'LOCAL_ONLY') {
  result.browserViaNode = true
  for (const f of ['.env', 'apps/web/.env', 'apps/web/.env.local']) {
    try {
      if (!existsSync(f)) continue
      const cur = readFileSync(f, 'utf8')
      if (!/^SAHODA_BROWSER_VIA_NODE=/m.test(cur)) {
        writeFileSync(f, cur.replace(/\n?$/, '\n') + 'SAHODA_BROWSER_VIA_NODE=1\n')
      }
    } catch {}
  }
  result.notes.push(
    'SAHODA_BROWSER_VIA_NODE=1 written to the .env files: every browser request ' +
      "now travels over Node instead of Chromium's socket, so the suite CAN run " +
      'here. WebSockets are the exception — context.route cannot intercept them.',
  )
} else {
  result.browserViaNode = false
}

say(`\n3 · Verdict: ${result.verdict}`)
for (const n of result.notes) dim(n)

if (result.verdict === 'LOCAL_ONLY' || result.verdict === 'NO_BROWSER') {
  dim('')
  dim('For anything this environment cannot drive, run it where a browser has')
  dim('ordinary network:  node scripts/browser-run.mjs --remote')
}

try {
  writeFileSync('.sandbox-capabilities.json', JSON.stringify(result, null, 2) + '\n')
  say('\n  wrote .sandbox-capabilities.json')
} catch {}

process.exit(0)
