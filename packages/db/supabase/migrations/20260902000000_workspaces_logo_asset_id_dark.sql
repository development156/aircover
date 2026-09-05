-- ─────────────────────────────────────────────────────────────────────────────
-- A workspace may name a SECOND logo file, for dark backgrounds
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- `workspaces.logo_asset_id` (20260831090000) lets a workspace name ONE file as
-- its logo. `apps/web` (lib/studio/stamp.ts) measures the mean luminance of the
-- picture region under the mark and, when the one logo fails contrast there,
-- draws a light "plate" rectangle behind it. That is an honest substitute for a
-- variant a designer does not have; it is not what a designer would do. A
-- designer who owns a mark drawn dark-on-light and a second mark drawn
-- light-on-dark hands over BOTH, and the right one is picked per picture. There
-- is nowhere today for that second file to be named.
--
-- WHAT THIS FILE DOES. Adds `workspaces.logo_asset_id_dark`, a nullable pointer
-- at the `assets` row a customer chose as the variant of their logo meant for
-- dark backgrounds. `logo_asset_id` keeps its existing meaning unchanged: the
-- light-background variant, and the only variant at all for the workspaces (the
-- overwhelming majority) who have supplied one file. This column carries the
-- same tenancy guard, the same partial index, and the same `on delete set null`
-- as its predecessor, for the same reasons; see 20260831090000 for the reasoning
-- this file does not repeat.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. A workspace
-- with only `logo_asset_id` set is unaffected: this column is additive and
-- nothing reads it until `apps/web` is rewritten to prefer it when present,
-- which is a separate change, not this one. There is no backfill to get wrong,
-- because there is no existing convention (no title, no prior column) this
-- column could be reconstructed from: every workspace starts NULL here and stays
-- NULL until somebody uploads a second file.
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping it
-- loses only WHICH asset each workspace had chosen as its dark variant. No file
-- is lost, because the pointer never held the bytes and the assets are
-- untouched, and every workspace's single-logo behaviour is exactly what it was
-- before this file existed.
--
-- APPLY ORDER: after 20260831090000_workspaces_logo_asset_id.sql (the column
-- and the tenancy-guard pattern this one repeats) and after
-- 20260819000400_assets.sql (the `assets` table).


-- ── 1 of 4 · the column ────────────────────────────────────────────────────────
-- `on delete set null` is deliberate, for the same reason as `logo_asset_id`:
-- when an asset is hard-deleted by `delete_asset` (20260820000100, the only hard
-- delete), a workspace that pointed at it must be left with a clean NULL rather
-- than a pointer at a row that no longer exists. It must never cascade the other
-- way: deleting a file may not delete the workspace that used it.
alter table workspaces
  add column if not exists logo_asset_id_dark uuid references assets (id) on delete set null;

comment on column workspaces.logo_asset_id_dark is
  'The assets row this workspace chose as the DARK-background variant of its '
  'logo, or NULL when no second variant has been chosen. NULL is the common '
  'case: it means "one logo, or none", never "no logo exists" — `logo_asset_id` '
  'may still hold the single (light-background) variant. On a hard delete of '
  'the asset this is set to NULL by the foreign key, so it never dangles.';


-- ── 2 of 4 · the index the set-null action needs ───────────────────────────────
-- Same shape as `workspaces_logo_asset_idx`: `on delete set null` has to find
-- every workspace referencing an asset at the moment that asset is hard-deleted,
-- and without an index that lookup is a full scan of `workspaces` per delete.
-- Partial because a NULL pointer references nothing and never needs to be found
-- this way.
create index if not exists workspaces_logo_asset_dark_idx
  on workspaces (logo_asset_id_dark)
  where logo_asset_id_dark is not null;


-- ── 3 of 4 · the tenancy guard ─────────────────────────────────────────────────
-- Same reasoning as `app.workspaces_logo_same_tenant`: a composite foreign key
-- on `(logo_asset_id_dark, id) references assets (id, workspace_id)` cannot
-- express this either, because `on delete set null` would then try to null the
-- workspace's own primary key. So the cross-tenant check is a second trigger, on
-- the second column, following the first one's shape exactly.
--
-- It raises when the referenced asset's `workspace_id` is not the workspace's
-- own `id`. A NULL pointer passes untouched: choosing no dark variant is always
-- allowed.
create or replace function app.workspaces_logo_dark_same_tenant() returns trigger
language plpgsql as $$
declare
  v_owner uuid;
begin
  if new.logo_asset_id_dark is null then
    return new;
  end if;

  select a.workspace_id into v_owner
    from assets a
   where a.id = new.logo_asset_id_dark;

  if v_owner is distinct from new.id then
    raise exception
      'logo_asset_id_dark % does not belong to workspace %', new.logo_asset_id_dark, new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger workspaces_logo_dark_same_tenant
  before insert or update of logo_asset_id_dark on workspaces
  for each row execute function app.workspaces_logo_dark_same_tenant();


-- ── 4 of 4 · no backfill ────────────────────────────────────────────────────────
-- Unlike `logo_asset_id`, there is nothing to reproduce here. The predecessor
-- column's backfill re-derived today's read (the newest asset titled `Logo`)
-- because that title convention already existed and encoded a real choice. No
-- workspace has ever been asked for a dark-background variant before this
-- column, so there is no prior signal to read, and every row starts and stays
-- NULL until a customer uploads one through the upload doors this ships with.


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   drop trigger if exists workspaces_logo_dark_same_tenant on workspaces;
--   drop function if exists app.workspaces_logo_dark_same_tenant();
--   drop index if exists workspaces_logo_asset_dark_idx;
--   alter table workspaces drop column if exists logo_asset_id_dark;
--
-- Dropping this loses only WHICH asset each workspace had chosen as its dark
-- variant. No file is lost: the pointer never held bytes, the `assets` rows are
-- untouched, and every workspace's single-logo behaviour (`logo_asset_id`,
-- unaffected by this file) keeps working exactly as it does today.
