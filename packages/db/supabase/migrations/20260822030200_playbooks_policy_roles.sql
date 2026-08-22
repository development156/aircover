-- ─────────────────────────────────────────────────────────────────────────────
-- M10 · PLAYBOOKS — the three `playbooks` policies name a role
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT, AND WHAT FOUND IT ───────────────────────────────────────────
-- 20260822030000 wrote the `playbooks` policies by hand, because that table
-- needs INSERT and UPDATE and `app.apply_tenant_read_policy` only grants SELECT.
-- Copying its shape but not its `to authenticated` clause left all three
-- defaulting to PUBLIC.
--
-- Found by `rls_tenant_isolation.pglite.test.ts`, which builds its table list
-- from `information_schema` and therefore picked up these tables the moment they
-- existed. It classifies a tenant table by asking pg_policies which ones have a
-- SELECT policy naming `authenticated`, and reported:
--
--     RLS on and no member SELECT policy:
--       expected [ 'ai_provider_logs', 'playbooks' ] to deeply equal [ 'ai_provider_logs' ]
--
-- ── WHY IT MATTERED LESS THAN IT LOOKS, AND STILL MATTERS ───────────────────
-- A PUBLIC policy also applies to `authenticated`, so members could always read
-- their own rows, and the policy body requires `auth.jwt() ->> 'sub'` to match a
-- membership — which is null for `anon` — so an unauthenticated caller saw
-- nothing either way. It was not a data leak, and the production RLS check run
-- against these tables passed on every count.
--
-- What it WAS is a table that had silently opted out of the classification the
-- rest of this schema is held to. The guard would have gone on reporting
-- `playbooks` as service-only — a table nobody may read — and the next person to
-- widen a policy here would have had no baseline to widen from. A rule that
-- classifies by intent has to be told the intent.
--
-- IF THIS FILE IS WRONG: members cannot read or write their own playbook
-- enrolments. Nothing else is touched — the two run tables use the helper and
-- are not mentioned here.
--
-- REVERSIBLE: yes, re-create the three policies without the `to authenticated`
-- clause. Nothing stored changes shape.
--
-- APPLY ORDER: after 20260822030000_playbooks.sql.

drop policy playbooks_select on playbooks;
drop policy playbooks_insert on playbooks;
drop policy playbooks_update on playbooks;

create policy playbooks_select on playbooks
  for select to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
    )
  );

-- Still no DELETE policy, and still on purpose: switching a playbook off is
-- `enabled = false`, and deleting the row would cascade its run history away.
create policy playbooks_insert on playbooks
  for insert to authenticated with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy playbooks_update on playbooks
  for update to authenticated using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );
