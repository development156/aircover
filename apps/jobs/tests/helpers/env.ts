import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

import { assertTargetIsNotProduction } from './forbidden-target'

/**
 * Live suites here talk to the ONE Supabase project, which is also production. OFF unless
 * explicitly opted in — same contract as packages/db/tests/helpers/env.ts, and for the same
 * reason: turbo strips a blanked override before vitest sees it, and the .env read below puts
 * the real credential straight back. See docs/audit/2026-07-27/04-risks-and-unknowns.md R-01.
 *
 *   SAHODA_ALLOW_LIVE_TESTS=1 pnpm turbo run test --filter=@sahoda/jobs --force
 */
const LIVE = process.env.SAHODA_ALLOW_LIVE_TESTS === '1'

if (LIVE) {
  loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
  assertTargetIsNotProduction()
}

export const ENV = {
  dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
}

/** Did the operator ask for live tests at all? */
export const liveTestsEnabled = LIVE

/** Ledger-backed tests need a direct Postgres connection (the fn is not PostgREST-exposed). */
export const hasLedgerEnv = LIVE && ENV.dbUrl.length > 0
