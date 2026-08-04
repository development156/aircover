import { defineConfig } from 'vitest/config'

/**
 * Without this file vitest walks up to the REPO ROOT config, whose
 * `include: ['scripts/**\/*.test.mjs']` matches nothing inside a package — and
 * `--passWithNoTests` in the `test` script turns "found nothing" into exit 0.
 * The result was 7 test files here that `turbo run test` reported as a pass
 * without ever executing (the same shape as SL-051).
 */
export default defineConfig({
  test: {
    name: 'shared',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
