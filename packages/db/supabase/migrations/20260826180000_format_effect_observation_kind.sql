-- FORMAT EFFECT joins the kinds the Marketing Brain may write.
--
-- Fifth widening, third today. The cadence is the design: the DB refuses any
-- kind no computer can produce, so each new computer costs one migration. Every
-- earlier migration in this chain is applied to production and therefore
-- immutable, so the constraint is replaced rather than edited.
--
-- Widening a CHECK cannot invalidate a row that satisfied the narrower one.
-- MEASURED 2026-08-26: `marketing_observations` holds 0 rows in production, so
-- the validation scan is empty. Safe to apply ahead of the code, and it must be:
-- a write of a kind the constraint rejects is a failed insert, while a
-- constraint permitting a kind nothing writes is inert.

alter table public.marketing_observations
  drop constraint if exists marketing_observations_kind_check;

alter table public.marketing_observations
  add constraint marketing_observations_kind_check
  check (kind in ('tone_drift', 'edit_distance', 'channel_return', 'audience_growth', 'format_effect'));
