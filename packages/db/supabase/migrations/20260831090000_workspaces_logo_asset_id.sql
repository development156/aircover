-- ─────────────────────────────────────────────────────────────────────────────
-- The workspace logo becomes a real column, not a title match
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- A workspace has no way to say which file is its logo. `readBrandLogo` in
-- apps/web (lib/brand/logo.ts) finds "the logo" by selecting the NEWEST `assets`
-- row where `workspace_id` matches, `kind = 'image'`, `title = 'Logo'` and
-- `deleted_at is null`. Its own header calls that a known compromise: a customer
-- who titles some other picture `Logo` by hand would see it in the topbar, and
-- the invariant "exactly one asset is titled Logo" is kept only by `setBrandLogo`
-- (apps/web/src/app/actions/brand-logo.ts) demoting the others to
-- `Logo (previous)`. The header names the fix out loud: "When a
-- `workspaces.logo_asset_id` exists, this function is the one place that
-- changes." This file is that column.
--
-- WHAT THIS FILE DOES. Adds `workspaces.logo_asset_id`, a nullable pointer at the
-- `assets` row a customer chose as their logo. It carries a tenancy guard so the
-- pointer can only name a file in the SAME workspace, a partial index so a
-- hard-deleted asset can find the workspaces pointing at it, and a backfill that
-- reproduces today's read exactly so nobody's topbar changes on apply.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. `readBrandLogo`
-- still reads by title until it is rewritten to prefer this column, and that
-- rewrite is a separate change in apps/web, not here. The column is new and
-- nothing reads it yet, so a wrong backfill is invisible until then and is
-- corrected by re-running the same statement.
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping it
-- loses only WHICH asset each workspace had chosen. No file is lost, because the
-- pointer never held the bytes and the assets are untouched.
--
-- APPLY ORDER: after 20260819000400_assets.sql (the `assets` table) and
-- 20260827090000_assets_trash.sql (the `deleted_at` column the backfill reads).


-- ── 1 of 4 · the column ────────────────────────────────────────────────────────
-- `on delete set null` is deliberate. When an asset is hard-deleted by
-- `delete_asset` (20260820000100, the only hard delete), a workspace that pointed
-- at it must be left with a clean NULL rather than a pointer at a row that no
-- longer exists. It must never cascade the other way: deleting a file may not
-- delete the workspace that used it as a logo.
alter table workspaces
  add column if not exists logo_asset_id uuid references assets (id) on delete set null;

comment on column workspaces.logo_asset_id is
  'The assets row this workspace chose as its logo, or NULL when no logo has been '
  'chosen. NULL means "not chosen", never "no logo exists": the library may still '
  'hold images. On a hard delete of the asset this is set to NULL by the foreign '
  'key, so it never dangles.';


-- ── 2 of 4 · the index the set-null action needs ───────────────────────────────
-- `on delete set null` has to find every workspace referencing an asset at the
-- moment that asset is hard-deleted. Without an index that lookup is a full scan
-- of `workspaces` per delete. Partial because a NULL pointer references nothing
-- and never needs to be found this way.
create index if not exists workspaces_logo_asset_idx
  on workspaces (logo_asset_id)
  where logo_asset_id is not null;


-- ── 3 of 4 · the tenancy guard ─────────────────────────────────────────────────
-- The plain foreign key above proves the asset EXISTS. It cannot prove the asset
-- belongs to THIS workspace, and a composite foreign key on
-- `(logo_asset_id, id) references assets (id, workspace_id)` cannot express it
-- either: `on delete set null` would then try to null the workspace's own primary
-- key, which is impossible. So the cross-tenant check is a trigger.
--
-- It raises when the referenced asset's `workspace_id` is not the workspace's own
-- `id`. A NULL pointer passes untouched: choosing no logo is always allowed.
create or replace function app.workspaces_logo_same_tenant() returns trigger
language plpgsql as $$
declare
  v_owner uuid;
begin
  if new.logo_asset_id is null then
    return new;
  end if;

  select a.workspace_id into v_owner
    from assets a
   where a.id = new.logo_asset_id;

  if v_owner is distinct from new.id then
    raise exception
      'logo_asset_id % does not belong to workspace %', new.logo_asset_id, new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger workspaces_logo_same_tenant
  before insert or update of logo_asset_id on workspaces
  for each row execute function app.workspaces_logo_same_tenant();


-- ── 4 of 4 · the backfill ──────────────────────────────────────────────────────
-- Reproduce today's read exactly, so applying this file changes no topbar. For
-- every workspace whose pointer is still NULL, set it to the newest non-deleted
-- `kind = 'image'` asset in that workspace titled exactly `Logo`, newest by
-- `created_at`. This is `readBrandLogo`'s SELECT, one row per workspace.
-- Workspaces with no such asset stay NULL, which is the honest answer: no logo
-- has been chosen.
-- A correlated scalar subquery, not `from lateral`: the UPDATE target table is
-- not in the FROM list, so a lateral join cannot reference `w` (Postgres 42P10).
update workspaces w
   set logo_asset_id = (
     select a.id
       from assets a
      where a.workspace_id = w.id
        and a.kind = 'image'
        and a.title = 'Logo'
        and a.deleted_at is null
      order by a.created_at desc
      limit 1
   )
 where w.logo_asset_id is null;


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   drop trigger if exists workspaces_logo_same_tenant on workspaces;
--   drop function if exists app.workspaces_logo_same_tenant();
--   drop index if exists workspaces_logo_asset_idx;
--   alter table workspaces drop column if exists logo_asset_id;
--
-- Dropping this loses only WHICH asset each workspace had chosen as its logo. No
-- file is lost: the pointer never held bytes, the `assets` rows are untouched, and
-- `readBrandLogo`'s title match still finds a logo without it.
