-- CHANNEL RETURN joins the kinds the Marketing Brain may write.
--
-- ── WHY A THIRD MIGRATION AND NOT AN EDIT ────────────────────────────────────
-- `20260825000000_marketing_observations.sql` and
-- `20260826090000_generated_body_draft_capture.sql` are BOTH applied to
-- production. An applied migration is immutable here, so the constraint is
-- replaced again rather than edited in place. This is the second time this
-- constraint has moved and it will move again: each new computer widens it, and
-- that is the intended shape — the DB refuses a kind no computer can produce.
--
-- ── WHY THIS IS SAFE TO APPLY AHEAD OF THE CODE ──────────────────────────────
-- Widening a CHECK can never invalidate a row that already satisfies the
-- narrower one, so `add constraint` validates every existing row trivially.
-- MEASURED 2026-08-26: `marketing_observations` holds 0 rows in production, so
-- the validation scan is empty and the lock is momentary.
--
-- It must land BEFORE the code that writes `channel_return`, for the same reason
-- the draft-capture column did: a write of a kind the constraint rejects is a
-- failed insert, while a constraint permitting a kind nothing writes is inert.
-- docs/55 records the ordering rule.
--
-- ── THE PAIR THIS MUST STAY IN STEP WITH ─────────────────────────────────────
-- `OBSERVATION_KINDS` in packages/shared/src/brain/observations.ts is the same
-- set in TypeScript. The two drifted apart once already: `edit_distance` existed
-- in the enum for a day while the constraint still rejected it, which would have
-- turned every edit-distance finding into a failed insert had the pass run.
-- `apps/web/src/lib/repo/check-constraints.ts` adjudicates repo literals against
-- the constraint set parsed out of these migrations, which is what catches it.

alter table public.marketing_observations
  drop constraint if exists marketing_observations_kind_check;

alter table public.marketing_observations
  add constraint marketing_observations_kind_check
  check (kind in ('tone_drift', 'edit_distance', 'channel_return'));
