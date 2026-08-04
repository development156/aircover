-- ─────────────────────────────────────────────────────────────────────────────
-- Widen the billing provider vocabulary (additive freeze amendment).
--   + 'cashfree' — India payment rail (CASHFREE_* configured).
--   + 'fixture'  — sandbox/test webhook + subscription events, always labelled.
--
-- Mirrors BillingProviderSchema in @sahoda/shared. Purely additive: the allowed
-- set only grows, so no existing subscriptions / billing_webhook_events row can
-- violate the new CHECK — safe to swap the constraint in place.
--
-- The provider CHECKs in 20260718000006_billing_ledger.sql are inline (auto-named
-- <table>_provider_check); those exact names were verified against the live schema.
-- Never edit an applied migration — this new one drops and re-adds each CHECK with
-- the wider set. Both ALTERs run in one transaction, so the swap is atomic.
-- ─────────────────────────────────────────────────────────────────────────────

alter table subscriptions
  drop constraint subscriptions_provider_check,
  add constraint subscriptions_provider_check
    check (provider in ('stripe', 'razorpay', 'cashfree', 'fixture'));

alter table billing_webhook_events
  drop constraint billing_webhook_events_provider_check,
  add constraint billing_webhook_events_provider_check
    check (provider in ('stripe', 'razorpay', 'cashfree', 'fixture'));
