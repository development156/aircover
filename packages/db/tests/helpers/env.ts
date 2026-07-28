import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

/**
 * Live suites here talk to the ONE Supabase project, which is also production (26 real
 * workspaces, 17 real users). They are OFF unless explicitly opted in.
 *
 * Opt-in is the only safe default, because an operator CANNOT turn these off from the shell.
 * Turborepo 2.x defaults to `envMode: "strict"` and the `test` task declared no `env` list, so
 * a blanked override never reached vitest — turbo stripped it, and the `loadEnv` below then
 * refilled the real credential from the repo-root .env. On 2026-07-27 that combination ran
 * `tests/ledger.test.ts` against production while the operator had explicitly blanked
 * SUPABASE_DB_URL. See docs/audit/2026-07-27/04-risks-and-unknowns.md R-01.
 *
 * The .env read itself is gated too: with the flag off the file is never opened, so no
 * credential enters the process for a stray client to pick up.
 *
 *   SAHODA_ALLOW_LIVE_TESTS=1 pnpm turbo run test --filter=@sahoda/db --force
 *
 * `turbo.json` declares SAHODA_ALLOW_LIVE_TESTS on the `test` task, which both lets it through
 * strict mode and puts it in the cache key — so a live-on run can never be replayed as a
 * live-off one.
 */
const LIVE = process.env.SAHODA_ALLOW_LIVE_TESTS === '1'

if (LIVE) {
  loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
}

export const ENV = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
}

/** Did the operator ask for live tests at all? Exported so the guard can test itself. */
export const liveTestsEnabled = LIVE

/** Ledger tests need a direct Postgres connection (the fn is not PostgREST-exposed). */
export const hasLedgerEnv = LIVE && ENV.dbUrl.length > 0

/** RLS tests need the anon + service keys and the JWT secret (to mint tenant tokens). */
export const hasRlsEnv =
  LIVE &&
  ENV.supabaseUrl.length > 0 &&
  ENV.anonKey.length > 0 &&
  ENV.serviceKey.length > 0 &&
  ENV.jwtSecret.length > 0
