-- ─────────────────────────────────────────────────────────────────────────────
-- Reprice the plan catalog from the business model deck (2026-08-24).
--
-- WHY A MIGRATION AND NOT AN EDIT TO THE SEED. `20260718000010_seed.sql` is
-- applied. Editing it changes what a FRESH database gets while leaving production
-- on the old numbers, which is the worst of both: the two would disagree and
-- nothing would say so. The seed stays as the historical record of what shipped in
-- July; this file is what moved.
--
-- WHAT CHANGED, and the shape of it matters more than any single figure:
--
--   plan     price_inr        price_usd     monthly_credits   channels
--   starter    499 → 1,999      12 → 25       1,500 (same)      4 (same)
--   growth   1,499 → 3,999      29 → 49       5,000 → 4,000     8 (same)
--   agency   3,999 → 7,999      79 → 99      15,000 → 12,000    8 → 12
--
-- The allowances went DOWN while the prices went UP. This is a reprice, not an
-- increase, and it is the reason this file updates `monthly_credits` at all.
--
-- `agency` KEEPS ITS ID and changes only its display name to 'Studio'. The id is
-- the foreign key on every row in `subscriptions`, so renaming it would be a
-- rewrite of live money rows to achieve a label change. Customers read `name`.
--
-- `free` IS DELIBERATELY UNTOUCHED. It is not merely the cheapest tier — it is the
-- entitlement floor: `entitlements/pg.ts` resolves a workspace with no live
-- subscription to 'free', and `lifecycle.ts` falls back to it once suspended.
-- Repricing or removing it would change what an unsubscribed and a suspended
-- workspace may do, which is an access-control change wearing a pricing costume.
--
-- WHAT THIS FILE DOES NOT DO, stated so nobody reads more into it:
--   · It does not touch any `subscriptions` row. Every existing customer stays on
--     the price their subscription was created at until their provider subscription
--     is itself changed. This migration does not reprice anyone retroactively.
--   · It does not create or update a Stripe or Cashfree price object. Those live at
--     the provider, keyed by ids like STRIPE_STARTER_PRICE_ID, and a database row
--     cannot move them. Until those are updated, checkout charges the OLD amount
--     while the UI quotes the new one.
--   · It does not decide GST treatment. The deck says these prices are inclusive;
--     `GstSupplierConfig.priceIncludesTax` is what actually decides it, and gst.ts
--     is explicit that this is a tax opinion, not arithmetic.
--
-- `price_usd` IS WRITTEN HERE BUT IS DEAD. The catalog no longer carries a dollar
-- price: a customer outside India now sees a LIVE approximation of the rupee
-- charge (packages/shared/src/billing/currency.ts), because the old stored figure
-- was a second hand-set price that drifted 17 to 19 percent from what the rupee
-- price actually converted to. The column stays because it is `not null` on a
-- live table and dropping a column is irreversible; it is set here only so the
-- row is not left carrying the superseded 12/29/79. Nothing reads it. If it is
-- ever dropped, that is its own migration and its own decision.
--
-- Mirrors PLAN_CATALOG in packages/shared/src/billing/plans.ts. The two are checked
-- against each other by plans-seed-parity.test.ts, which reads THIS file.
-- ─────────────────────────────────────────────────────────────────────────────

update plans set price_inr = 1999, price_usd = 25, monthly_credits = 1500,
  limits = '{"channels":4,"sites":1,"seats":1,"loopLevel":2,"twinSize":25}'::jsonb
  where id = 'starter';

update plans set price_inr = 3999, price_usd = 49, monthly_credits = 4000,
  limits = '{"channels":8,"sites":3,"seats":3,"loopLevel":3,"twinSize":100}'::jsonb
  where id = 'growth';

update plans set name = 'Studio', price_inr = 7999, price_usd = 99, monthly_credits = 12000,
  limits = '{"channels":12,"sites":10,"seats":10,"loopLevel":3,"twinSize":100}'::jsonb
  where id = 'agency';

-- Fail loudly rather than leaving the catalog half-repriced. An `update` that
-- matched no row is not an error in Postgres, so without this a typo'd id would
-- report success having changed nothing — the exact silent-pass this repository
-- has been bitten by elsewhere.
do $$
declare
  repriced int;
begin
  select count(*) into repriced from plans
   where (id = 'starter' and price_inr = 1999 and monthly_credits = 1500)
      or (id = 'growth'  and price_inr = 3999 and monthly_credits = 4000)
      or (id = 'agency'  and price_inr = 7999 and monthly_credits = 12000 and name = 'Studio');

  if repriced <> 3 then
    raise exception 'reprice touched % of 3 plan rows; catalog is inconsistent', repriced;
  end if;
end $$;
