#!/usr/bin/env node
/**
 * Refuse a smoke run whose database URL cannot sign in, before the suite spends
 * an hour proving it in the least legible way possible.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────
 * MEASURED 2026-09-06 on staging (yoxmzwkxweasfaahhvpj): supavisor logged 104
 * `password authentication failed for user "postgres"` in exactly the windows
 * the three smoke runs occupied (19:30Z on the 5th, 04:00–05:00Z on the 6th),
 * and nothing else in that day. `E2E_SUPABASE_DB_URL` carries the wrong
 * password. Every page that reads through the direct pool — /playbooks first,
 * because `lib/playbooks/store.ts` opens it on render — threw on the server and
 * rendered "This screen didn't load", which the suite reported as a missing
 * heading, three attempts each, with no sentence anywhere naming the password.
 *
 * The secrets guard checks the URL's SHAPE (postgres://). This checks that it
 * WORKS, in a few seconds, and says what to do when it does not. It also refuses
 * a URL whose tenant is not the acknowledged target: the REST URL is checked by
 * `assertE2ETargetAllowed`, but a production pooler string beside a staging
 * REST URL would pass that check and write the suite's rows into production.
 *
 *   SUPABASE_DB_URL=... SAHODA_E2E_ACK_TARGET=<ref> node scripts/smoke-db-probe.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The project a connection string belongs to. A pooler string signs in as
 * `postgres.<ref>`; a direct-host string signs in as plain `postgres` and
 * carries the ref in the host, `db.<ref>.supabase.co`. MEASURED 2026-09-06:
 * the production URL in the root env file is the second form, and the first
 * draft of this function called it "a user this guard cannot read".
 */
export function tenantRef(url) {
  try {
    const u = new URL(url)
    const user = decodeURIComponent(u.username).match(/^postgres\.([a-z]{20})$/)
    if (user) return user[1]
    const host = u.hostname.match(/^db\.([a-z]{20})\.supabase\.co$/)
    return host ? host[1] : null
  } catch {
    return null
  }
}

/** Pure: the refusal for a tenant that is not the acknowledged target, or null. */
export function targetRefusal(ref, ack) {
  if (!ack) return null
  if (ref === ack) return null
  return (
    `REFUSED: SUPABASE_DB_URL signs in as ${ref ? `project ${ref}` : 'a user this guard cannot read'}, ` +
    `but the run acknowledged ${ack}. The pooler string and the REST URL must belong to the same ` +
    'project, or the suite reads one database and writes another.'
  )
}

/** Pure: a plain sentence for the failure, and the one thing that fixes it. */
export function describeFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/password authentication failed/i.test(message)) {
    return (
      'REFUSED: SUPABASE_DB_URL has the wrong password. The host answered, the user exists, ' +
      'the password does not match. Fix: Supabase -> the staging project -> Settings -> Database -> ' +
      'Reset database password, then paste the new SESSION POOLER string into the ' +
      'E2E_SUPABASE_DB_URL repository secret. Nothing in this repository can do that step.'
    )
  }
  if (/tenant or user not found/i.test(message)) {
    return (
      'REFUSED: the pooler does not know this project. The user must be postgres.<project ref> ' +
      'and the host the pooler of the same region; copy the string from Supabase -> Settings -> ' +
      'Database -> Connection string -> Session pooler, do not assemble it.'
    )
  }
  if (/timeout|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return `REFUSED: could not reach the database host (${message}). A direct-host URL is IPv6-only and unreachable from GitHub runners; use the session pooler string.`
  }
  return `REFUSED: the database refused the connection: ${message}`
}

function ssl(url) {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  try {
    const host = new URL(url).hostname
    if (/\.supabase\.(com|co)$/.test(host)) return { rejectUnauthorized: false }
  } catch {
    // an unparseable URL fails at connect() with a better message than this
  }
  return undefined
}

async function main() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    console.error(
      'REFUSED: SUPABASE_DB_URL is not set, so the pages that read the ledger cannot render.',
    )
    process.exit(2)
  }
  const ref = tenantRef(url)
  const refusal = targetRefusal(ref, process.env.SAHODA_E2E_ACK_TARGET)
  if (refusal) {
    console.error(refusal)
    process.exit(1)
  }
  const here = path.dirname(fileURLToPath(import.meta.url))
  const billingRequire = createRequire(path.join(here, '..', 'packages', 'billing', 'package.json'))
  const { Client } = billingRequire('pg')
  const client = new Client({
    connectionString: url,
    ssl: ssl(url),
    connectionTimeoutMillis: 15_000,
    statement_timeout: 10_000,
  })
  try {
    await client.connect()
    const { rows } = await client.query('select current_database() as db')
    console.log(`smoke-db: signed in to ${ref ?? 'the database'} (${rows[0].db})`)
  } catch (error) {
    console.error(describeFailure(error))
    process.exit(1)
  } finally {
    await client.end().catch(() => {})
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
