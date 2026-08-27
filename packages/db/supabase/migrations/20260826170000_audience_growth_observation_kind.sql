-- AUDIENCE GROWTH joins the kinds the Marketing Brain may write.
--
-- The fourth widening of this constraint and the second today. That cadence is
-- the intended shape, not churn: the DB refuses any kind no computer can
-- produce, so every new computer costs one migration. `20260825000000`,
-- `20260826090000` and `20260826160000` are all applied to production and are
-- therefore immutable; the constraint is replaced rather than edited.
--
-- ── SAFE TO APPLY AHEAD OF THE CODE ──────────────────────────────────────────
-- Widening a CHECK cannot invalidate a row that satisfied the narrower one, so
-- `add constraint` validates existing rows trivially. MEASURED 2026-08-26:
-- `marketing_observations` holds 0 rows in production.
--
-- ── THIS KIND IS THE FIRST WHOSE RECEIPT IS NOT A LIST OF POSTS ──────────────
-- It counts followers. The evidence CHECK installed by 20260825000000 still
-- holds without change, because it requires the `postIds` KEY to be present
-- rather than non-empty, and `audience_growth` stores `"postIds": []`. The rule
-- that an audience-basis row must carry an EMPTY list lives in
-- `packages/shared/src/brain/observations.ts` as a row-level refinement, because
-- it needs the kind to decide and a CHECK constraint on one column cannot see
-- another. Citing posts on a follower claim would imply those posts caused the
-- change, which nothing measured.

alter table public.marketing_observations
  drop constraint if exists marketing_observations_kind_check;

alter table public.marketing_observations
  add constraint marketing_observations_kind_check
  check (kind in ('tone_drift', 'edit_distance', 'channel_return', 'audience_growth'));
