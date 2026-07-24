import { Pool, type PoolConfig } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ENV } from './env'

/** supabase-js needs the bare project origin — strip any path/trailing slash a pasted URL may carry. */
const BASE_URL = (() => {
  try {
    return new URL(ENV.supabaseUrl).origin
  } catch {
    return ENV.supabaseUrl
  }
})()

/**
 * TLS for the direct Postgres connection. Supabase's direct endpoint presents a
 * private CA chain, so full chain verification requires that CA: set
 * SUPABASE_DB_CA_CERT to its path to enforce verification (recommended). Absent a
 * CA, the connection stays TLS-encrypted but skips chain verification for the known
 * Supabase host only — this is test-harness code connecting to the developer's own
 * project, never production.
 */
function pgSsl(): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  if (/supabase\.(co|com|in|net)/.test(ENV.dbUrl)) return { rejectUnauthorized: false }
  return undefined
}

/** Direct Postgres pool — used to call the service-only ledger function. */
export function pgPool(): Pool {
  return new Pool({ connectionString: ENV.dbUrl, max: 20, ssl: pgSsl() })
}

/** Service-role client (bypasses RLS) — used only to set up test fixtures. */
export function serviceClient(): SupabaseClient {
  return createClient(BASE_URL, ENV.serviceKey, { auth: { persistSession: false } })
}

/** Signed-out anon client. */
export function anonClient(): SupabaseClient {
  return createClient(BASE_URL, ENV.anonKey, { auth: { persistSession: false } })
}

const b64url = (s: string): string => Buffer.from(s).toString('base64url')

/**
 * How far back to date `iat`. PostgREST allows a FIXED 30s of clock skew and answers
 * PGRST303 "JWT issued at future" past it (measured against this project: iat = now+30s
 * passes, now+31s fails). Minting at exactly `now` therefore spends the entire allowance
 * on whatever skew exists between this machine and the edge at that instant — which is
 * how a single bootstrap test failed while the rest of the same run passed.
 *
 * 300s is chosen to clear that 30s window by a wide margin, not to shave it. It is also
 * the more production-faithful shape: a real Clerk token is routinely minutes old by the
 * time it is presented, so a freshly-minted `iat` is the unrealistic case, not this one.
 * Do NOT "simplify" this toward the 30s boundary — anything inside it re-opens the flake.
 */
const IAT_BACKDATE_SEC = 300

/**
 * Mint an HS256 token with a chosen Clerk-style subject, signed with the project
 * JWT secret. RLS policies read auth.jwt()->>'sub' from it. This is how we test
 * tenant isolation from an anon-key client authenticated "as" a member.
 */
export function mintJwt(sub: string, ttlSec = 3600): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now - IAT_BACKDATE_SEC,
      // exp stays anchored to now: the token still lives ttlSec from mint time.
      exp: now + ttlSec,
    }),
  )
  const sig = createHmac('sha256', ENV.jwtSecret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

/** Anon-key client carrying a minted member token (the RLS test subject). */
export function userClient(sub: string): SupabaseClient {
  return createClient(BASE_URL, ENV.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${mintJwt(sub)}` } },
  })
}
