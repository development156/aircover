import { Pool } from 'pg'
import { PlanIdSchema, type PlanId } from '@sahoda/shared'
import { assertServerOnly } from '../env'
import { guardPoolErrors, pgSsl } from '../pgSsl'
import type { PlanResolverPort } from './port'

/** A workspace with no live subscription is on Free (the schema's own rule). */
const DEFAULT_PLAN: PlanId = 'free'

/**
 * Statuses that count as a live subscription. This exact set backs the partial unique index
 * `subscriptions_one_live`, so at most ONE row per workspace can match — which is why this
 * query is deterministic without an ORDER BY tiebreak.
 *
 * Filtering on the live set (rather than taking the newest row) is load-bearing: 'suspended'
 * and 'canceled' rows sit OUTSIDE that index, so a workspace can accumulate several. Ordering
 * by created_at would happily return a canceled row and grant its entitlements.
 */
const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'grace'] as const

export interface PgPlanResolverOptions {
  connectionString: string
  /** Inject a pre-built pool (tests / connection reuse); otherwise one is created. */
  pool?: Pool
  /** Observe idle-client pool errors without this package taking a logger dependency. */
  onPoolError?: (cause: unknown) => void
}

export type PgPlanResolver = PlanResolverPort & { pool: Pool; close(): Promise<void> }

/**
 * The direct-Postgres PlanResolverPort. Reads `subscriptions` over the same server-only pg
 * connection the ledger port uses (RLS grants members SELECT only; writes are service-role).
 */
export function createPgPlanResolver(opts: PgPlanResolverOptions): PgPlanResolver {
  assertServerOnly()
  const ownsPool = opts.pool === undefined
  const pool = guardPoolErrors(
    opts.pool ??
      new Pool({
        connectionString: opts.connectionString,
        max: 10,
        ssl: pgSsl(opts.connectionString),
      }),
    opts.onPoolError,
  )

  async function resolvePlanId(workspaceId: string): Promise<PlanId> {
    const r = await pool.query<{ plan_id: string }>(
      `select plan_id
         from subscriptions
        where workspace_id = $1
          and status = any($2::text[])
        limit 1`,
      [workspaceId, LIVE_STATUSES],
    )

    const raw = r.rows[0]?.plan_id
    if (raw === undefined) return DEFAULT_PLAN

    // The column is `text references plans(id)`, not an enum — parse rather than trust, so a
    // plan the code does not know about surfaces as an error instead of an unchecked index.
    return PlanIdSchema.parse(raw)
  }

  // Only end a pool we created — see PgLedgerPort.close.
  return {
    resolvePlanId,
    pool,
    close: async () => {
      if (ownsPool) await pool.end()
    },
  }
}
