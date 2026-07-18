import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

// Secrets live in the repo-root .env; the test process reads it at runtime
// (dotenv is fs, not the Read tool). Never commit real values.
loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })

export const ENV = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
}

/** Ledger tests need a direct Postgres connection (the fn is not PostgREST-exposed). */
export const hasLedgerEnv = ENV.dbUrl.length > 0

/** RLS tests need the anon + service keys and the JWT secret (to mint tenant tokens). */
export const hasRlsEnv =
  ENV.supabaseUrl.length > 0 &&
  ENV.anonKey.length > 0 &&
  ENV.serviceKey.length > 0 &&
  ENV.jwtSecret.length > 0
