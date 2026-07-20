import { AiProviderLogSchema, AuditLogSchema, type AiProviderLog } from '@sahoda/shared'
import type { SeedCtx, SeedModule, SeedTableResult } from './context'
import { ACTION_COST, TIER_MODEL, creditsFor } from './costs'
import { auditRows, failedImageRow, meshCalls, trace, type MeshCall } from './ops.content'

/**
 * Both tables carry the append-only `app.block_mutations` trigger (migration 08). That
 * guard raises unless `pg_trigger_depth() > 1` (migration 01), so the usual seed move —
 * `on conflict (id) do update` — trips it at depth 1 and aborts the SECOND run. These
 * inserts use `on conflict (id) do nothing`: ids stay deterministic so the row set is
 * unchanged on re-run, and an existing line keeps its created_at. Right for a log
 * anyway — one that rewrites its own history is not a log.
 */

/**
 * Tier, model, COGS and credits are all read off ACTION_COST rather than typed per row, so
 * an `ai_provider_logs` row can never claim a different tier or a different cost from the
 * `credit_ledger` entry that mirrors it. One call = one unit of the action, so the cost is
 * taken as-is; a row standing for several units would have to multiply.
 */
function meshLogRow(ctx: SeedCtx, call: MeshCall, ordinal: number): AiProviderLog {
  const [tokensIn, tokensOut, cached, latencyMs] = call.usage
  const cost = ACTION_COST[call.action]
  return {
    id: ctx.id(`ailog.${ordinal}`),
    workspace_id: ctx.workspaceId,
    // An action the Alpha mesh has no task for is logged under its ledger action name
    // rather than borrowed onto a route the router does not have.
    task: cost.meshTask ?? call.action,
    tier: cost.tier,
    provider: 'openrouter',
    model: cost.tier === null ? null : TIER_MODEL[cost.tier],
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cached_tokens: cached,
    cost_usd: cost.cogsUsd,
    latency_ms: latencyMs,
    credits_charged: creditsFor(call.action),
    status: 'ok',
    error_code: null,
    trace_id: trace(call.traceSlug),
    created_at: call.at.toISOString(),
  }
}

export const seedOps: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  const audits = auditRows(ctx).map((row) => AuditLogSchema.parse(row))
  for (const row of audits) {
    await ctx.sql(
      `insert into audit_logs
         (id, workspace_id, actor, action, target, meta, trace_id, created_at)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
       on conflict (id) do nothing`,
      [
        row.id,
        row.workspace_id,
        row.actor,
        row.action,
        // Null stays SQL NULL: JSON.stringify(null) would store the jsonb literal `null`.
        row.target === null ? null : JSON.stringify(row.target),
        row.meta === null ? null : JSON.stringify(row.meta),
        row.trace_id,
        row.created_at,
      ],
    )
  }

  const logs = [
    ...meshCalls(ctx).map((call, i) => meshLogRow(ctx, call, i + 1)),
    failedImageRow(ctx),
  ].map((row) => AiProviderLogSchema.parse(row))
  for (const row of logs) {
    // Columns and values come off the same parsed row, so they cannot drift apart, and
    // Postgres matches by name. Only shared-schema identifiers reach the SQL text.
    const columns = Object.keys(row)
    await ctx.sql(
      `insert into ai_provider_logs (${columns.join(', ')})
       values (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (id) do nothing`,
      Object.values(row),
    )
  }

  ctx.log(`ops: ${audits.length} audit_logs, ${logs.length} ai_provider_logs`)
  return [
    { table: 'audit_logs', rows: audits.length },
    { table: 'ai_provider_logs', rows: logs.length },
  ]
}
