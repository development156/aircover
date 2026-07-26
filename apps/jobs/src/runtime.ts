import { Pool } from 'pg'
import { createPgLedgerPort, guardPoolErrors, pgSsl, type PgLedgerPort } from '@sahoda/billing'
import { loadJobsEnv, type JobsEnv } from './env'
import { createExpiredHoldSource } from './holds/pgHolds'
import { createDispatchStore } from './dispatch/pgDispatch'
import type { HoldSweepDeps } from './holds/sweep'
import type { DispatchSweepDeps } from './dispatch/sweep'

// `pgSsl` is imported from @sahoda/billing rather than re-derived here. The local copy this
// replaces read `new URL(connectionString).hostname`, which is NOT the host pg dials: a
// `?host=` query parameter overrides the authority host, and a REPEATED `?host=` keeps the
// LAST. So `…@db.abc.supabase.co/postgres?host=evil.com` relaxed certificate verification
// while this service-role pool connected to evil.com. Same rule, one definition, one place
// where it is tested. SET SUPABASE_DB_CA_CERT IN PRODUCTION for full chain verification.

/**
 * How much work one sweep may take on. The caller sets it because the ceiling belongs to
 * the RUNNER, not the job: a durable worker can afford a large batch, while a serverless
 * request has a hard wall (Vercel's function limit) and must stay far inside it. Backlogs
 * drain across ticks in both cases — every candidate query is oldest-first.
 */
export interface SweepBatchOptions {
  limit?: number
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
 *
 * This module deliberately imports NOTHING from ./publish or ./ai. Those graphs reach
 * @sahoda/publishing and @sahoda/mesh, and the sweeps are consumed from apps/web through
 * the ./sweeps entry point — a transitive import here would pull two large packages, and
 * a model client, into a serverless route that only ever runs SQL. Each job family owns
 * its own deps module instead: publish/deps.ts, ai/deps.ts.
 */
export function getRuntime(): Runtime {
  if (cached) return cached
  const env = loadJobsEnv()
  // guardPoolErrors is mandatory on a module-level singleton: node-postgres emits 'error' on the
  // Pool when an IDLE client fails (pooler idle timeout, failover, maintenance restart), and with
  // no listener Node treats that as an uncaught exception and kills the process — a Trigger.dev
  // worker would die at 3am from a routine connection recycle. The pool discards the broken
  // client and carries on, so swallowing is correct; the next query gets a fresh connection.
  const pool = guardPoolErrors(
    new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      ssl: pgSsl(env.databaseUrl),
    }),
  )
  cached = { env, pool, ledger: createPgLedgerPort({ connectionString: env.databaseUrl, pool }) }
  return cached
}

/**
 * Dependencies for one scheduled-publish sweep, minus the enqueue.
 *
 * `enqueuePublish` is supplied by the trigger wrapper instead: publishPost's trigger helper
 * imports `publishPostDeps` from this module, so wiring it here would close a require cycle
 * — and it would drag the Trigger.dev SDK into the module the SDK-free cores depend on.
 */
export function dispatchSweepDeps(
  opts: SweepBatchOptions = {},
): Omit<DispatchSweepDeps, 'enqueuePublish'> {
  const { env, pool } = getRuntime()
  const store = createDispatchStore({ pool, limit: opts.limit })

  return {
    mode: env.dispatchMode,
    graceSeconds: env.dispatchGraceSeconds,
    listCandidates: store.listCandidates,
    expirePost: store.expirePost,
    settlePost: store.settlePost,
  }
}

/** Dependencies for one expired-hold sweep. */
export function holdSweepDeps(opts: SweepBatchOptions = {}): HoldSweepDeps {
  const { env, pool, ledger } = getRuntime()
  return {
    mode: env.holdSweepMode,
    listExpiredHolds: createExpiredHoldSource({
      pool,
      graceSeconds: env.holdSweepGraceSeconds,
      limit: opts.limit,
    }),
    apply: ledger.apply,
  }
}
