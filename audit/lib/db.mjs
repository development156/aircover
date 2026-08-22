import { createRequire } from 'node:module'
import path from 'node:path'

import { env, need, WT } from './env.mjs'

// `pg` is a devDependency of packages/db, not of the repo root, so resolve it
// from there rather than adding a dependency this audit does not own.
const require = createRequire(path.join(WT, 'packages', 'db', 'package.json'))
const pg = require('pg')

// Read-only connection used for catalog inspection ONLY.
// RLS is NEVER bypassed for the isolation proofs — those go through
// PostgREST with the anon key and minted member JWTs.
export async function withClient(fn, { readOnly = true } = {}) {
  const client = new pg.Client({
    connectionString: need('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  })
  await client.connect()
  try {
    if (readOnly) {
      // NEVER `set default_transaction_read_only` — the pooler hands that
      // session state to the NEXT client. Use a read-only transaction.
      await client.query('begin read only')
      try {
        return await fn(client)
      } finally {
        await client.query('rollback').catch(() => {})
      }
    }
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function q(sql, params = []) {
  return withClient(async (c) => (await c.query(sql, params)).rows)
}

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
export const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * The row count AFTER a refusal, taken PRIVILEGED and direct.
 *
 * Counting through the same member/anon token that was just refused is
 * self-confirming: that token cannot see the foreign row by construction, so it
 * answers 0 whether the write landed or not. `{ok:false}` is what the function
 * said; this is what the database did.
 */
export async function countPrivileged(table, where = 'true', params = []) {
  const rows = await q(`select count(*)::int as n from public."${table}" where ${where}`, params)
  return rows[0].n
}
