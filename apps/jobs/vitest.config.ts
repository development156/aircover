import { defineConfig } from 'vitest/config'

// The reaper's integration suite talks to the LIVE Supabase project over the network and
// deliberately sleeps past a short HOLD TTL to reach the expired state. That pushes single
// tests well past the 5s default, where they would fail as timeouts rather than as real
// defects. Unit suites here are unaffected — they run in milliseconds.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
