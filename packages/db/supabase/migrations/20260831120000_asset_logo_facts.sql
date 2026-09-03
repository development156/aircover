-- ─────────────────────────────────────────────────────────────────────────────
-- What Sahoda learned about a logo file becomes a stored row, not a re-read
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- Yesterday `workspaces.logo_asset_id` (20260831090000) gave a workspace a real
-- pointer at the `assets` row it chose as its logo. But the product knows nothing
-- ABOUT that file: whether it carries an alpha channel, whether its background is
-- transparent, where the ink actually sits inside the frame, whether that ink is
-- dark or light, and what overall shape it is. Those answers decide how the logo
-- is placed on a light or dark surface and how it is padded. Recomputing them on
-- every render means decoding the image every time, and there is nowhere to keep
-- the answer once it is known. `apps/web` (lib/brand/logo-facts.ts) computes them;
-- this file is where they live.
--
-- WHAT THIS FILE DOES. Adds `asset_logo_facts`, exactly one row per `assets` row,
-- keyed BY the asset (the primary key IS the asset id) because the facts are
-- about the file and are meaningless without it. It carries the alpha and
-- transparency flags, the trim box (all four coordinates, or none: a fully
-- transparent image has no mark to measure and that is a real answer, never
-- faked with zeros), the ink polarity and the shape class, plus when it was
-- computed. RLS is enabled with the standard membership policy, and a COMPOSITE
-- foreign key ties the row to a file in the SAME workspace.
--
-- WHY A COMPOSITE FOREIGN KEY AND NOT A TRIGGER. The plain `references assets(id)`
-- on the primary key proves the asset EXISTS; it cannot prove the asset belongs
-- to the workspace this row names. The predecessor migration reached for a trigger
-- because its `on delete set null` could not be expressed as a composite key. Here
-- there is no such obstacle: the row dies WITH the asset (`on delete cascade`),
-- and `on delete cascade` on a composite foreign key is legal and enforced by the
-- database. `assets` already carries `unique (id, workspace_id)` (see
-- 20260819000400_assets.sql), which is a superset of its own primary key and so
-- can never fail to hold, so the composite key `(asset_id, workspace_id)
-- references assets (id, workspace_id)` costs nothing to add and needs no new
-- constraint on `assets`. A key the database enforces on every write beats a
-- trigger that a future `alter` could disable unnoticed.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. The table is new
-- and nothing reads it yet. `readBrandLogo` and the topbar do not depend on it,
-- and a logo with no facts row simply has no cached answer, which is the state
-- every logo is in the moment before this feature ships.
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping it
-- loses only the CACHED answers about each logo file. No file is lost, because the
-- row never held the bytes, and the answers can be recomputed from the asset.
--
-- APPLY ORDER: after 20260819000400_assets.sql (the `assets` table and its
-- `unique (id, workspace_id)` the composite key needs) and after
-- 20260718000001_helpers.sql (for `app.apply_tenant_policies` and
-- `app.set_updated_at`). Independent of 20260831090000.


-- ── 1 of 4 · the table ─────────────────────────────────────────────────────────
create table asset_logo_facts (
  -- The primary key IS the asset id: one row per file, no separate identity. The
  -- facts are ABOUT the file, so they die with it. This single-column reference
  -- proves the asset exists; the composite key below proves it is in this tenant.
  asset_id uuid primary key references assets (id) on delete cascade,

  -- Every table in this database carries its workspace and an index on it, so RLS
  -- is scoped and one customer can never read another's. On a hard delete of the
  -- workspace this row goes with it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- Does the file carry an alpha channel at all? A JPEG never does; a PNG may.
  has_alpha boolean not null,

  -- Is the background actually see-through? Having an alpha channel is not the
  -- same as using it: a PNG can be fully opaque. This is the answer that decides
  -- whether the logo needs a plate behind it on a busy surface.
  transparent_background boolean not null,

  -- The tight box around the ink, in pixels of the original. ALL FOUR NULL
  -- TOGETHER: a fully transparent image has no mark to measure, and "no trim box"
  -- is a real answer that must not be faked with zeros. The CHECK below enforces
  -- all-or-none, and width and height must be positive when they are present.
  trim_x int,
  trim_y int,
  trim_width int,
  trim_height int,

  -- Is the ink dark on light, light on dark, or genuinely both? This is what
  -- chooses the surface the logo is legible on.
  ink_polarity text not null check (ink_polarity in ('dark', 'light', 'mixed')),

  -- The overall proportion, for layout: a square lockup, a wide wordmark or a
  -- tall stack pad and place differently.
  shape_class text not null check (shape_class in ('square', 'wide', 'tall')),

  -- When these answers were computed. Distinct from `updated_at`: the row can be
  -- touched (a policy change, a backfill) without the facts being recomputed, and
  -- this is the timestamp that says how fresh the ANSWERS are.
  computed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The tenancy guard. The single-column reference on the primary key cannot see
  -- `workspace_id`; this pair can only exist when the asset is in THIS workspace.
  -- `assets (id, workspace_id)` is unique, so this is a valid target.
  constraint asset_logo_facts_asset_same_tenant_fk
    foreign key (asset_id, workspace_id)
    references assets (id, workspace_id) on delete cascade,

  -- The trim box is all four or none. "No box" is the honest answer for an image
  -- with no ink, and zeros would be a lie the render code would trust.
  constraint asset_logo_facts_trim_all_or_none check (
    (trim_x is null and trim_y is null and trim_width is null and trim_height is null)
    or
    (trim_x is not null and trim_y is not null and trim_width is not null and trim_height is not null)
  ),

  -- A box with no area is not a box. Only checked when present, so the all-null
  -- case passes these untouched.
  constraint asset_logo_facts_trim_width_positive
    check (trim_width is null or trim_width > 0),
  constraint asset_logo_facts_trim_height_positive
    check (trim_height is null or trim_height > 0)
);


-- ── 2 of 4 · the index ─────────────────────────────────────────────────────────
-- Mandatory on `workspace_id`: the membership policy filters on it on every read,
-- and without an index that is a full scan per query. `asset_id` needs none: it
-- is the primary key and already indexed, which also covers the leading column of
-- the composite foreign key.
create index on asset_logo_facts (workspace_id);


-- ── 3 of 4 · security ──────────────────────────────────────────────────────────
-- The standard membership policy: a member may read and write only rows in a
-- workspace they belong to, scoped by `workspace_id` through
-- `app.member_workspace_ids()`. `apps/web` has no service-role client, so this
-- policy is the entire boundary, not a convenience.
--
-- IF THIS IS WRONG in the loose direction: one customer could read another's logo
-- facts. Worth reading twice before applying.
select app.apply_tenant_policies('asset_logo_facts');


-- ── 4 of 4 · the updated_at trigger ────────────────────────────────────────────
-- Keeps "last changed" honest without any caller remembering to set it. Note this
-- is `updated_at`, the row's touch time, NOT `computed_at`, which the writer sets
-- deliberately when it recomputes the answers.
create trigger set_updated_at before update on asset_logo_facts
  for each row execute function app.set_updated_at();


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   drop trigger if exists set_updated_at on asset_logo_facts;
--   drop table if exists asset_logo_facts;
--
-- Dropping this loses only the CACHED answers about each logo file: alpha,
-- transparency, trim box, ink polarity and shape. No file is lost, the `assets`
-- rows are untouched, and every answer can be recomputed from the bytes.
