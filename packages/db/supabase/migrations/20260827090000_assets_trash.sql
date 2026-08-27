-- ── A DELETE YOU CAN TAKE BACK ────────────────────────────────────────────────
-- Until now `deleteAsset` removed the row and then removed the bytes, in that
-- order, and there was no way back from either. A person who mis-clicked on the
-- wrong tile lost the photo.
--
-- One nullable column does it. `deleted_at is null` is the live library;
-- `deleted_at is not null` is the trash. The bytes are untouched either way,
-- which is the entire reason restore can exist: no transaction can un-delete an
-- object in a bucket, so the only recoverable delete is one that never reached
-- storage.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
-- There is NO retention period and no auto-purge. Nothing in this repository
-- runs on a schedule against this table, so a column called `purge_after` or a
-- sentence promising "deleted in 30 days" would be a claim no process could
-- honour. Files stay in the trash until a person empties it, and the screen says
-- exactly that. If a sweeper is built later it gets its own migration and its
-- own sentence.
--
-- `delete_asset` (20260820000100) is UNCHANGED and is still the only hard
-- delete. Trash is a hide; "Delete for good" is that RPC, and it still runs the
-- full usage gate at the moment it is called rather than trusting a decision
-- taken whenever the file was trashed.
--
-- ROLLBACK
--   drop index if exists assets_trashed_idx;
--   drop index if exists assets_live_idx;
--   alter table assets drop column if exists deleted_at;
-- Dropping the column loses which files were in the trash; it does not lose a
-- single file, because trashing never removed anything.

alter table assets add column if not exists deleted_at timestamptz;

comment on column assets.deleted_at is
  'When a person moved this file to the trash. NULL = in the live library. '
  'The bytes in storage are untouched either way — that is what makes restore '
  'possible. There is no retention period: nothing sweeps this column, so no '
  'copy anywhere may promise one.';

-- The library list, which is `workspace_id` + newest-first + a cap of 200. The
-- partial predicate matters as much as the columns: without it every list read
-- would scan trashed rows it then throws away.
create index if not exists assets_live_idx
  on assets (workspace_id, created_at desc)
  where deleted_at is null;

-- The trash list, ordered by when it was trashed rather than when it was made —
-- "what did I just delete" is the only question this view answers.
create index if not exists assets_trashed_idx
  on assets (workspace_id, deleted_at desc)
  where deleted_at is not null;
