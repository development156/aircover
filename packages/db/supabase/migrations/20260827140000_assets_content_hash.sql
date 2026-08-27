-- ── THE SAME FILE, TWICE ─────────────────────────────────────────────────────
-- Uploading a photo you already have made a second row, a second object in the
-- bucket, and a second tile. Nothing said a word. A library people add to
-- repeatedly fills with four copies of the same shopfront photo and the person
-- who has to pick one cannot tell them apart.
--
-- `content_sha256` is the SHA-256 of the file's exact bytes, computed at upload
-- from the same buffer `sniffImage` already reads. No second pass over the file.
--
-- ── WHAT THIS COLUMN CAN AND CANNOT ANSWER ───────────────────────────────────
-- It answers "are these the SAME FILE" and nothing else. Two visually identical
-- photos saved at different quality settings have different bytes and different
-- hashes, and this must never be described to a person as "the same photo" —
-- the copy says "the same file" for exactly that reason. Perceptual similarity
-- is a different feature with a different mechanism and it is not this.
--
-- ── ROWS UPLOADED BEFORE THIS MIGRATION HAVE NO HASH, AND THAT IS FINE ───────
-- They stay NULL. A NULL never matches, so an older duplicate simply is not
-- detected — and the product never claims otherwise: it only ever says "you
-- already have this file" when a hash actually matched. The absence of a match
-- is not rendered as "you have nothing like this".
--
-- A backfill would have to re-read every object out of storage to hash it. That
-- is a job, not a migration, and it is deliberately not done here.
--
-- NOT UNIQUE, DELIBERATELY. A unique index would make the DATABASE refuse the
-- second upload, and the refusal a person needs is a sentence naming the file
-- they already have, with a way to open it. A constraint violation cannot carry
-- that. It would also make the trash unusable: deleting a file and re-uploading
-- it would fail against the trashed row. The check belongs in the action, which
-- can look, decide, and explain.
--
-- ROLLBACK
--   drop index if exists assets_content_hash_idx;
--   alter table assets drop column if exists content_sha256;
-- Dropping it loses duplicate detection for future uploads. No file is lost:
-- nothing about a row's identity or its bytes depends on this column.

alter table assets add column if not exists content_sha256 text;

comment on column assets.content_sha256 is
  'SHA-256 of the file''s exact bytes, for duplicate detection at upload. '
  'Answers "the same FILE", never "the same photo" — two images saved at '
  'different quality hash differently. NULL for rows uploaded before this '
  'column existed; a NULL never matches, and no copy claims it does.';

-- Partial, because the only query is "does this workspace already hold these
-- bytes" and a NULL hash can never be the answer to it. Indexing the NULLs
-- would be paying for every pre-existing row on every upload forever.
create index if not exists assets_content_hash_idx
  on assets (workspace_id, content_sha256)
  where content_sha256 is not null;
