import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * The performance harness, deliberately OUTSIDE `e2e/`.
 *
 * `playwright.config.ts` points `testDir` at `./e2e`, and the gate's smoke leg
 * greps `@smoke` inside it. A measurement run is neither: it is slow, it
 * navigates forty routes twice under throttling, and it must never become
 * something the gate waits for. Keeping it in its own directory with its own
 * config means no tag discipline is load-bearing — the gate cannot reach these
 * files at all.
 *
 * It reuses `e2e/fixtures/seeded-user.ts` on purpose. A second sign-in
 * implementation would be a second thing to keep true about Clerk.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '../..')

/** Same reader as playwright.config.ts: the runner is a separate process from Next. */
function loadEnvLocal(): void {
  let raw: string
  try {
    raw = readFileSync(join(WEB, '.env.local'), 'utf8')
  } catch {
    return
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

const PORT = Number(process.env.PERF_PORT ?? 3252)

export default defineConfig({
  testDir: HERE,
  testMatch: /.*\.perf\.ts/,
  fullyParallel: false,
  workers: 1,
  // A throttled load of the slowest route is minutes, not seconds, and a timeout
  // here would be recorded as a measurement rather than as the harness giving up.
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  globalSetup: resolve(WEB, 'e2e/global-setup.ts'),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // NO webServer. The server must be started by hand with the outbound-call
  // counter preloaded, and against a PRODUCTION build — a dev server compiles on
  // first request, so its first number for every route is compilation, not the app.
})
