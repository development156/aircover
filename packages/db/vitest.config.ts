import { defineConfig } from 'vitest/config'

// Every suite here talks to the LIVE Supabase project over the network — there is no
// local Docker stack (packages/db/CLAUDE.md). Vitest runs test files in parallel, so
// five files of round-trips (plus the deliberately concurrent Promise.all races in
// bootstrap/brand_memory) routinely exceed the 5s default and fail as timeouts rather
// than as real defects. 30s is sized for that, not for a slow assertion.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
