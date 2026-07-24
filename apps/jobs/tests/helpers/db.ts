import { Pool, type PoolConfig } from 'pg'
import { readFileSync } from 'node:fs'
import { ENV } from './env'

// Anchored to a full hostname label so a look-alike (evil-supabase.com) or a substring
// sitting in the DSN's user/password can never trigger the relaxed-verification path.
// (packages/billing/src/ledger/pg.ts uses this same anchored form; the older substring
// test in packages/db/tests matches the whole DSN and is weaker.)
const SUPABASE_HOST = /(^|\.)supabase\.(co|com|in|net)$/

function pgHostname(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * TLS for the direct Postgres connection. Supabase's direct endpoint presents a private
 * CA chain, so full verification requires that CA: set SUPABASE_DB_CA_CERT to its path
 * to enforce it (preferred). Absent a CA the connection stays TLS-encrypted but skips
 * chain verification for a genuine Supabase host ONLY — this is test-harness code
 * against the developer's own project and never runs in production.
 */
function pgSsl(): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  const host = pgHostname(ENV.dbUrl)
  if (host && SUPABASE_HOST.test(host)) return { rejectUnauthorized: false }
  return undefined
}

/** Direct Postgres pool — the ledger fn lives in the non-PostgREST `app` schema. */
export function pgPool(): Pool {
  return new Pool({ connectionString: ENV.dbUrl, max: 20, ssl: pgSsl() })
}
