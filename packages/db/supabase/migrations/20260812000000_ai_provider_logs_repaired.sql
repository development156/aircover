-- ─────────────────────────────────────────────────────────────────────────────
-- RECONSTRUCTED FILE. Not the original bytes.
--
-- This migration was APPLIED to production on 2026-08-12 and RECORDED in
-- `supabase_migrations.schema_migrations`, but its file was lost in the August
-- history squash. Every PGlite suite in this repo builds its schema from this
-- directory, so while the file was missing those suites ran against a schema
-- production did not have — which is how a column can be "applied and nothing
-- set it" with a green test run either side of it.
--
-- Regenerated from the recorded statements by:
--   node packages/db/scripts/recover-lost-migration.mjs 20260812000000
--
-- The statements below are the exact text production executed, in order. What
-- is NOT recovered: anything that sat BETWEEN two statements — a standalone
-- comment, the blank-line shaping — because the CLI splits on statements before
-- recording them. Leading comments survive as part of their statement.
--
-- DO NOT re-run this against production. It is already applied; this file exists
-- so the local schema matches, not to change anything.
-- ─────────────────────────────────────────────────────────────────────────────

alter table ai_provider_logs
  add column if not exists repaired boolean not null default false;

comment on column ai_provider_logs.repaired is
  'TRUE when the first attempt failed its schema and the single repair retry was used — the call billed roughly twice. Orthogonal to `status`, which still reports the final outcome. Rows created before 2026-08-12 read FALSE because the signal did not exist yet, NOT because they ran clean.';

create index if not exists ai_provider_logs_repaired_idx
  on ai_provider_logs (task, created_at desc)
  where repaired;
