#!/usr/bin/env node
/**
 * Record ONE already-applied migration in `supabase_migrations.schema_migrations`.
 *
 * INSERT ONLY. This never runs a migration's DDL — the objects are already
 * there, and re-running `create table` or `drop constraint` against production
 * is how a repair becomes an outage. It refuses to insert a version whose
 * objects it cannot SEE, so "record it" can never become "claim it".
 *
 * `statements` is left empty, matching the four most recent rows written by
 * `supabase migration repair`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const ROOT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-integrate2'

function env(file) {
  const out = {}
  let raw
  try {
    raw = readFileSync(resolve(ROOT, file), 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * What must ALREADY EXIST for a version to be recordable, per version.
 *
 * A version with no proof listed here cannot be recorded at all — the whole
 * point is that the record follows the schema rather than leading it.
 */
const PROOF = {
  20260821000100: {
    name: 'lead_doors',
    sql: `select count(*)::int as n
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('lead_submit','lead_from_inbox','lead_from_conversation')`,
    expect: 3,
  },
}

const version = process.argv[2]
const proof = PROOF[version]
if (!proof) {
  console.error(`refusing: no existence proof defined for version ${version}`)
  process.exit(2)
}

const E = { ...env('.env'), ...env('apps/web/.env') }
const url = E.SUPABASE_DB_URL ?? E.DATABASE_URL
if (!url || !/rloztdhzfliyvpvxsgjl/.test(url)) {
  console.error('refusing: not the expected production connection string')
  process.exit(2)
}

function pgHostname(cs) {
  try {
    const u = new URL(cs)
    const o = u.searchParams.getAll('host')
    const last = o.length > 0 ? o[o.length - 1] : undefined
    return (last && last.length > 0 ? last : u.hostname).toLowerCase()
  } catch {
    return null
  }
}
const SUPABASE_HOST = /(^|\.)supabase\.(co|com|in|net)$/
const ca = process.env.SUPABASE_DB_CA_CERT
const host = pgHostname(url)
const ssl = ca
  ? { ca: readFileSync(ca, 'utf8'), rejectUnauthorized: true }
  : host && SUPABASE_HOST.test(host)
    ? { rejectUnauthorized: false }
    : undefined
if (!ssl) {
  console.error('refusing: not a Supabase host, and no CA to verify against')
  process.exit(2)
}

const client = new pg.Client({ connectionString: url, ssl })
await client.connect()
try {
  const seen = await client.query(proof.sql)
  const n = seen.rows[0]?.n ?? 0
  if (n !== proof.expect) {
    console.error(
      `refusing: ${proof.name} is NOT applied — proof found ${n}, expected ${proof.expect}`,
    )
    process.exit(1)
  }
  const before = await client.query(
    'select count(*)::int as n from supabase_migrations.schema_migrations where version = $1',
    [version],
  )
  if (before.rows[0].n > 0) {
    console.log(`${version} ${proof.name}: already recorded, nothing to do`)
    process.exit(0)
  }
  const r = await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, '{}')
     on conflict (version) do nothing
     returning version, name`,
    [version, proof.name],
  )
  console.log(`RECORDED ${JSON.stringify(r.rows)} (proof: ${n}/${proof.expect} objects present)`)
} finally {
  await client.end()
}
