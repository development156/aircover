-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 01 · extensions + shared helpers
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- Security-definer internals live in a schema NOT exposed to PostgREST, so none
-- of these functions are reachable as /rest/v1/rpc from a client.
create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- updated_at maintenance -------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Append-only guard: blocks direct UPDATE/DELETE (even by service_role), but
-- allows cascaded deletes (trigger depth > 1) so a workspace can still be offboarded.
create or replace function app.block_mutations() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- Standard tenant RLS policy set (membership via the definer helper). Full CRUD.
create or replace function app.apply_tenant_policies(tbl text) returns void
language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format(
    'create policy t_select on %I for select to authenticated '
    'using (workspace_id in (select app.member_workspace_ids()))', tbl);
  execute format(
    'create policy t_insert on %I for insert to authenticated '
    'with check (workspace_id in (select app.member_workspace_ids()))', tbl);
  execute format(
    'create policy t_update on %I for update to authenticated '
    'using (workspace_id in (select app.member_workspace_ids())) '
    'with check (workspace_id in (select app.member_workspace_ids()))', tbl);
  execute format(
    'create policy t_delete on %I for delete to authenticated '
    'using (workspace_id in (select app.member_workspace_ids()))', tbl);
end;
$$;

-- Tenant read-only: members SELECT rows of their workspaces; all writes server-side.
create or replace function app.apply_tenant_read_policy(tbl text) returns void
language plpgsql as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format(
    'create policy t_select on %I for select to authenticated '
    'using (workspace_id in (select app.member_workspace_ids()))', tbl);
end;
$$;
