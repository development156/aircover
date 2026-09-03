import { describe, it, expect } from 'vitest'
import { ENV, hasLedgerEnv, hasRlsEnv, liveTestsEnabled } from './helpers/env'

/**
 * The guard's own test — R-01's step 5.
 *
 * Every other suite in this package is `describe.skipIf(...)`, and a skipped suite reports
 * exactly the same green as a suite that was never dangerous. So the property that actually
 * protects production — "live suites cannot run unless SAHODA_ALLOW_LIVE_TESTS=1" — needs an
 * assertion of its own that RUNS on every ordinary test invocation.
 *
 * This is deliberately the inverse shape of the suites it guards: it runs when they are
 * skipped. If someone deletes the flag check from helpers/env.ts to "fix" a red CI run, this
 * goes red instead of quietly re-arming the path that wrote to production on 2026-07-27.
 */
describe('live-test guard', () => {
  it('reports the flag exactly as the environment set it', () => {
    expect(liveTestsEnabled).toBe(process.env.SAHODA_ALLOW_LIVE_TESTS === '1')
  })

  it.skipIf(liveTestsEnabled)('keeps every live gate closed when the flag is absent', () => {
    // No credential check here on purpose: the point is that the flag alone closes the gate,
    // whether or not a .env full of production secrets is sitting next to the test run.
    expect(hasLedgerEnv).toBe(false)
    expect(hasRlsEnv).toBe(false)
  })

  it.skipIf(liveTestsEnabled)('does not read the repo-root .env while the flag is absent', () => {
    // The gate is upstream of the credential: with the flag off, loadEnv never runs, so the
    // helper sees nothing even though .env exists on this machine.
    //
    // Asserted as a BOOLEAN on purpose. `expect(ENV.dbUrl).toBe('')` printed the whole
    // connection string, password included, in its diff whenever the invoking shell exported
    // SUPABASE_DB_URL (a direct vitest run; turbo strips it) and that red output was pasted into
    // a handoff on 2026-08-28. A red run here now says only true or false.
    expect(ENV.dbUrl === '', 'SUPABASE_DB_URL or DATABASE_URL reached the test process').toBe(true)
    expect(ENV.serviceKey === '', 'SUPABASE_SERVICE_ROLE_KEY reached the test process').toBe(true)
  })

  it.skipIf(!liveTestsEnabled)('opens the gate only when the flag is set AND creds exist', () => {
    // The flag alone must not be enough — a missing connection string still means no live run.
    expect(hasLedgerEnv).toBe(ENV.dbUrl.length > 0)
  })
})
