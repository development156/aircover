-- Indexes on foreign-key columns that had none.
--
-- Postgres does not index the referencing side of a foreign key. Every ON DELETE
-- SET NULL / CASCADE on the parent therefore sequentially scans the child table
-- to find the rows it must touch, holding the parent row lock for the duration.
-- MEASURED 2026-09-05 (audit, wt-core): these seven columns are declared as
-- foreign keys and appear in no `create index` across all 103 migrations.
--
-- `remix_derivatives` and `competitor_changes` accumulate continuously, so a
-- post delete (planner, remix) and a Radar snapshot prune both get slower every
-- week without these. Plain `create index` (not CONCURRENTLY) on purpose: this
-- file runs inside the migration transaction like every sibling, and the
-- tables are small enough today that the lock is momentary.

create index if not exists planner_events_post_id_idx on public.planner_events (post_id);
create index if not exists remix_batches_source_post_id_idx on public.remix_batches (source_post_id);
create index if not exists remix_derivatives_post_id_idx on public.remix_derivatives (post_id);
create index if not exists competitor_changes_from_snapshot_id_idx on public.competitor_changes (from_snapshot_id);
create index if not exists competitor_changes_to_snapshot_id_idx on public.competitor_changes (to_snapshot_id);
create index if not exists loop_autopilot_log_brief_id_idx on public.loop_autopilot_log (brief_id);
create index if not exists loop_autopilot_log_cycle_id_idx on public.loop_autopilot_log (cycle_id);
