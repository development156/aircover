import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

// Secrets live in the repo-root .env; the test process reads it at runtime.
// Never commit real values.
loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })

export const ENV = {
  dbUrl: process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '',
}

/** Ledger-backed tests need a direct Postgres connection (the fn is not PostgREST-exposed). */
export const hasLedgerEnv = ENV.dbUrl.length > 0
