#!/usr/bin/env node
/**
 * browser-run — get a REAL browser result, from wherever one is available.
 *
 *   node scripts/browser-run.mjs                 run here if this box can
 *   node scripts/browser-run.mjs --remote        run on a GitHub runner and wait
 *   node scripts/browser-run.mjs --grep <tag>    narrow the selection
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 * A claude.ai/code sandbox cannot drive Chromium to any https host. MEASURED,
 * six ways, in REQUESTS §25: loopback 200, plain http 200, every https RESET,
 * while Node fetch gets 200 for the same URL in the same process. Sessions have
 * been reporting "Playwright is UNRUN" for days and they were right to.
 *
 * A hosted runner has ordinary network. The suite already has a job there. This
 * connects the two so a session can get a real answer instead of a caveat.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * It does not weaken the ack. The smoke suite WRITES TO THE PRODUCTION DATABASE
 * and once minted 12,196 Clerk users because nothing stopped it. --remote is a
 * deliberate act, typed by a person or by a session that has been asked for it.
 * It is never wired into /go, a hook, or a gate.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const REMOTE = args.includes('--remote')
const GREP = (() => {
  const i = args.indexOf('--grep')
  return i >= 0 ? args[i + 1] : '@smoke'
})()

const say = (m) => console.log(m)
const die = (m) => {
  console.error(`\n${m}`)
  process.exit(2)
}
const sh = (cmd, a, opts = {}) => {
  try {
    return execFileSync(cmd, a, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim()
  } catch (e) {
    if (opts.tolerant) return ''
    throw e
  }
}

// ── What can this box do? Probe rather than assume. ─────────────────────────
let cap = null
if (existsSync('.sandbox-capabilities.json')) {
  try {
    cap = JSON.parse(readFileSync('.sandbox-capabilities.json', 'utf8'))
  } catch {}
}
if (!cap) {
  say('  no capability file — probing first')
  try {
    execFileSync('node', ['scripts/sandbox-probe.mjs'], { stdio: 'inherit' })
    cap = JSON.parse(readFileSync('.sandbox-capabilities.json', 'utf8'))
  } catch {
    die('  probe failed. Run: node scripts/sandbox-probe.mjs')
  }
}

say(`\n  environment: ${cap.verdict}   (measured ${cap.measuredAt.slice(0, 16)})`)

// ── LOCAL ───────────────────────────────────────────────────────────────────
if (!REMOTE) {
  /**
   * ── TWO WAYS TO RUN HERE, NOT ONE ─────────────────────────────────────────
   * This used to demand `FULL` and refuse everything else with a confident
   * paragraph: "this environment cannot run the full suite, and that is
   * measured, not assumed."
   *
   * It was neither measured nor true. MEASURED 2026-08-28, minutes after that
   * paragraph printed: `connections-honesty.spec.ts --grep @smoke` passed 3 of
   * 3 on this box, Clerk sign-in included. Two separate faults stacked up —
   * the probe could not find an installed browser (fixed in
   * `sandbox-probe.mjs`), and this file ignored `browserViaNode`, which the
   * probe has been setting all along.
   *
   * `LOCAL_ONLY` + the Node transport is a REAL run: every browser request
   * travels over Node's socket, which this sandbox permits. It is not as good
   * as `FULL` and the difference is named below rather than hidden.
   */
  const viaNode = cap.verdict === 'LOCAL_ONLY' && cap.browserViaNode === true
  if (cap.verdict === 'FULL' || viaNode) {
    say(
      viaNode
        ? "  Chromium cannot do https here, so every request goes over Node's socket\n" +
            '  instead (SAHODA_BROWSER_VIA_NODE=1). Running the suite locally.\n'
        : '  Chromium reaches https here. Running the suite locally.\n',
    )
    const env = { ...process.env }
    if (viaNode) env.SAHODA_BROWSER_VIA_NODE = '1'
    // Discovery is worthless if the run still uses Playwright's default guess.
    if (cap.chromium?.executablePath && !env.PLAYWRIGHT_CHROMIUM_PATH) {
      env.PLAYWRIGHT_CHROMIUM_PATH = cap.chromium.executablePath
      say(`  browser: ${cap.chromium.executablePath}\n`)
    }
    try {
      execFileSync(
        'pnpm',
        ['--filter', '@sahoda/web', 'exec', 'playwright', 'test', '--grep', GREP],
        { stdio: 'inherit', env },
      )
      say('\n  PASSED locally.')
      if (viaNode) {
        say('  Over the Node transport. WebSockets are NOT covered by it, so a spec')
        say('  that needs a live socket is still UNRUN — say so rather than passed.')
      }
    } catch {
      die('  FAILED locally. Group the failures by error message before reading them as defects.')
    }
    process.exit(0)
  }

  say(`
  This environment cannot run the full suite, and that is measured, not assumed:

    chromium http loopback : ${cap.chromium.httpLoopback}
    chromium http outbound : ${cap.chromium.httpOutbound}
    chromium https outbound: ${cap.chromium.httpsOutbound}
    node https fetch       : ${cap.node.httpsFetch}

  Every @smoke spec signs in through Clerk, which is an https host, so the
  browser cannot complete sign-in here. The result is UNRUN — never report it
  as passed.

  Two honest options:

    1. Run it where a browser has ordinary network:
         node scripts/browser-run.mjs --remote
       This dispatches the smoke job on a GitHub runner, waits, and prints the
       real result. It WRITES TO THE PRODUCTION DATABASE, which is why it is a
       separate deliberate command.

    2. Drive the local app over http and skip sign-in entirely, for anything
       that does not need an account:
         pnpm --filter @sahoda/web exec playwright test --grep <your-tag>
       Chromium reaches http://127.0.0.1 here with 200. A spec whose PAGE loads
       a third-party https asset will still reset — that failure is the
       environment, not your selector.

  Do NOT reach for --ignore-certificate-errors. The connection is reset before
  any certificate exists, the proxy never logs the attempt, and the flag is
  forbidden here.
`)
  process.exit(1)
}

// ── REMOTE ──────────────────────────────────────────────────────────────────
say('\n  --remote: dispatching the smoke job on a GitHub runner.')

if (!sh('bash', ['-lc', 'command -v gh || true'], { tolerant: true })) {
  die(
    '  `gh` is not installed here. Install it, or dispatch the job from the Actions tab:\n' +
      '    .github/workflows/gate.yml -> Run workflow -> smoke',
  )
}

const ack =
  process.env.SAHODA_E2E_ACK_TARGET ||
  sh(
    'bash',
    [
      '-lc',
      "grep -h '^SAHODA_E2E_ACK_TARGET=' .env apps/web/.env 2>/dev/null | head -1 | cut -d= -f2",
    ],
    { tolerant: true },
  )

if (!ack) {
  die(`  No SAHODA_E2E_ACK_TARGET found.

  That value names the database this suite will WRITE TO. The job refuses
  without it, deliberately: this suite once minted 12,196 Clerk users in
  production because nothing stopped it.

  Set it in the environment, or dispatch by hand and type the ref.`)
}

const branch = sh('git', ['branch', '--show-current'], { tolerant: true }) || 'HEAD'

say(`
  branch : ${branch}
  target : ${ack}

  THIS WRITES TO THAT DATABASE. Rows created by the run are cleaned up by the
  suite's own afterAll, and you should count rows afterwards rather than trust
  that.
`)

try {
  sh('gh', ['workflow', 'run', 'gate.yml', '--ref', branch, '-f', `ack_target=${ack}`])
  say('  dispatched.')
} catch (e) {
  die(`  dispatch failed: ${String(e.message).slice(0, 200)}`)
}

say('  waiting for the run to appear…')
let runId = ''
for (let i = 0; i < 20 && !runId; i++) {
  execFileSync('sleep', ['6'])
  runId = sh(
    'bash',
    [
      '-lc',
      `gh run list --workflow=gate.yml --branch=${branch} --limit 1 --json databaseId -q '.[0].databaseId'`,
    ],
    { tolerant: true },
  )
}
if (!runId) die('  the run never appeared. Check the Actions tab.')

say(`  run ${runId} — watching. A real browser leg takes ~15 minutes.\n`)
try {
  execFileSync('gh', ['run', 'watch', runId, '--exit-status'], { stdio: 'inherit' })
  say('\n  PASSED on the runner. That is a real browser on a real network.')
  process.exit(0)
} catch {
  say('\n  FAILED on the runner. Read the log before calling it a defect:')
  say(`    gh run view ${runId} --log-failed`)
  say('  Group the failures by error message. Six unrelated specs red at once is')
  say('  an environment; one is a diff.')
  process.exit(1)
}
