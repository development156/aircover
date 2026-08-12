-- ─────────────────────────────────────────────────────────────────────────────
-- ai_provider_logs.repaired — make a repair visible.
--
-- A first attempt that fails its schema and is rescued by the runner's one
-- repair retry is a DEFECT that costs a second call: the retry resends every
-- original message, so the call bills roughly twice. Today it logs
-- `status: 'ok'`, indistinguishable from a clean run. Measured on 2026-08-12,
-- `brand_extract` was repairing on 83% of calls, entirely unrecorded.
--
-- A BOOLEAN, NOT A WIDER STATUS ENUM — deliberately, though both were on the
-- table:
--   · `status` answers "did the call ultimately succeed?" ('ok' | 'error' |
--     'fallback'). Adding 'repaired' would make that question unanswerable for
--     repaired calls: a repair that SUCCEEDED and one that then failed would
--     both be 'repaired', and the success/failure axis would be lost.
--   · Repair is orthogonal to outcome. A call can be ok-and-repaired,
--     error-and-repaired, or fallback-and-repaired. Only a separate column can
--     say all three.
--   · Widening the CHECK would also silently reclassify nothing while breaking
--     every consumer that switches exhaustively on the three known values.
--
-- NOT BACKFILLED. Rows written before the marking shipped carry no signal at
-- all, so `false` on them means "not measured", not "ran clean". Backfilling
-- them from anything would be inventing history; the column starts telling the
-- truth from here forward and the comment says exactly that.
-- ─────────────────────────────────────────────────────────────────────────────

alter table ai_provider_logs
  add column if not exists repaired boolean not null default false;

comment on column ai_provider_logs.repaired is
  'TRUE when the first attempt failed its schema and the single repair retry was '
  'used — the call billed roughly twice. Orthogonal to `status`, which still '
  'reports the final outcome. Rows created before 2026-08-12 read FALSE because '
  'the signal did not exist yet, NOT because they ran clean.';

-- The whole point is asking "what fraction of calls repair, by task?" — a
-- partial index keeps that cheap without paying for the majority-false rows.
create index if not exists ai_provider_logs_repaired_idx
  on ai_provider_logs (task, created_at desc)
  where repaired;
