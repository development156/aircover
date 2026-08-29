-- loop_cycles.reflect_reason — WHY a cycle produced no learning, in a column ---
--
-- ── THE STATE THIS EXISTS FOR ────────────────────────────────────────────────
-- Reflect distinguishes six outcomes: no_history, too_few_posts, single_group,
-- too_few_days, numbers_too_small, difference_too_small. Exactly ONE of them
-- reached storage — `reflect_skipped_no_history`, a boolean — so every other
-- way of having nothing to say arrived at the screen as the same silence.
--
-- The /loop page therefore told a workspace with six measured posts across one
-- afternoon that Sahoda "read last week's numbers before planning", which is
-- true, and said nothing about why no learning came of it. "We had no history",
-- "we had history and too little of it" and "we compared and the gap was inside
-- the noise" are three different sentences and this product keeps such pairs
-- apart on purpose.
--
-- ── WHY A TEXT COLUMN RATHER THAN A SECOND BOOLEAN ───────────────────────────
-- The first one is how this got here. A boolean per reason is six columns that
-- can contradict each other; the reason is one value and is stored as one.
--
-- ── NULLABLE, AND NOT BACKFILLED ─────────────────────────────────────────────
-- Null means "this cycle ran before the reason was recorded", which is the
-- truth for every existing row. Backfilling from `reflect_skipped_no_history`
-- would invent a reason for cycles whose reason nobody measured — and the
-- screen must be able to tell "no reason recorded" from "we recorded that there
-- was nothing to learn from".
--
-- No CHECK constraint on the value. The set is owned by
-- apps/web/src/lib/loop/reflect.ts and a constraint here would mean a seventh
-- reason cannot be added without a migration, which is how a product decision
-- becomes a schema migration for no gain. The column is written by one function.
--
-- IF THIS IS WRONG: the /loop cycle summary falls back to the sentence it used
-- before. `setCycleStatus` writes this column through a fallback that retries
-- without it on 42703, so an unapplied migration costs the sentence and never
-- the cycle.
alter table loop_cycles add column if not exists reflect_reason text;

comment on column loop_cycles.reflect_reason is
  'Why Reflect produced no learning for this cycle, or null when it produced one (or predates the column). Values come from NoLearningReason in apps/web/src/lib/loop/reflect.ts.';
