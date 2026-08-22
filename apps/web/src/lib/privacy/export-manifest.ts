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
 * MEASURED against production on 2026-08-19: **30 tables**. Against the
 * migration files on 2026-08-21: **39**.
 *
 * ## The guard that was supposed to catch that, and why it did not
 *
 * `export-drift.test.ts` re-runs that query against the live database and fails
 * on a workspace-owned table this file does not know about. It is
 * `describe.skip` without `SUPABASE_DB_URL`, the only project this repo has IS
 * production, and `forbidden-target.ts` refuses that on purpose — so it has
 * never run, and SEVEN tables were quietly missing from every export:
 *
 *   audience_snapshots · billing_profiles · invoices · loop_briefs ·
 *   loop_channel_autonomy · loop_cycles · loop_settings
 *
 * Four of those are the Loop's, which is a record of what a customer was charged
 * for and what Sahoda decided on their behalf. An export omitting them still
 * said "everything you own" — the one claim an export must never make falsely,
 * because the person reading it has no way to check.
 *
 * They were found by `packages/db/tests/export_manifest.pglite.test.ts`, which
 * asks the same two questions of the MIGRATION FILES, in process, with no
 * credentials, on every gate run. It cannot speak for production; it catches the
 * thing that actually goes stale, which is somebody adding a table and this file
 * not moving.
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
 * Every workspace-owned table, as of 2026-08-21.
 *
 * `no-read-policy` is recorded from `pg_policies`, not guessed: a table with no
 * SELECT policy returns an empty array rather than an error, so this is the only
 * place the difference can be known.
 *
 * ── 2026-08-22: EIGHT TABLES, FOUND BY THE GUARD RATHER THAN BY A PERSON ────
 * `asset_derivatives`, `competitor_subscriptions`, `knowledge_chunks`,
 * `knowledge_documents`, `playbook_run_items`, `playbook_runs`, `playbooks`,
 * `zernio_webhook_events`.
 *
 * Every one arrived from a separate lane, and no lane could have seen the gap:
 * on each branch, this file listed every table THAT branch knew about. The
 * absence only exists in the union, which is what the merge is. That is the
 * whole argument for running the gate after every merge instead of at the end.
 *
 * READABILITY WAS READ, NOT ASSUMED, for each of them — `apply_tenant_policies`
 * for `asset_derivatives`, `apply_tenant_read_policy` for the knowledge,
 * playbook and webhook tables, and hand-written `for select` policies for
 * `competitor_subscriptions` and `playbooks`. All eight have a SELECT policy, so
 * all eight are `readable` and none needs the "reported by name, never as an
 * empty list" treatment `ai_provider_logs` gets.
 *
 * ── 2026-08-21: `remix_batches` and `remix_derivatives` ────────────────────
 * Added the day they were written, not the day somebody noticed. Both take the
 * standard `app.apply_tenant_policies` set, so both are `readable` — read out of
 * the migration file rather than assumed, and `export_manifest.pglite.test.ts`
 * checks the whole list against the catalog on every gate run, with no
 * credentials, so a table added next month cannot go missing quietly.
 */
export const EXPORT_TABLES: readonly ExportTable[] = [
  { table: 'ai_provider_logs', readability: 'no-read-policy', describes: 'AI usage records' },
  { table: 'asset_usages', readability: 'readable', describes: 'where each picture is used' },
  {
    table: 'asset_derivatives',
    readability: 'readable',
    describes: 'the per-channel crops made from your pictures',
  },
  { table: 'assets', readability: 'readable', describes: 'your picture library' },
  { table: 'audience_snapshots', readability: 'readable', describes: 'who follows you' },
  { table: 'audit_logs', readability: 'readable', describes: 'a record of admin actions' },
  {
    table: 'billing_profiles',
    readability: 'readable',
    describes: 'who your invoices are made out to',
  },
  { table: 'brand_memory', readability: 'readable', describes: 'your Brand Brain' },
  { table: 'campaign_posts', readability: 'readable', describes: 'posts inside campaigns' },
  { table: 'campaigns', readability: 'readable', describes: 'your campaigns' },
  { table: 'connections', readability: 'readable', describes: 'your linked accounts' },
  {
    table: 'competitor_subscriptions',
    readability: 'readable',
    describes: 'the businesses you asked Radar to watch',
  },
  { table: 'credit_balances', readability: 'readable', describes: 'your credit balance' },
  { table: 'credit_ledger', readability: 'readable', describes: 'every credit movement' },
  { table: 'inbox_messages', readability: 'readable', describes: 'messages and comments' },
  { table: 'inbox_threads', readability: 'readable', describes: 'conversations' },
  { table: 'invoices', readability: 'readable', describes: 'your tax invoices and credit notes' },
  {
    table: 'knowledge_chunks',
    readability: 'readable',
    describes: 'the passages your documents were split into',
  },
  {
    table: 'knowledge_documents',
    readability: 'readable',
    describes: 'the documents you added to the knowledge library',
  },
  { table: 'leads', readability: 'readable', describes: 'enquiries from your site' },
  {
    // Added 2026-08-23 with the erasure migration, and NOT by a person noticing:
    // `export_manifest.pglite.test.ts` failed on the very next gate run, naming
    // it. That is the guard working on its first real chance, and it is the
    // answer to whether it can catch a table a later lane adds.
    //
    // `no-read-policy` is read from the migration, not assumed: the table has
    // RLS on and no policies at all, so PostgREST answers `[]` — which reads
    // identically to "you have none". It is named in `notIncluded` instead.
    table: 'ledger_actor_redactions',
    readability: 'no-read-policy',
    describes: 'whether your name is shown on your credit record',
  },
  { table: 'loop_briefs', readability: 'readable', describes: 'what the Loop planned each week' },
  {
    table: 'loop_channel_autonomy',
    readability: 'readable',
    describes: 'how much the Loop may do on each channel',
  },
  { table: 'loop_cycles', readability: 'readable', describes: 'every week the Loop ran' },
  { table: 'loop_settings', readability: 'readable', describes: 'your Loop settings' },
  { table: 'memory_events', readability: 'readable', describes: 'changes to your Brand Brain' },
  { table: 'ops_credit_requests', readability: 'readable', describes: 'credit top-up requests' },
  {
    table: 'planner_events',
    readability: 'readable',
    describes: 'your planner',
  },
  {
    table: 'playbook_run_items',
    readability: 'readable',
    describes: 'what each playbook run produced',
  },
  { table: 'playbook_runs', readability: 'readable', describes: 'every playbook run' },
  { table: 'playbooks', readability: 'readable', describes: 'your playbooks' },
  { table: 'post_media', readability: 'readable', describes: 'pictures attached to posts' },
  {
    table: 'post_metric_snapshots',
    readability: 'readable',
    describes: 'how your posts performed',
  },
  { table: 'post_publish_logs', readability: 'readable', describes: 'every publish attempt' },
  { table: 'post_variants', readability: 'readable', describes: 'the per-channel wording' },
  { table: 'posts', readability: 'readable', describes: 'your posts' },
  { table: 'remix_batches', readability: 'readable', describes: 'your Remix runs' },
  {
    table: 'remix_derivatives',
    readability: 'readable',
    describes: 'the drafts each Remix run produced',
  },
  { table: 'site_pages', readability: 'readable', describes: 'the pages of your sites' },
  { table: 'site_sections', readability: 'readable', describes: 'the sections on those pages' },
  { table: 'sites', readability: 'readable', describes: 'your websites' },
  { table: 'subscriptions', readability: 'readable', describes: 'your plan' },
  { table: 'templates', readability: 'readable', describes: 'your saved templates' },
  { table: 'tour_progress', readability: 'readable', describes: 'which tours you have seen' },
  { table: 'workspace_members', readability: 'readable', describes: 'who is on this workspace' },
  { table: 'workspace_themes', readability: 'readable', describes: 'your colours' },
  { table: 'zernio_profiles', readability: 'readable', describes: 'the publishing profile id' },
  {
    table: 'zernio_webhook_events',
    readability: 'readable',
    describes: 'what the platforms told Sahoda about your accounts',
  },
] as const

export const EXPORTABLE_TABLES: readonly ExportTable[] = EXPORT_TABLES.filter(
  (t) => t.readability === 'readable',
)

export const UNEXPORTABLE_TABLES: readonly ExportTable[] = EXPORT_TABLES.filter(
  (t) => t.readability !== 'readable',
)
