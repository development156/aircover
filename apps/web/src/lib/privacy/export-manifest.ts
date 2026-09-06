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
 *   audience_snapshots · billing_profiles · invoices · loop_autopilot_log ·
 *   loop_briefs · loop_channel_autonomy · loop_cycles · loop_settings
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
  {
    table: 'asset_folder_items',
    readability: 'readable',
    describes: 'which folders you filed each picture in',
  },
  { table: 'asset_folders', readability: 'readable', describes: 'the folders you made' },
  {
    /**
     * ── THE WRITER ARRIVED, SO THIS SENTENCE WENT BACK TO THE PLAIN ONE ─────
     * This entry used to carry a long note explaining that the table was
     * readable, exported and EMPTY for every customer, because nothing wrote
     * it: `logo-bytes.ts` recomputed a logo's measurements on every generation
     * and kept none of them. Its last line said that if a writer ever arrived,
     * the sentence goes back to the plain one. It arrived on 2026-09-06
     * (`lib/brand/logo-facts-cache.ts`), so it has.
     *
     * The old note is worth remembering for its reasoning rather than its
     * conclusion: an entry reading "what Sahoda measured about each logo you
     * uploaded" above an empty list told a reader we measured nothing, which
     * was the opposite of true. A description has to match what the export
     * will actually contain, and that changed when the code did.
     */
    table: 'asset_logo_facts',
    readability: 'readable',
    describes: 'what Sahoda measured about each logo you uploaded, so it can place it well',
  },
  {
    table: 'asset_smart_folders',
    readability: 'readable',
    describes: 'the saved searches you named',
  },
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
  {
    table: 'brand_starters',
    readability: 'readable',
    describes: 'the picture ideas Sahoda wrote for you from your Brand Brain',
  },
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
  {
    table: 'loop_autopilot_log',
    readability: 'readable',
    describes: 'every post autopilot decided to publish for you, and what it decided',
  },
  { table: 'loop_briefs', readability: 'readable', describes: 'what the Loop planned each week' },
  {
    table: 'loop_channel_autonomy',
    readability: 'readable',
    describes: 'how much the Loop may do on each channel',
  },
  { table: 'loop_cycles', readability: 'readable', describes: 'every week the Loop ran' },
  { table: 'loop_settings', readability: 'readable', describes: 'your Loop settings' },
  {
    table: 'marketing_observations',
    readability: 'readable',
    describes: 'what Sahoda worked out about your marketing',
  },
  {
    table: 'marketing_pass_runs',
    readability: 'readable',
    describes: 'when Sahoda last looked at your marketing, and what it was waiting for',
  },
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
  {
    table: 'post_approvals',
    readability: 'readable',
    describes: 'who sent each post for review, who cleared it, who sent it back and why',
  },
  {
    table: 'post_comments',
    readability: 'readable',
    describes: 'the notes people left on posts while they were being written',
  },
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
  { table: 'studio_designs', readability: 'readable', describes: 'the designs you made in Studio' },
  {
    table: 'studio_generations',
    readability: 'readable',
    describes: 'every picture you asked Studio to make, what you typed, and what it cost',
  },
  {
    table: 'studio_generation_images',
    readability: 'readable',
    describes: 'the pictures Studio produced and which file in your library each one became',
  },
  {
    table: 'studio_exports',
    readability: 'readable',
    // NOT "your exported pictures". The pictures themselves are rows in
    // `assets`, already covered above, with the bytes in the bucket. This table
    // holds only the LINK between a design and the file it became, which is a
    // different fact and would be a false claim under the other sentence.
    describes: 'which picture each design became',
  },
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

/**
 * ── THE BLIND SPOT THE SWEEP ABOVE CANNOT SEE ────────────────────────────────
 *
 * `EXPORT_TABLES` is derived from one question: which base tables carry a
 * `workspace_id`? That question is exactly right about ownership and structurally
 * blind to a table that is owned through a JOIN or through a different key. Three
 * consequences, and every one of them is personal data:
 *
 *  · `workspaces` itself. The name of the business, its slug, its settings. It is
 *    the PARENT of every row in the sweep and it carries no `workspace_id`, so no
 *    version of that query will ever return it.
 *  · `users_profile`. Keyed by `user_id`, holding an email address, a display
 *    name and an avatar. docs/31 said "your name, email and sign-in belong to
 *    Clerk, our sign-in provider" — a copy lives here, and that sentence was
 *    wrong for four days.
 *  · `connection_secrets`. Keyed by `connection_id`. OAuth access and refresh
 *    tokens for the customer's own social accounts.
 *
 * The first two are now EXPORTED, by name, from `export.ts`. The third never
 * will be, and that is stated below rather than left as an absence.
 *
 * ── WHY THE OMISSIONS ARE A LIST AND NOT A SENTENCE ──────────────────────────
 * An omission a customer cannot see is a lie by silence. `ai_provider_logs` is
 * already handled that way — RLS on, no policies, so PostgREST answers `[]` and
 * an export rendering it as an empty array asserts "you have no AI usage
 * records", which is false. Everything below is the same problem for a table the
 * sweep never even reaches, so it gets the same treatment: named, in the file,
 * with the reason, in words the customer can read.
 */
export interface OmittedByDesign {
  readonly table: string
  readonly describes: string
  readonly reason: string
}

export const OMITTED_BY_DESIGN: readonly OmittedByDesign[] = [
  {
    table: 'connection_secrets',
    describes: 'the access keys for your linked accounts',
    reason:
      'These are the keys that let Sahoda post on your behalf. They are encrypted, they are never shown to anyone including you, and putting them in a file you download would be the single most dangerous thing in this export. They are deleted the moment you disconnect an account or delete your workspace.',
  },
  {
    table: 'billing_webhook_events',
    describes: 'what the payment provider told us about your payments',
    reason:
      'Raw messages from the card processor. What they say about your payments is in your credit record and your invoices, which are both included. Nothing in the app can read this table.',
  },
  {
    table: 'clerk_id_map',
    describes: 'a translation table for sign-in accounts',
    reason:
      'A one-time engineering record from moving between two sign-in systems. It holds sign-in reference codes and nothing about you.',
  },
  {
    table: 'competitors · competitor_sources · competitor_snapshots · competitor_changes',
    describes: 'the businesses Radar watches, and what it saw',
    reason:
      'These describe OTHER businesses, not you, and they are shared between every customer who watches the same one. Which businesses YOU chose to watch is your data and is included, as “competitor_subscriptions”.',
  },
  {
    table: 'radar_fetch_log · radar_limits',
    describes: 'what Radar cost us to run',
    reason: 'Our own running costs and spending limits. Nothing about you is in them.',
  },
  {
    table: 'invoice_serials',
    describes: 'the invoice numbering counter',
    reason:
      'A single counter shared by every invoice we issue. Your own invoices are included in full.',
  },
  {
    table: 'ops_admins · ops_audit_log · ops_tasks · ops_qa_runs and other ops tables',
    describes: 'how Sahoda is run',
    reason:
      'Our own staff, tasks and internal records. Where an admin acted on YOUR workspace, that is recorded in “audit_logs”, which is included.',
  },
  {
    table: 'app_settings · plans · guide_tours',
    describes: 'how the product is configured',
    reason: 'The same for every customer. Nothing about you is in them.',
  },
] as const
