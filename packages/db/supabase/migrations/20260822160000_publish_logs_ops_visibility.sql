-- ─────────────────────────────────────────────────────────────────────────────
-- The dead letters were always there. Nobody could see them.
--
-- MEASURED against production 2026-08-22: `post_publish_logs` holds 7 FAILED
-- publishes (6 live, 1 fixture) and carries exactly ONE select policy —
--
--   t_select  SELECT  authenticated  workspace_id IN (app.member_workspace_ids())
--
-- so the only person who can read a failure is a member of the workspace it
-- happened in. An ops admin sees nothing, in any tenant. That is why the
-- dead-letter view could be built and never shown: there was no row to render
-- and no service-role client in apps/web to fetch one with (correctly — apps/web
-- must never gain one).
--
-- Every ops_* table already solves this the same way, with an `app.is_ops_admin()`
-- policy. This gives the failure record the same treatment.
--
-- ── WHY THIS WIDENS NOTHING FOR A TENANT ─────────────────────────────────────
-- Permissive policies are OR-ed. Adding a second SELECT policy can only ever add
-- rows for callers it matches, and `app.is_ops_admin()` is false for every caller
-- who is not an active row in `ops_admins`. A member's view is byte-identical
-- before and after.
--
-- `app.is_ops_admin()` is SECURITY DEFINER over `ops_admins`, and its own table
-- is gated by the same function — so the ability to see any row of ops_admins is
-- itself the proof. A revoked seat evaluates false on the next statement.
--
-- ── WHAT IS DELIBERATELY NOT WIDENED ─────────────────────────────────────────
-- `workspaces` keeps its member-only policy, so the admin view names a tenant by
-- UUID and not by name. Letting operators read every workspace row is a real
-- privacy decision and belongs to the founder, not to a dead-letter screen.
-- ─────────────────────────────────────────────────────────────────────────────

create policy ops_select on public.post_publish_logs
  for select
  to authenticated
  using (app.is_ops_admin());
