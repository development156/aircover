import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

import { assertE2ETargetAllowed } from './src/lib/testing/e2e-target-report'

/**
 * Next loads `.env.local` and `.env` for the APP; the Playwright runner is a
 * separate process and gets nothing. Global setup needs the Clerk keys to fetch a
 * testing token, so load them here. Existing values always win, so CI secrets are
 * never shadowed by a developer's local file.
 *
 * BOTH files, in Next's own precedence (process.env > .env.local > .env), because
 * the destination guard below has to see exactly what the APP will see. Reading
 * only `.env.local` made the runner blind to a `.env` that named a different
 * project — the runner would report no target while the app happily wrote to one.
 */
function loadEnvFile(name: string): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), name)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return // absent is fine — CI supplies the environment directly
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    process.env[key] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
}

// `.env.local` FIRST: each loader lets an already-set value win, so loading the
// higher-precedence file first is what makes it higher precedence.
loadEnvFile('.env.local')
loadEnvFile('.env')

/**
 * WHICH DATABASE IS THIS RUN ABOUT TO WRITE TO?
 *
 * At module scope on purpose. Playwright evaluates this config before it starts
 * the web server and before `globalSetup`, so a refusal lands before the first
 * request instead of after a five-minute Turbopack compile.
 *
 * The banner prints on every run, refused or allowed. If you do not see it, this
 * line did not execute — which is the only way to tell a guard that passed from a
 * guard that was never wired in.
 */
assertE2ETargetAllowed()

/**
 * E2E harness.
 *
 * `@smoke` is the tag the repo's CLAUDE.md gates on: `--grep @smoke` must run
 * the golden path and nothing slow or paid. Anything that spends credits or
 * calls a real model provider is deliberately OUT of that tag — a gate that
 * costs money every time it runs is a gate people learn to skip.
 *
 * The dev server is started here rather than assumed. `reuseExistingServer`
 * keeps a local iteration loop fast but is off in CI, where a stale server
 * would silently test the wrong build.
 */
/**
 * ── E2E_PORT MUST BE DECLARED IN turbo.json OR IT DOES NOT EXIST HERE ────────
 * Turborepo 2.x defaults to `envMode: "strict"`, so a variable absent from the task's
 * `env` list is STRIPPED before the task runs. `E2E_PORT` was not on that list.
 *
 * MEASURED 2026-08-20: `E2E_PORT=3213 turbo run test:smoke` logged
 * `next dev --turbopack --port 3100`. After adding E2E_PORT to `test:smoke.env` the same
 * command logged `--port 3213`. The override had simply never arrived.
 *
 * Why that matters, given several worktrees share this machine: every one of them then
 * lands on 3100, and `reuseExistingServer: !process.env.CI` is true locally — so the
 * second suite to start ATTACHES to the first worktree's dev server and tests a different
 * codebase. Nothing in the output would say "wrong app"; the failures would read as
 * ordinary assertion failures.
 *
 * That collision is a hazard this config could not previously avoid, NOT something
 * observed here — the runs on 3100 each started their own server. Fixing the allowlist is
 * what makes `E2E_PORT` a usable defence against it.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  /**
   * ── `.spec.ts` ONLY, AND THIS IS NOT A NARROWING ────────────────────────────
   * Playwright's default `testMatch` is `**\/*.@(spec|test).?(c|m)[jt]s?(x)`, so
   * it collects `*.test.ts` as well. Every browser test in this repository is a
   * `.spec.ts` — 57 of them, and `e2e/helpers/accent.test.ts` is the ONLY
   * non-`.spec` test file in the tree, so the collected set is unchanged by this
   * line. MEASURED with `--list` after it: **236 tests in 57 files, 102 under
   * @smoke**. (The @smoke count is the number this repo's CLAUDE.md gates on and
   * it has not moved; the total has, because lanes merged since that file last
   * recorded 209.)
   *
   * What it stops is a VITEST file under `e2e/` being handed to the Playwright
   * runner. `e2e/helpers/accent.test.ts` calibrates the accent meter and belongs
   * to vitest (see `vitest.config.ts`, which includes `e2e/helpers/**`). Given
   * to Playwright it threw `Cannot read properties of undefined (reading
   * 'config')` at its `describe`, and — this is the part that matters — the
   * failure was not one test. `playwright test --list` reported **0 tests in 0
   * files**: a collection error takes the whole suite with it, so the gate's
   * smoke leg had nothing to run and said so only through a stack trace.
   */
  testMatch: '**/*.spec.ts',
  // Fixtures self-seed and clean up, but they still share one Clerk instance
  // and one database; running files in parallel makes a failure's blast radius
  // hard to read. Serial by default, revisit when the suite is slow enough to
  // care.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry LOCALLY too, now that `pnpm gate` runs this suite. The observed
  // flake is not ours: `fixtures/seeded-user.ts` redeems a Clerk sign-in ticket,
  // and Clerk's own FAPI intermittently fails that exchange
  // ("[Clerk Testing] FAPI request failed after 4 attempts"), leaving the page
  // parked on /sign-in until the 30s waitForURL gives up. Roughly one run in
  // three. A gate that is randomly red is a gate people learn to skip, which is
  // how this suite came to sit outside the gate for twenty runs in the first
  // place. Retries cover a third-party handshake, never an app assertion — every
  // failure in this file that was OURS was deterministic and was fixed, not
  // retried.
  retries: process.env.CI ? 2 : 1,
  // A first dev-server compile of a heavy route can genuinely take a while;
  // this is not a licence for a slow app, it is Turbopack cold start.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /**
     * Dev by default, but overridable — and the override is not a convenience.
     *
     * Turbopack compiles each route on first request, so a dev run's readiness
     * probe and its first few tests are paying for compilation. MEASURED with
     * four worktrees running dev servers on one machine: 92s to "Ready", then
     * `/sign-in` still compiling past a 300s webServer timeout, and single route
     * loads at ~50s. A production build has none of that, and it is also closer
     * to what a customer meets.
     *
     *   pnpm turbo build
     *   E2E_SERVER_CMD='pnpm --filter @sahoda/web start -p 3210' pnpm exec playwright test
     *
     * The build is not optional in that pair, and it is not optional a second
     * time either: a `next dev` run in the same directory rewrites `.next`, and a
     * later `next start` against it dies with
     * `TypeError: routesManifest.dataRoutes is not iterable` — which surfaces
     * through Playwright as "Process from config.webServer was not able to
     * start", a message that says nothing about the cause. Rebuild after any dev
     * run before using this.
     */
    command: process.env.E2E_SERVER_CMD ?? `pnpm dev --port ${PORT}`,
    // Readiness MUST probe a public route. Everything else is protected, and
    // Clerk answers a non-document request (which this probe is — no
    // `sec-fetch-dest: document`) with 404 rather than a redirect. Pointing this
    // at `/` makes the server look permanently unready and times out after three
    // minutes with no clue why.
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    /**
     * Five minutes, and the number is measured.
     *
     * The probe above is a route, so readiness is not "the process started" — it
     * is "Turbopack has compiled instrumentation, middleware and `/sign-in`".
     * MEASURED on 2026-08-19 with four worktrees running dev servers at once:
     * 32.9s for instrumentation, 12.5s for the edge build, 8.4s for middleware,
     * 92.1s to "Ready", and `/sign-in` still compiling when the old 180s ran out.
     * The whole suite then failed with `Timed out waiting from config.webServer`,
     * which reads as a broken app and is a cold cache.
     */
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
