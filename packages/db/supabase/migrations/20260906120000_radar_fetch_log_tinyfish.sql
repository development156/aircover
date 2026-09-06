-- ─────────────────────────────────────────────────────────────────────────────
-- radar_fetch_log.provider — 'tinyfish' joins the list; 'zyte' stays for history
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 2026-09-06, founder's ruling: TinyFish Fetch replaces Zyte as the rendered
-- rung of Radar's website ladder (apps/jobs/src/radar/providers/tinyfish.ts).
-- The runner writes `provider = 'tinyfish'` on every render from this deploy
-- on, and the column's CHECK refused the word.
--
-- WIDENED, NOT REPLACED. Rows already written say 'zyte' and are the record of
-- what was reserved and spent on those nights; a CHECK that no longer admits
-- the value would make the table's own history un-updatable. Nothing new is
-- ever written as 'zyte' again: the TypeScript union on both sides of the
-- write (radar/spend.ts, radar/db.ts) no longer carries it.
--
-- Dropping and re-adding under the same name is the only way to change a
-- CHECK in Postgres; the two statements run in one transaction, so there is
-- no window in which the column is unchecked.
alter table radar_fetch_log drop constraint if exists radar_fetch_log_provider_check;
alter table radar_fetch_log
  add constraint radar_fetch_log_provider_check
  check (provider in ('direct', 'zyte', 'apify', 'tinyfish'));
