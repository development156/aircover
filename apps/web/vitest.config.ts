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
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'lib',
          environment: 'node',
          include: ['src/**/*.test.ts'],
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
