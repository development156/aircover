import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The inverse of vitest.config.ts: live tests only. These make REAL calls and
 * cost real money — they are never part of `turbo test`.
 *
 *   set -a; source .env; set +a
 *   npx vitest run --config vitest.live.config.ts src/lib/brand/url-door.live.test.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.live.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 300000,
  },
})
