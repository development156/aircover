import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * Next loads `.env.local` for the APP; the Playwright runner is a separate
 * process and gets nothing. Global setup needs the Clerk keys to fetch a testing
 * token, so load them here. Existing values always win, so CI secrets are never
 * shadowed by a developer's local file.
 */
function loadEnvLocal(): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), '.env.local')
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

loadEnvLocal()

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
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
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
    command: `pnpm dev --port ${PORT}`,
    // Readiness MUST probe a public route. Everything else is protected, and
    // Clerk answers a non-document request (which this probe is — no
    // `sec-fetch-dest: document`) with 404 rather than a redirect. Pointing this
    // at `/` makes the server look permanently unready and times out after three
    // minutes with no clue why.
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
