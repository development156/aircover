-- The inbox list's own index.
--
-- `lib/inbox/store-read.ts` lists a workspace's threads filtered by `kind`
-- (dm / comment / review) and ordered by `posted_at desc`. The two indexes the
-- foundations migration created lead with `status` or end with `kind`, so
-- neither is a prefix match: Postgres scans the workspace's partition and
-- sorts. Trivial at today's row counts, a sort on every /inbox load later.
-- Audit 2026-09-06 (IL-16).
create index if not exists inbox_threads_list_idx
  on inbox_threads (workspace_id, kind, posted_at desc);
