import { Pool } from 'pg'
import {
  createPgLedgerPort,
  createWithCredits,
  guardPoolErrors,
  pgSsl,
  type PgLedgerPort,
} from '@sahoda/billing'
import { fetchTransport } from '@sahoda/publishing'
import { loadJobsEnv, type JobsEnv } from './env'
import { createPublishStore } from './publish/store'
import { createPostsStore } from './ai/postsStore'
import { createAdapterSelector } from './publish/adapters'
import { createConnectionResolver } from './publish/tokens'
import { createExpiredHoldSource } from './holds/pgHolds'
import { createDispatchStore } from './dispatch/pgDispatch'
import type { PublishPostDeps } from './publish/runPublishPost'
import type { HoldSweepDeps } from './holds/sweep'
import type { DispatchSweepDeps } from './dispatch/sweep'
import type { PlanWeekJobDeps } from './ai/plan-week-job'
import { runPlanWeek } from './ai/plan-week'

// `pgSsl` is imported from @sahoda/billing rather than re-derived here. The local copy this
// replaces read `new URL(connectionString).hostname`, which is NOT the host pg dials: a
// `?host=` query parameter overrides the authority host, and a REPEATED `?host=` keeps the
// LAST. So `…@db.abc.supabase.co/postgres?host=evil.com` relaxed certificate verification
// while this service-role pool connected to evil.com. Same rule, one definition, one place
// where it is tested. SET SUPABASE_DB_CA_CERT IN PRODUCTION for full chain verification.

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

/**
 * Dependencies for one scheduled-publish sweep, minus the enqueue.
 *
 * `enqueuePublish` is supplied by the trigger wrapper instead: publishPost's trigger helper
 * imports `publishPostDeps` from this module, so wiring it here would close a require cycle
 * — and it would drag the Trigger.dev SDK into the module the SDK-free cores depend on.
 */
export function dispatchSweepDeps(): Omit<DispatchSweepDeps, 'enqueuePublish'> {
  const { env, pool } = getRuntime()
  const store = createDispatchStore({ pool })

  return {
    mode: env.dispatchMode,
    graceSeconds: env.dispatchGraceSeconds,
    listCandidates: store.listCandidates,
    expirePost: store.expirePost,
    settlePost: store.settlePost,
  }
}

/** Dependencies for one expired-hold sweep. */
export function holdSweepDeps(): HoldSweepDeps {
  const { env, pool, ledger } = getRuntime()
  return {
    mode: env.holdSweepMode,
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
