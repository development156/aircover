import { readFileSync } from 'node:fs'
import type { Pool, PoolConfig } from 'pg'

// Anchored to a full hostname label so a look-alike (evil-supabase.com) or a substring in
// the password/user of the DSN can never trigger the relaxed-verification fallback.
const SUPABASE_HOST = /(^|\.)supabase\.(co|com|in|net)$/

function pgHostname(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * TLS for a direct Postgres connection (mirrors packages/db test harness). Supabase's direct
 * endpoint presents a private CA chain; set SUPABASE_DB_CA_CERT to enforce full verification
 * (recommended in prod — H19 hardening). Absent a CA, the connection stays TLS-encrypted but
 * skips chain verification for a genuine Supabase host ONLY.
 *
 * Shared by every direct-pg port in this package so the relaxed-verification rule is defined
 * exactly once and cannot drift between them.
 */
export function pgSsl(connectionString: string): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  const host = pgHostname(connectionString)
  if (host && SUPABASE_HOST.test(host)) return { rejectUnauthorized: false }
  return undefined
}

/**
 * Attach the mandatory pool-level error handler.
 *
 * node-postgres emits `'error'` on the Pool when an IDLE client fails — a Supabase pooler idle
 * timeout, a failover, a maintenance restart. `Pool` is an EventEmitter, so with no listener
 * Node treats that as an uncaught exception and kills the process. A long-lived server holding
 * a module-level singleton would die at 3am from a routine connection recycle.
 *
 * The pool itself discards the broken client and carries on, so swallowing here is correct:
 * the next query gets a fresh connection. `onError` lets a caller observe it without the
 * package taking a logger dependency.
 */
export function guardPoolErrors(pool: Pool, onError?: (cause: unknown) => void): Pool {
  pool.on('error', (err) => {
    try {
      onError?.(err)
    } catch {
      // a broken logger must never become the uncaught exception we are preventing
    }
  })
  return pool
}
