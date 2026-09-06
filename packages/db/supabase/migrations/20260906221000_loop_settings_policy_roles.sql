-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop — writing the Loop's own controls is a role, not just membership
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────────
-- `20260820000200_loop_autonomy.sql` gave both control tables the plain tenant
-- policy set through `app.apply_tenant_policies`:
--
--     t_select · t_insert · t_update · t_delete   — all MEMBERSHIP-ONLY
--
-- Membership-only means every write checks `workspace_id in member_workspace_ids`
-- and nothing else. So a VIEWER — a membership role deliberately excluded from
-- owner/editor/approver everywhere money or automation is decided — could:
--
--   · pause or un-pause the Loop            (loop_settings.paused)
--   · move the weekly credit budget         (loop_settings.weekly_budget_credits)
--   · turn the Loop on by clearing pause    (an INSERT or a DELETE of the row)
--   · arm L3 autopilot for a channel        (loop_channel_autonomy.level = 3,
--                                            widened to 3 in 20260828120000)
--
-- Every other place in this schema where a member spends money or arms automation
-- names the three roles — `loop_approve_cost`, `loop_kill_switch`,
-- `resolve_memory_event` (20260820000400) and the `playbooks` policies
-- (20260822030200) all read `role in ('owner','editor','approver')`. These two
-- tables were the hole: they hold the SETTINGS a person types, so the original
-- file reasoned "there is no reason a member may not write their own settings"
-- and used the full-CRUD helper. But a viewer is a member, and arming L3 or
-- moving the budget is not "their own settings" in the sense that reasoning
-- assumed.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- SELECT stays open to every member — reading the dial and the budget is not a
-- privileged act, and the Loop screen must render them for a viewer. INSERT,
-- UPDATE and DELETE now require the writer's membership role to be in
-- ('owner','editor','approver'). The policy NAMES are kept (`t_insert`/`t_update`/
-- `t_delete`) so `rls_tenant_isolation.pglite.test.ts`'s classification — which
-- reads pg_policies by name and clause — sees the same shape it already expects,
-- and the blast radius is the policy BODY and nothing else.
--
-- ── WHY DELETE IS GATED TOO, THOUGH THE HOLE IS USUALLY DESCRIBED AS WRITE ────
-- Deleting the `loop_settings` row is `paused` returning to its `false` DEFAULT:
-- that is "turn the Loop on" by another route, so a DELETE a viewer may run is
-- the same capability as the UPDATE we are closing. `loop_channel_autonomy` is
-- the same: deleting a row drops that channel back to its default level. The
-- write gate would be a fiction if a viewer could reach the same end by DELETE.
--
-- Workspace isolation is UNTOUCHED: every clause below still requires the writer
-- to be a member of the row's own workspace, so one customer can neither read nor
-- change another's, and the role check is stacked ON TOP of that, never instead.
--
-- IF THIS IS WRONG in the loose direction: a viewer could still move the budget
-- or arm autopilot. In the tight direction: an editor cannot save a setting they
-- should be able to. Worth reading twice before applying.
--
-- REVERSIBLE: yes — re-run `app.apply_tenant_policies('loop_settings')` and the
-- same for `loop_channel_autonomy` after dropping the four policies below.
-- Nothing stored changes shape.
--
-- APPLY ORDER: after 20260820000200_loop_autonomy.sql (and harmless after
-- 20260828120000, which added columns but left these policies alone).


-- ── loop_settings ────────────────────────────────────────────────────────────
-- Keep t_select (membership-only read); replace the three write policies.
drop policy t_insert on loop_settings;
drop policy t_update on loop_settings;
drop policy t_delete on loop_settings;

create policy t_insert on loop_settings
  for insert to authenticated with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_settings.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy t_update on loop_settings
  for update to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_settings.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  ) with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_settings.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy t_delete on loop_settings
  for delete to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_settings.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );


-- ── loop_channel_autonomy ────────────────────────────────────────────────────
-- Same treatment. Arming L3 is an INSERT or an UPDATE of `level`, so both are
-- role-gated; DELETE is gated because dropping a row resets the dial to default.
drop policy t_insert on loop_channel_autonomy;
drop policy t_update on loop_channel_autonomy;
drop policy t_delete on loop_channel_autonomy;

create policy t_insert on loop_channel_autonomy
  for insert to authenticated with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_channel_autonomy.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy t_update on loop_channel_autonomy
  for update to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_channel_autonomy.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  ) with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_channel_autonomy.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy t_delete on loop_channel_autonomy
  for delete to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = loop_channel_autonomy.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );
