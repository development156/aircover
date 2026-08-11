-- ─────────────────────────────────────────────────────────────────────────────
-- Publish `posts` and `post_variants` for Realtime.
--
-- Requested by the wt-realtime lane (apps/web/REQUESTS.md, on branch wt-realtime
-- as of commit 0997996 — NOT yet on wt-web, so a reader of the mainline file
-- will not find it). Posts and planner surfaces learn nothing about a publish
-- until the user reloads: a scheduled post moves
-- draft → scheduled → publishing → published entirely server-side, on a
-- five-minute cron, and nothing notifies the browser at any point.
--
-- That lane shipped a bounded poll of our own Postgres as a fallback. This is
-- the mechanism it was a fallback FOR.
--
-- ── WHY THIS IS GUARDED TWICE ────────────────────────────────────────────────
-- `20260725102928_ops_platform_tables.sql:314-320` guards only that the
-- publication EXISTS, which is right for a project that has never enabled
-- Realtime. It is not enough here. `alter publication ... add table` raises
-- `duplicate_object` when the table is already a member, and membership can have
-- been set from the dashboard's Publications toggle — a click that leaves no
-- trace in this directory. Adding an already-published table would then abort
-- the migration and, worse, do it only on the environments where someone had
-- clicked, which is precisely the schema-vs-history drift that
-- `20260801000000_rls_auto_enable.sql` exists to record.
--
-- So: guard the publication, then guard each table independently.
--
-- ── DEFAULT REPLICA IDENTITY, DELIBERATELY ───────────────────────────────────
-- Not `full`. The subscriber needs only the NEW row state (status, scheduled_at,
-- publish_status, permalink, platform_post_id); it never compares against the
-- old values. `full` would put every column of every UPDATE into the WAL for no
-- reader, and on DELETE it would widen what escapes the RLS hole below from a
-- primary key to the whole row.
--
-- ── RLS: WHAT THIS DOES AND DOES NOT BUY ─────────────────────────────────────
-- Both tables carry `app.apply_tenant_policies` (`20260718000004_content.sql`
-- :102-103), so RLS is enabled and `t_select` reads
--   for select TO authenticated using (workspace_id in (select app.member_workspace_ids()))
-- Realtime evaluates that policy PER SUBSCRIBER for INSERT and UPDATE events, so
-- those are correctly scoped to the member's own workspaces. `TO authenticated`
-- also means it fails CLOSED: a socket that never called `setAuth` is `anon`,
-- matches no policy, and receives nothing.
--
-- DELETE IS THE EXCEPTION, AND IT IS NOT CLOSEABLE FROM HERE. Postgres cannot
-- evaluate a policy against a row that no longer exists, so Realtime does not
-- apply RLS to DELETE at all, and delete events cannot be filtered. Under the
-- default replica identity kept above, the escaping payload is the PRIMARY KEY
-- only — a post UUID, with no content and no `workspace_id` — but it is still a
-- signal a member of another workspace has no business receiving, and `posts`
-- really does get deleted (the list has a delete control).
--
-- The subscriber must therefore listen for 'UPDATE' (and 'INSERT' if it wants
-- new rows), NEVER '*', because '*' includes DELETE. Publish state has no use
-- for deletions. That obligation lives with the client and cannot be enforced by
-- this migration — it is written here so the next reader of this file meets it.
--
-- ── NOT CHANGED, ON PURPOSE ──────────────────────────────────────────────────
-- The publication's `publish` option. It is a PUBLICATION-level setting, not a
-- per-table one, so restricting it to 'insert,update' to close the DELETE hole
-- would also silence deletes for `ops_tasks`, `ops_changelog`, `ops_qa_runs` and
-- `ops_sessions` — the admin dashboard's live board, which this lane does not
-- own and has not tested. A per-table column list is available in PG15+ and
-- would keep draft text out of the payload entirely; it is deliberately left as
-- a follow-up rather than bundled into a migration whose ask was two lines.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  -- A project without Realtime enabled has no such publication. Skipping is
  -- correct there: the tables simply are not published, which is the state the
  -- app already copes with.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication absent; posts/post_variants not published';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_variants'
  ) then
    alter publication supabase_realtime add table public.post_variants;
  end if;
end $$;
