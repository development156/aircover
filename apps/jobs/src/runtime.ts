import { Pool, type PoolConfig } from 'pg'
import { readFileSync } from 'node:fs'
import { createPgLedgerPort, createWithCredits, type PgLedgerPort } from '@sahoda/billing'
import { fetchTransport } from '@sahoda/publishing'
import { loadJobsEnv, type JobsEnv } from './env'
import { createPublishStore } from './publish/store'
import { createPostsStore } from './ai/postsStore'
import { createAdapterSelector } from './publish/adapters'
import { createConnectionResolver } from './publish/tokens'
import { createExpiredHoldSource } from './holds/pgHolds'
import type { PublishPostDeps } from './publish/runPublishPost'
import type { HoldSweepDeps } from './holds/sweep'
import type { PlanWeekJobDeps } from './ai/plan-week-job'
import { runPlanWeek } from './ai/plan-week'

// Anchored to a full hostname label so a look-alike host, or a substring sitting in the
// DSN's user/password, can never trigger the relaxed-verification path.
const SUPABASE_HOST = /(^|\.)supabase\.(co|com|in|net)$/

/**
 * TLS for the direct Postgres connection, matching packages/billing/src/ledger/pg.ts.
 * SET SUPABASE_DB_CA_CERT IN PRODUCTION: Supabase's direct endpoint presents a private CA
 * chain, so full verification needs that CA on disk. Without it the connection is still
 * encrypted but the chain is unverified — acceptable for a developer's own project, NOT
 * for prod, where an unverified chain is MITM-able. Tracked as H19 hardening.
 */
function pgSsl(connectionString: string): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  try {
    const host = new URL(connectionString).hostname.toLowerCase()
    if (SUPABASE_HOST.test(host)) return { rejectUnauthorized: false }
  } catch {
    /* fall through to default TLS handling */
  }
  return undefined
}

interface Runtime {
  env: JobsEnv
  pool: Pool
  ledger: PgLedgerPort
}

let cached: Runtime | undefined

/**
 * Process-wide runtime: one env read, one connection pool, one ledger port. Server-only —
 * it holds the service-role database URL and must never be imported from client code.
 */
export function getRuntime(): Runtime {
  if (cached) return cached
  const env = loadJobsEnv()
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    ssl: pgSsl(env.databaseUrl),
  })
  cached = { env, pool, ledger: createPgLedgerPort({ connectionString: env.databaseUrl, pool }) }
  return cached
}

/** Dependencies for one publishPost attempt. */
export function publishPostDeps(): PublishPostDeps {
  const { env, pool } = getRuntime()
  const store = createPublishStore({ pool })

  return {
    mode: env.publishMode,
    loadVariant: store.loadVariant,
    // openSecret is intentionally unwired: packages/publishing exports no vault opener,
    // so a live publish fails honestly instead of inventing a token (see REQUESTS.md).
    resolveConnection: createConnectionResolver({ loadConnection: store.loadConnection }),
    adapterFor: createAdapterSelector({ mode: env.publishMode, transport: fetchTransport() }),
    writeLog: store.writeLog,
    markVariant: store.markVariant,
    markConnection: store.markConnection,
  }
}

/** Dependencies for one expired-hold sweep. */
export function holdSweepDeps(): HoldSweepDeps {
  const { env, pool, ledger } = getRuntime()
  return {
    listExpiredHolds: createExpiredHoldSource({
      pool,
      graceSeconds: env.holdSweepGraceSeconds,
    }),
    apply: ledger.apply,
  }
}

/** Dependencies for one plan-week run. */
export function planWeekDeps(): PlanWeekJobDeps {
  const { pool, ledger } = getRuntime()
  const posts = createPostsStore({ pool })
  return {
    withCredits: createWithCredits(ledger),
    runPlanWeek: (input, ctx) => runPlanWeek(input, ctx),
    insertBriefs: posts.insertBriefs,
  }
}
