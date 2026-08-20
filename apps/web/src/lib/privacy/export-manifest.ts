/**
 * What a workspace owns, for the DPDP export — and, just as importantly, what an
 * export cannot promise.
 *
 * ## The list is DERIVED, not typed out
 *
 * A workspace's data is "every table carrying a `workspace_id`". That is a fact
 * about the schema, so the list below was produced by asking the schema:
 *
 *   select c.table_name from information_schema.columns c
 *   join information_schema.tables t using (table_schema, table_name)
 *   where t.table_type = 'BASE TABLE'
 *     and c.table_schema = 'public' and c.column_name = 'workspace_id'
 *
 * MEASURED against production on 2026-08-19: **30 tables**. `export-drift.test.ts`
 * re-runs that query against the live database and fails if the schema grows a
 * workspace-owned table this file does not know about. Without that guard, a
 * table added next month is silently missing from every export, and the export
 * still says "everything" — which is the one thing an export must never say
 * falsely, because the person reading it has no way to check.
 *
 * ## Why some tables cannot be exported, and why that is stated per table
 *
 * The export runs as the signed-in member, under RLS, because `apps/web` has no
 * service-role client and RLS is the security boundary here (see
 * `lib/supabase/server.ts`). So the export can only contain what that member is
 * allowed to read.
 *
 * MEASURED from `pg_policies`: `ai_provider_logs` has **no policies at all**.
 * PostgREST therefore answers `[]` for it — and an empty array is
 * indistinguishable from "you have no rows". That is the trap this file exists
 * to avoid: an export that renders `ai_provider_logs: []` is making the claim
 * "you have no AI call records", which is false, and it is making it in a
 * document a customer may rely on for a legal request.
 *
 * So every table is classified. `readable` tables are exported. `no-read-policy`
 * tables are reported BY NAME as not exported, with the reason, and never as an
 * empty list.
 */

/** Whether the signed-in member can read this table at all. */
export type Readability = 'readable' | 'no-read-policy'

export interface ExportTable {
  readonly table: string
  readonly readability: Readability
  /** Plain words for the person reading the export, not the schema's words. */
  readonly describes: string
}

/**
 * Every workspace-owned table, as of 2026-08-19.
 *
 * `no-read-policy` is recorded from `pg_policies`, not guessed: a table with no
 * SELECT policy returns an empty array rather than an error, so this is the only
 * place the difference can be known.
 */
export const EXPORT_TABLES: readonly ExportTable[] = [
  { table: 'ai_provider_logs', readability: 'no-read-policy', describes: 'AI usage records' },
  { table: 'asset_usages', readability: 'readable', describes: 'where each picture is used' },
  { table: 'assets', readability: 'readable', describes: 'your picture library' },
  { table: 'audit_logs', readability: 'readable', describes: 'a record of admin actions' },
  { table: 'brand_memory', readability: 'readable', describes: 'your Brand Brain' },
  { table: 'campaign_posts', readability: 'readable', describes: 'posts inside campaigns' },
  { table: 'campaigns', readability: 'readable', describes: 'your campaigns' },
  { table: 'connections', readability: 'readable', describes: 'your linked accounts' },
  { table: 'credit_balances', readability: 'readable', describes: 'your credit balance' },
  { table: 'credit_ledger', readability: 'readable', describes: 'every credit movement' },
  { table: 'inbox_messages', readability: 'readable', describes: 'messages and comments' },
  { table: 'inbox_threads', readability: 'readable', describes: 'conversations' },
  { table: 'leads', readability: 'readable', describes: 'enquiries from your site' },
  { table: 'memory_events', readability: 'readable', describes: 'changes to your Brand Brain' },
  { table: 'ops_credit_requests', readability: 'readable', describes: 'credit top-up requests' },
  { table: 'planner_events', readability: 'readable', describes: 'your planner' },
  { table: 'post_media', readability: 'readable', describes: 'pictures attached to posts' },
  {
    table: 'post_metric_snapshots',
    readability: 'readable',
    describes: 'how your posts performed',
  },
  { table: 'post_publish_logs', readability: 'readable', describes: 'every publish attempt' },
  { table: 'post_variants', readability: 'readable', describes: 'the per-channel wording' },
  { table: 'posts', readability: 'readable', describes: 'your posts' },
  { table: 'site_pages', readability: 'readable', describes: 'the pages of your sites' },
  { table: 'site_sections', readability: 'readable', describes: 'the sections on those pages' },
  { table: 'sites', readability: 'readable', describes: 'your websites' },
  { table: 'subscriptions', readability: 'readable', describes: 'your plan' },
  { table: 'templates', readability: 'readable', describes: 'your saved templates' },
  { table: 'tour_progress', readability: 'readable', describes: 'which tours you have seen' },
  { table: 'workspace_members', readability: 'readable', describes: 'who is on this workspace' },
  { table: 'workspace_themes', readability: 'readable', describes: 'your colours' },
  { table: 'zernio_profiles', readability: 'readable', describes: 'the publishing profile id' },
] as const

export const EXPORTABLE_TABLES: readonly ExportTable[] = EXPORT_TABLES.filter(
  (t) => t.readability === 'readable',
)

export const UNEXPORTABLE_TABLES: readonly ExportTable[] = EXPORT_TABLES.filter(
  (t) => t.readability !== 'readable',
)
