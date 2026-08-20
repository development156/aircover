-- ─────────────────────────────────────────────────────────────────────────────
-- post_variants.format — widen the domain by two: `story` and `thread`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- `20260819000200` added the column with four values — text, image, carousel,
-- video — and said so in its own header: "a channel-specific kind (a Story, a
-- Reel, a Google offer) is deliberately NOT in this list, because those need
-- their own fields and belong to their own change."
--
-- This is that change, for the two of them that need no new fields.
--
-- WHY THESE TWO AND NOT THE OTHERS.
-- Reel, LinkedIn document and video all need a media pipeline that can ingest
-- something other than a photo. `apps/web/src/lib/posts/sniff-image.ts` reads a
-- file's own magic bytes and recognises exactly four image containers, refusing
-- everything else outright — correctly, because that refusal is the only thing
-- stopping a 40 MB video renamed `photo.jpg`. A video cannot enter the system at
-- all, so a `reel` value would be a choice that saves and never publishes.
--
-- A Story is one photo. A thread is words. Both are reachable with the pipeline
-- we already have, and both have a Zernio field behind them that this change's
-- companion commits actually send:
--   story  → platformSpecificData.instagram.contentType = 'story'
--   thread → platformSpecificData.x.threadItems = [{ content, mediaItems }, …]
-- docs/31 §2 and §5 carry the evidence for both, read out of Zernio's OpenAPI
-- document rather than a summary of it.
--
-- ── READ THIS PART BEFORE APPLYING ──────────────────────────────────────────
-- WIDENING A CHECK CANNOT FAIL ON EXISTING DATA. Every row that satisfied the
-- four-value constraint satisfies the six-value one, so there is no scan that
-- can reject a row and no window in which writes see a constraint that is gone —
-- the drop and the add are in the same transaction.
--
-- The reverse is NOT true, and that is the whole risk of this file: once a row
-- holds 'story', narrowing the CHECK back to four values FAILS unless those rows
-- are cleared first. The rollback below does that explicitly rather than leaving
-- someone to discover it.
--
-- WHAT MUST BE TRUE BEFORE THIS IS USEFUL:
--   1. `POST_FORMATS` in packages/publishing/src/format-vocabulary.ts lists the
--      same six strings. `format.test.ts` reads THIS FILE and fails if it does
--      not, so the two cannot drift silently.
--   2. Publishing sends the field. Until it does, a picker offering Story would
--      save the choice and publish a feed post — the fake-success state this
--      product refuses, and the exact thing 20260819000200's header warned about.
--
-- IF THIS FILE IS WRONG: no row changes. The column keeps its values; only the
-- set of values it will ACCEPT moves. Safe to run twice.
--
-- NO NEW TABLE, so no new security rules. `post_variants` already has row-level
-- security switched on and scoped to `workspace_id`.


-- ── 1 of 1 ───────────────────────────────────────────────────────────────────
-- Dropped by BOTH names on purpose. `20260819000200` wrote the constraint inline
-- and unnamed, so Postgres generated `post_variants_format_check`; this file
-- names its own so the next change to the domain has one obvious thing to drop.
-- `if exists` on both, so applying this to a database that has already had it —
-- or one where the original was named by hand — does nothing surprising.
alter table public.post_variants
  drop constraint if exists post_variants_format_check;

alter table public.post_variants
  drop constraint if exists post_variants_format_allowed;

alter table public.post_variants
  add constraint post_variants_format_allowed
    check (format is null or format in ('text', 'image', 'carousel', 'story', 'thread', 'video'));


-- ROLLBACK (not run by this file — kept here so it is not re-derived under pressure):
--
--   update public.post_variants set format = null
--    where format in ('story', 'thread');
--   alter table public.post_variants
--     drop constraint if exists post_variants_format_allowed;
--   alter table public.post_variants
--     add constraint post_variants_format_check
--       check (format is null or format in ('text', 'image', 'carousel', 'video'));
--
-- The update is not optional. Without it the add fails on the first row holding a
-- widened value, and the table is left with NO constraint on the column at all.
