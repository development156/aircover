-- ─────────────────────────────────────────────────────────────────────────────
-- A7 · folders — the ones a person makes, names, nests, and files photos into
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY. `apps/web/src/lib/assets/folders.ts` records a ruling
-- from 25 August: named folders were refused because no column could answer them,
-- so three DERIVED folders were built out of predicates instead. That ruling was
-- correct and it is not being reversed. What changes is that the column now
-- exists, which is the condition that ruling named for revisiting it.
--
-- WHAT THIS FILE DOES. Three tables. `asset_folders` is the tree a person builds
-- and renames and drags things around in. `asset_folder_items` is the membership:
-- one row means "this file is filed in this folder", and a file may sit in MANY
-- folders at once. `asset_smart_folders` is a SAVED QUESTION — a stored query that
-- lists whatever matches it right now, with no membership rows to keep in step.
--
-- The zod contract these mirror is `packages/shared/src/assets/folder-tree.ts`
-- and `.../organize.ts` (`SmartQuerySchema`). Column names here match those
-- schemas exactly; the real validation of a saved query is that schema parsing
-- the jsonb on the way out, not the coarse shape CHECK in section 6.
--
-- ── NOTHING HERE CASCADES TO A FILE ─────────────────────────────────────────
-- This is the whole safety story and it is deliberate. Removing a photo from a
-- folder deletes ONE membership row. Deleting a folder deletes the folder and its
-- membership rows and its whole subtree of sub-folders. Neither deletes a single
-- byte, and neither can: the only path that removes a file is the delete gate on
-- `assets` (20260820000000), which weighs a file's USES, and a filing is not a
-- use. A file in three folders that is dragged out of one is still in two, and
-- still in the library.
--
-- IF THIS FILE IS WRONG: no real folders. The three derived folders and the whole
-- library keep working; every object here is new and nothing reads it yet.
--
-- REVERSIBLE: yes —
--   drop table asset_smart_folders;
--   drop table asset_folder_items;
--   drop trigger asset_folders_guard_tree on asset_folders;
--   drop function app.asset_folders_guard_tree();
--   drop table asset_folders;
-- Dropping them discards the filing. No file is lost — no file was ever stored
-- here in the first place.
--
-- APPLY ORDER: after 20260819000400_assets.sql (both membership FKs point at it).
-- `asset_folders` must be created BEFORE `asset_folder_items`, which is why they
-- are in one file and in this order. Independent of everything else in the batch.


-- ── 1 of 8 ───────────────────────────────────────────────────────────────────
-- The tree.
--
-- IF THIS IS WRONG: no named folders. The library and its derived folders are
-- untouched.
create table asset_folders (
  id uuid primary key default gen_random_uuid(),

  -- Whose tree it is.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- ── THE COMPOSITE SELF-REFERENCE, AND THE HOLE IT CLOSES ──────────────────
  -- Null is the root; there is no synthetic "My Library" row to keep in step.
  --
  -- A plain `references asset_folders (id)` would let a folder be parented into
  -- ANOTHER TENANT's folder: the id exists, the reference is satisfied, and one
  -- customer's tree now hangs off another's. Pairing the parent link with
  -- `workspace_id` — `(parent_id, workspace_id) references (id, workspace_id)` —
  -- makes that impossible rather than merely unlikely, because the parent must
  -- belong to the SAME workspace as the child. This is the same pairing every
  -- other child table in this database uses. It is why `unique (id, workspace_id)`
  -- below has to exist: a composite foreign key needs a matching unique key to
  -- point at.
  --
  -- `on delete cascade`, so deleting a folder takes its whole subtree of
  -- sub-folders with it. The membership rows for every folder in that subtree go
  -- too (section 2), and no file is touched by any of it.
  parent_id uuid,

  -- What the customer calls it. 60 is MAX_FOLDER_NAME in the shared file: past it
  -- the breadcrumb on a 360px phone starts eliding the names a person navigates by.
  name text not null check (char_length(name) <= 60),

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The target of the composite parent link above, and of the membership FK in
  -- section 2. Without this line neither can be created at all.
  unique (id, workspace_id),

  foreign key (parent_id, workspace_id) references asset_folders (id, workspace_id)
    on delete cascade
);


-- ── 2 of 8 ───────────────────────────────────────────────────────────────────
-- Case-insensitive sibling uniqueness, in TWO partial indexes rather than one
-- constraint. This is a real trap and both halves of it are load-bearing.
--
-- `unique (workspace_id, parent_id, lower(name))` cannot be written as a table
-- constraint at all: a UNIQUE constraint takes bare columns, and `lower(name)` is
-- an expression. It has to be a unique INDEX.
--
-- And even as one index it would not do the job, because Postgres treats two
-- NULLs as DISTINCT: every root folder has `parent_id` null, so a single index
-- over `(workspace_id, parent_id, lower(name))` would let "Diwali" and "diwali"
-- both sit at the root. That is precisely the collision the rule exists to stop,
-- and it is invisible until someone makes two root folders.
--
-- So: one index for the folders that HAVE a parent, and a second, narrower one
-- for the roots, where `parent_id` is left out entirely (it is always null there,
-- so it carries no information and only reintroduces the NULL-distinct bug).
create unique index asset_folders_sibling_name_uidx
  on asset_folders (workspace_id, parent_id, lower(name))
  where parent_id is not null;

create unique index asset_folders_root_name_uidx
  on asset_folders (workspace_id, lower(name))
  where parent_id is null;


-- ── 3 of 8 ───────────────────────────────────────────────────────────────────
-- The reads the security rules and the tree need: "my folders", and "the children
-- of this folder".
create index on asset_folders (workspace_id);
create index on asset_folders (workspace_id, parent_id);


-- ── 4 of 8 ───────────────────────────────────────────────────────────────────
-- NO CYCLES, AND NO DEEPER THAN SIX.
--
-- A composite foreign key stops a folder crossing tenants; it does nothing about
-- a folder pointing into its OWN subtree. `A -> B -> A` satisfies every foreign
-- key and is a loop that would spin any tree walk — the breadcrumb, a recursive
-- delete, `descendantIds` in the shared file — forever. This trigger refuses to
-- write one.
--
-- It also enforces MAX_FOLDER_DEPTH (6): the walk from the proposed parent up to
-- the root is the new row's depth minus one, and a walk that reaches six steps is
-- either a tree past the limit or a pre-existing cycle among ancestors that does
-- not pass through this row. BOTH are refused here, and the six-step cap is also
-- the VISIT GUARD: it is what stops a corrupted or hand-edited row that already
-- contains a loop from making this trigger itself spin forever. A valid chain
-- reaches the root in at most five steps, so the cap never fires on good data.
--
-- Fires BEFORE INSERT and BEFORE UPDATE OF parent_id — the only two moments a
-- parent link is set or moved. A rename does not touch it and does not pay for it.
--
-- IF THIS IS WRONG in the loose direction: a loop or an over-deep branch gets
-- stored and a later tree walk hangs. Worth reading twice before applying.
create or replace function app.asset_folders_guard_tree() returns trigger
language plpgsql as $$
declare
  walk_id uuid := new.parent_id;
  above int := 0;
  below int;
begin
  -- ── PART ONE: the ancestors, walked one row at a time ──────────────────────
  -- Depth 1 is a root folder, so `above` ends as the number of folders between
  -- this row and the root.
  while walk_id is not null loop
    -- Reaching this row means the proposed parent IS this folder or sits inside
    -- its own subtree: a cycle. Raise rather than continue the walk.
    if walk_id = new.id then
      raise exception
        'A folder cannot be moved inside itself or its own subtree'
        using errcode = 'check_violation';
    end if;

    above := above + 1;

    -- The runaway cap, and it is NOT the depth rule. It stops a loop among
    -- ancestors that never reaches this row from spinning forever. The depth
    -- rule itself is checked once, below, against the whole subtree.
    if above > 6 then
      raise exception
        'Folders can be at most 6 levels deep'
        using errcode = 'check_violation';
    end if;

    -- Scoped to this row's workspace: the composite FK guarantees the whole
    -- chain is one tenant's, and reading it scoped keeps that true even mid-write.
    select parent_id into walk_id
      from asset_folders
      where id = walk_id and workspace_id = new.workspace_id;
  end loop;

  -- ── PART TWO: THE SUBTREE, which the ancestor walk alone cannot see ────────
  -- MEASURED before this half existed: with a host chain 4 deep and a 3-deep
  -- subtree moved under it, the move was ALLOWED and left the deepest
  -- descendant at depth 7, past this table's own limit of 6.
  --
  -- The reason is that moving a folder re-depths every folder beneath it, and
  -- NONE of those rows has its own `parent_id` touched, so the trigger never
  -- fires for any of them. Checking only the row being written is checking the
  -- one folder whose depth a person can already see.
  --
  -- `below` is the height of this row's subtree counted in levels, so a leaf is
  -- 1. On INSERT a new row has no descendants and this is always 1, which makes
  -- the check below reduce to the plain depth rule.
  --
  -- The `d < 8` bound is not the rule either: it is the same runaway guard as
  -- above, so a cycle among stored rows cannot make this walk unbounded. It sits
  -- one past the largest depth that could ever be legal.
  with recursive down as (
    select id, 1 as d
      from asset_folders
     where id = new.id and workspace_id = new.workspace_id
    union all
    select child.id, down.d + 1
      from asset_folders child
      join down on child.parent_id = down.id
     where child.workspace_id = new.workspace_id
       and down.d < 8
  )
  select max(d) into below from down;

  -- `above` folders sit over this row, and `below` levels hang beneath it
  -- inclusive of this row, so the deepest leaf lands at `above + below`.
  if coalesce(below, 1) + above > 6 then
    raise exception
      'Folders can be at most 6 levels deep'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


create trigger asset_folders_guard_tree
  before insert or update of parent_id on asset_folders
  for each row execute function app.asset_folders_guard_tree();


-- ── 5 of 8 ───────────────────────────────────────────────────────────────────
-- Membership. One row means "this file is filed in this folder".
--
-- A file may live in MANY folders — that is the point, and it is why this is a
-- table and not a `folder_id` column on `assets`. A shopfront photo genuinely
-- belongs in both "Diwali campaign" and "Storefront", and filing it in the
-- second must not remove it from the first.
--
-- DELETING A ROW HERE REMOVES A FILING, NEVER A FILE. Nothing here cascades to
-- storage and nothing here can delete a byte. Both foreign keys `on delete
-- cascade`, so deleting a folder OR deleting the underlying asset removes the
-- filing — but the asset's own deletion is the only thing that ever removes the
-- file, and it goes through the usage gate on `assets`, which a filing does not
-- trip.
--
-- Both foreign keys are composite with `workspace_id`, exactly as `asset_usages`
-- is, so a filing can never tie one customer's folder to another customer's file.
--
-- IF THIS IS WRONG: files cannot be filed. Existing rows are unaffected.
create table asset_folder_items (
  workspace_id uuid not null references workspaces (id) on delete cascade,

  folder_id uuid not null,
  asset_id uuid not null,

  added_by text,
  added_at timestamptz not null default now(),

  -- A file is filed in a folder once. The natural key is the pair.
  primary key (folder_id, asset_id),

  foreign key (folder_id, workspace_id) references asset_folders (id, workspace_id)
    on delete cascade,
  foreign key (asset_id, workspace_id) references assets (id, workspace_id)
    on delete cascade
);

-- "Which folders is this file in?" in one index scan. Its leading column is
-- `workspace_id`, so it also serves every tenant-scoped read the policies do; the
-- primary key already indexes `folder_id` for "what is in this folder?".
create index on asset_folder_items (workspace_id, asset_id);


-- ── 6 of 8 ───────────────────────────────────────────────────────────────────
-- Smart folders — a saved question, not a bag of files.
--
-- `query` is jsonb, and the DATABASE is not its validator: `SmartQuerySchema` in
-- packages/shared parsing it on the way out is. That parse is the real gate, and
-- it is where every rule's own shape is checked. The CHECK here only refuses
-- things that are obviously not a query at all — a bare string, an empty object,
-- a rules list that is missing, not a list, empty, or longer than the eight the
-- shared schema caps at. It is a coarse net under a fine one, so a corrupt row
-- cannot masquerade as a query the loader will then choke on.
--
-- IF THIS IS WRONG: saved searches cannot be stored. Nothing existing is affected.
create table asset_smart_folders (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  name text not null check (char_length(name) <= 60),

  query jsonb not null check (
    jsonb_typeof(query) = 'object'
    and query ? 'mode'
    and (query ->> 'mode') in ('all', 'any')
    and jsonb_typeof(query -> 'rules') = 'array'
    and jsonb_array_length(query -> 'rules') between 1 and 8
  ),

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on asset_smart_folders (workspace_id);

-- Two saved searches with the same name read as the same folder to a person, so
-- they collide case-insensitively — a partial unique index, matching the root
-- folders in section 2. (Partial only so it is written the same way; there is no
-- null case here, as smart folders do not nest.)
create unique index asset_smart_folders_name_uidx
  on asset_smart_folders (workspace_id, lower(name))
  where name is not null;


-- ── 7 of 8 ───────────────────────────────────────────────────────────────────
-- Security. Members manage their own folders, filings and saved searches; every
-- rule is scoped to `workspace_id` through the same one-line house policy every
-- other tenant table uses, so one customer can never see or write another's.
--
-- IF THIS IS WRONG in the loose direction: one customer could list another's
-- folder names — which name a campaign, and so leak what they are planning.
-- Worth reading twice before applying.
select app.apply_tenant_policies('asset_folders');
select app.apply_tenant_policies('asset_folder_items');
select app.apply_tenant_policies('asset_smart_folders');


-- ── 8 of 8 ───────────────────────────────────────────────────────────────────
-- Keeps "last changed" honest on the two tables a person edits in place. The
-- membership table is insert-or-delete only and has no updated_at to maintain.
create trigger set_updated_at before update on asset_folders
  for each row execute function app.set_updated_at();

create trigger set_updated_at before update on asset_smart_folders
  for each row execute function app.set_updated_at();

comment on table asset_folder_items is
  'A filing: one row means a file is placed in a folder. A file may be filed in '
  'many folders at once. Deleting a row here removes the filing, never the file — '
  'nothing here cascades to storage, and the only path that deletes a file is the '
  'usage gate on assets, which a filing does not trip.';
