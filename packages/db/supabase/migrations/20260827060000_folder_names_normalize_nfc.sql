-- ─────────────────────────────────────────────────────────────────────────────
-- Folder names: compare them the way a PERSON compares them
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS WRONG TODAY. `asset_folders` enforces sibling-name uniqueness with two
-- partial indexes on `lower(name)`. `lower()` folds case and does nothing about
-- Unicode normalisation, so "café" written with a single e-acute code point and
-- "café" written as a plain e plus a combining acute are two DIFFERENT keys.
--
-- They render identically. A person can therefore create two folders with, as
-- far as any human eye can tell, the same name, and no message anywhere explains
-- why both exist. MEASURED in Node before this file was written:
--
--   'café' === 'café'                            false
--   'café'.toLowerCase() === 'café'.toLowerCase() false
--   both .normalize('NFC')                                   EQUAL
--
-- The paste buffer decides which form you get, so this is not exotic: macOS
-- filenames normalise one way and most keyboards and web forms the other.
--
-- WHAT THIS FILE DOES. Replaces the two partial unique indexes so both fold case
-- AND normalise to NFC, matching `normalizeFolderName` in packages/shared, which
-- normalises before it stores. Both halves are needed: the application stops
-- WRITING the two forms, and the index stops ACCEPTING them if anything else
-- ever does.
--
-- `normalize(text, NFC)` is built into PostgreSQL 13 and later. Production runs
-- 17.6, MEASURED from `list_projects`.
--
-- IF THIS FILE IS WRONG: folder-name uniqueness reverts to the case-insensitive
-- behaviour it has today. No row is read, changed or deleted by this file.
--
-- REVERSIBLE: yes, by recreating the two indexes on `lower(name)`.
--
-- ── AND WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
-- It does NOT rewrite existing rows. A pair of already-stored folders whose
-- names differ only by normalisation would make the new index fail to build, and
-- the migration would stop rather than silently pick a winner and rename or
-- delete somebody's folder. MEASURED on production 2026-08-27: `asset_folders`
-- holds 0 rows, so no such pair can exist and the build cannot be blocked. If it
-- ever does block, the resolution is a person's call, not a migration's.

-- ── 1 of 2 ───────────────────────────────────────────────────────────────────
-- Sibling names, for folders that have a parent.
drop index if exists asset_folders_sibling_name_uidx;

create unique index asset_folders_sibling_name_uidx
  on asset_folders (workspace_id, parent_id, lower(normalize(name, nfc)))
  where parent_id is not null;

-- ── 2 of 2 ───────────────────────────────────────────────────────────────────
-- And the ROOT case, which needs its own index because Postgres treats two
-- NULLs as DISTINCT: a single index including `parent_id` would let two root
-- folders share a name. This is the same reason the original migration wrote
-- two indexes rather than one.
drop index if exists asset_folders_root_name_uidx;

create unique index asset_folders_root_name_uidx
  on asset_folders (workspace_id, lower(normalize(name, nfc)))
  where parent_id is null;

comment on index asset_folders_sibling_name_uidx is
  'Sibling folder names are unique per parent, compared case-folded and NFC-normalised so the two spellings of an accented name are one name.';

comment on index asset_folders_root_name_uidx is
  'The same rule for root folders. Separate because parent_id is NULL there and two NULLs are DISTINCT in Postgres.';
