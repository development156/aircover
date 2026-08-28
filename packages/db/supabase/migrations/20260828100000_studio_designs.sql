-- ── A DESIGN A PERSON CAN COME BACK TO ───────────────────────────────────────
-- Studio stops being a roadmap page in this change. Until now it rendered
-- nothing and saved nothing; from here a design is a row, and closing the tab
-- is no longer the same as throwing the work away.
--
-- Two tables, and the second one exists for a reason that is not obvious.
--
-- ── 1 · studio_designs ───────────────────────────────────────────────────────
-- `doc` is jsonb and holds the whole design: which template, how many pages, and
-- what the person typed into each slot. It is NOT a pile of loose columns,
-- because the shape will change every time a template gains a slot, and a
-- migration per slot is not a schema, it is a queue.
--
-- The column is deliberately NOT validated by a CHECK constraint. Postgres
-- cannot express the shape and would go stale the first time it changed;
-- `DesignDocumentSchema` in `@sahoda/shared` parses every read instead, PER ROW,
-- so one malformed design costs one card in the gallery rather than the gallery.
-- That is the same discipline `AssetSchema` already applies.
--
-- ── `is_template` IS A CUSTOMER'S OWN SAVED STARTING POINT ────────────────────
-- Founder's ruling, 2026-08-28: customers save their own templates now, and
-- Sahoda ships curated ones later. So a template is not a separate table with a
-- near-identical shape. It is a design somebody ticked a box on, which means
-- "save this as a template" is an UPDATE of one boolean rather than a copy that
-- can drift from its original.
--
-- When curated templates arrive they will need an author scope this column
-- cannot express (a row nobody's workspace owns). That is a later migration and
-- it is cheap: a nullable `origin` column beside this one. Adding it now would
-- be a column with one possible value and no reader.
--
-- ── 2 · studio_exports, AND THE TRAP IT DISARMS ──────────────────────────────
-- The renderer is DETERMINISTIC. The same design exported twice produces
-- byte-identical PNGs — `raster.test.ts` asserts exactly that, by sha256.
--
-- That collides head-on with the assets library. `uploadAsset` looks a file up
-- by its content hash and refuses a duplicate, and 20260827140000 added the
-- column it uses. So the SECOND export of an unchanged design would be told
-- "You already have this file" — and worse, if the first export had been
-- trashed, the person would be told to go and restore something they have never
-- heard of.
--
-- Refusing is right for an upload and wrong here: exporting the same design
-- twice is not a mistake, it is a person pressing the button again. This table
-- makes the studio able to ANSWER rather than refuse. `unique (design_id,
-- content_sha256)` means the second export finds the row, and the studio says
-- "this design is already in your library" while pointing at the actual file,
-- instead of inferring a refusal it cannot explain.
--
-- ROLLBACK
--   drop table if exists studio_exports;
--   drop table if exists studio_designs;
-- Dropping these loses every saved design. It loses no exported PICTURE: those
-- are rows in `assets` with bytes in the bucket, and nothing here owns them.

create table studio_designs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- What the person calls it. 80 rather than the folders' 60: a design name sits
  -- on a card with room under it, not inside a breadcrumb that has to elide.
  title text not null check (char_length(title) between 1 and 80),

  -- Which canvas size. A plain text key matched against STUDIO_PRESETS in
  -- `@sahoda/shared`, NOT an enum: presets are a product choice that will change
  -- more often than this table, and an enum makes adding one a migration.
  --
  -- An unknown id here is a readable state, not corruption. `presetById` returns
  -- null and the screen says the size is no longer offered, which is what should
  -- happen to a design made before a preset was retired.
  preset_id text not null check (char_length(preset_id) between 1 and 40),

  -- The design itself. Parsed by DesignDocumentSchema on every read; see above.
  doc jsonb not null,

  -- A starting point this customer saved for themselves. See the header.
  is_template boolean not null default false,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The composite-FK target, so studio_exports cannot point a row at another
  -- tenant's design. Same pairing every child table in this database uses.
  unique (id, workspace_id)
);

comment on table studio_designs is
  'A saved Studio design. `doc` carries the whole document as jsonb and is parsed '
  'by DesignDocumentSchema in @sahoda/shared on every read, per row, so one bad '
  'design costs one card rather than the gallery.';

comment on column studio_designs.is_template is
  'The customer saved this design as their own starting point. Curated Sahoda '
  'templates are NOT modelled here yet: they need an author scope no workspace '
  'owns, and that is a later migration.';

-- The gallery: this workspace, newest first. Templates are a separate shelf on
-- the same screen, so the partial indexes are split rather than one index the
-- template filter then discards.
create index studio_designs_recent_idx
  on studio_designs (workspace_id, updated_at desc)
  where is_template = false;

create index studio_designs_templates_idx
  on studio_designs (workspace_id, updated_at desc)
  where is_template = true;

create trigger set_updated_at before update on studio_designs
  for each row execute function app.set_updated_at();

select app.apply_tenant_policies('studio_designs');

-- ─────────────────────────────────────────────────────────────────────────────

create table studio_exports (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  design_id uuid not null,

  -- The file this export became. `on delete cascade` through the composite pair:
  -- if the asset is deleted for good, the export record goes with it, because a
  -- record pointing at bytes that no longer exist would make the studio tell
  -- somebody their design is in a library it is not in.
  asset_id uuid not null,

  -- Lowercase hex sha256 of the exported bytes. 64 characters, always.
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),

  created_at timestamptz not null default now(),

  -- THE WHOLE POINT. A second export of an unchanged design finds this row
  -- rather than colliding with the assets library's duplicate refusal.
  unique (design_id, content_sha256),

  foreign key (design_id, workspace_id) references studio_designs (id, workspace_id)
    on delete cascade,
  foreign key (asset_id, workspace_id) references assets (id, workspace_id)
    on delete cascade
);

comment on table studio_exports is
  'Which asset a design exported to, keyed by the content hash of the bytes. '
  'Exists because the renderer is deterministic: the same design exported twice '
  'produces identical bytes, which the assets library would otherwise refuse as '
  'a duplicate upload.';

create index studio_exports_design_idx on studio_exports (design_id, created_at desc);
create index studio_exports_workspace_idx on studio_exports (workspace_id);

select app.apply_tenant_policies('studio_exports');
