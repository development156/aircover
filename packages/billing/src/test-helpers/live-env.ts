import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

/**
 * Shared opt-in gate for this package's live-database integration suites.
 *
 * Four suites here (withCredits, entitlements, applyPlanGrant, webhooks) each used to call
 * `loadEnv` themselves and gate on `!DB_URL` alone. That is not a gate: the ONE Supabase
 * project is production, turbo strips a blanked override before vitest sees it, and the .env
 * read puts the real credential straight back — which is how these suites executed against
 * production on 2026-07-27. See docs/audit/2026-07-27/04-risks-and-unknowns.md R-01.
 *
 * Import LIVE_DB_URL and gate with `describe.skipIf(!LIVE_DB_URL)`. It is the empty string
 * unless the operator asked for live tests AND a connection string is present, so the default
 * for every developer, every CI job and every agent is: these do not run.
 *
 *   SAHODA_ALLOW_LIVE_TESTS=1 pnpm turbo run test --filter=@sahoda/billing --force
 */
const LIVE = process.env.SAHODA_ALLOW_LIVE_TESTS === '1'

if (LIVE) {
  loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
}

/** Did the operator ask for live tests at all? */
export const liveTestsEnabled = LIVE

/** Connection string for the live ledger, or '' when live tests are not opted into. */
export const LIVE_DB_URL = LIVE
  ? (process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '')
  : ''
