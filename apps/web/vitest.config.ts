import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Two projects, because the two kinds of test here have genuinely different
 * needs and the pure ones should not pay for a DOM they never touch:
 *
 *  - `lib`  — pure modules under src/lib. Node environment, no React.
 *  - `ui`   — component tests (*.test.tsx). jsdom + the React plugin.
 *
 * The `ui` project exists because every interactive surface in the editor was
 * previously untestable: an adversarial review found a rewrite toolbar that no
 * input method could click and arrow keys that moved selection without focus,
 * and BOTH passed typecheck, 461 unit tests and a production build. Behaviour
 * that only exists in the browser needs a test that runs in one.
 */
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // `server-only` throws outside a React Server context. Tests import server
  // modules (env.ts) in plain node, so point the poison-pill at an inert stub.
  'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
}

export default defineConfig({
  test: {
    /**
     * CAP THE WORKERS ON A DEVELOPER MACHINE.
     *
     * Vitest defaults to one worker per core. On a laptop that is already
     * running a browser and an editor, twelve workers put the box past its
     * capacity and tests start losing races they would otherwise win.
     *
     * MEASURED 2026-08-27, one full run after another on the SAME commit, with
     * load average sitting at 1.5x per core (top consumers: brave,
     * claude-desktop — not the suite):
     *
     *   run 1   store.pglite            Hook timed out in 10000ms
     *   run 2   workspace-timezone      Hook timed out in 10000ms
     *   run 3   crop-geometry           Test timed out in 5000ms (took 5224ms)
     *   run 4   radar/store + assets    Test timed out in 5000ms  x2
     *
     * A DIFFERENT file each time, every one green in isolation. That is not
     * four flaky tests, it is one starved machine — and patching the timeout of
     * whichever file lost the race that run is fitting the code to a broken
     * environment. The generous per-hook budgets those suites now carry are
     * still right (booting a Postgres is genuinely slow); this is the fix for
     * the cause rather than the symptom.
     *
     * CI gets the full machine: a hosted runner is dedicated, and halving its
     * workers would just make the gate slower for no gain.
     */
    maxWorkers: process.env.CI ? undefined : 4,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'lib',
          environment: 'node',
          // `e2e/helpers/**` is here so a MEASURING INSTRUMENT used by the
          // browser suite is calibrated by the ordinary gate rather than by
          // whoever remembers to run it. `accent.ts` returns the number a lane
          // quotes as its before-and-after, and 0.000% is exactly what a
          // successful fix looks like — so a meter that silently reads zero
          // would certify every screen it could not decode. Playwright's own
          // files are `*.spec.ts` and are not matched by this glob.
          include: ['src/**/*.test.ts', 'e2e/helpers/**/*.test.ts'],
          // `*.live.test.ts` spends real money (Firecrawl credits, provider
          // tokens) and needs keys CI does not have. Without this exclusion the
          // glob above would sweep them into `turbo test`. Run them with
          // vitest.live.config.ts — never here.
          exclude: ['**/node_modules/**', '**/*.live.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
