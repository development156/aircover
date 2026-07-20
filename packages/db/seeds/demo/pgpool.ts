import { readFileSync } from 'node:fs'
import { Pool, type PoolConfig } from 'pg'

/**
 * The direct Postgres connection both seed CLIs open.
 *
 * A deliberate leaf: this file imports `node:fs` and `pg` and nothing else. destroy.ts can
 * therefore share it without weakening its "nothing I import can be broken by the thing
 * that sent you here" guarantee — see the header of destroy.ts. Previously both entry
 * points carried byte-identical copies of the two functions below, which meant a TLS fix
 * had to be made twice or the teardown quietly kept connecting the old way.
 */

/**
 * TLS for the direct Postgres connection. The reasoning is lifted verbatim from
 * tests/helpers/db.ts: Supabase's direct endpoint presents a private CA chain, so full
 * chain verification requires that CA. Set SUPABASE_DB_CA_CERT to its path to enforce
 * verification (recommended). Without it the connection is still TLS-encrypted but skips
 * chain verification, and only for a known Supabase host — this is a developer seeding
 * their own project, never production.
 *
 * Not imported from tests/helpers/db.ts because that module builds supabase-js clients
 * from a test-only ENV object at import time; pulling the test harness in would make
 * `pnpm seed:demo` fail for reasons that have nothing to do with seeding. The url is an
 * argument rather than module state so callers stay in charge of which database this is.
 */
export function pgSsl(url: string): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  if (/supabase\.(co|com|in|net)/.test(url)) return { rejectUnauthorized: false }
  return undefined
}

/**
 * max: 1 — both commands run as ONE transaction on ONE checked-out client. A wider pool
 * would only hand out connections that cannot see the uncommitted rows.
 */
export function openPool(url: string): Pool {
  return new Pool({ connectionString: url, max: 1, ssl: pgSsl(url) })
}
