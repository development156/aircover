-- ─────────────────────────────────────────────────────────────────────────────
-- Record WHICH corner a generated image's logo actually landed in, and why it
-- moved when it did not land in the corner the customer chose
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- The renderer measures all four corners of the finished picture (added in the
-- application at commit 29c31c21, `apps/web/src/lib/studio/corner-choice.ts`) and
-- may place the mark somewhere other than the corner the customer asked for: in a
-- quieter corner when the chosen one is too busy behind the mark, or in a legible
-- one when the mark would not clear contrast where it was asked to go. `stamp.ts`
-- carries that fact out on its `StampResult.anchorChoice`, and it reaches no
-- column, so a control that says "bottom-right" can silently produce a picture
-- stamped top-left with nothing recording it. `studio_generation_images` holds
-- WHETHER a mark went on (`stamp_outcome`, 20260831150000) but not WHERE it went.
--
-- WHAT THIS FILE DOES. Adds two nullable text columns to
-- `studio_generation_images`, each with a check constraint and a comment:
--
--   stamped_anchor              the corner the mark was ACTUALLY stamped in, in
--                               the SHARED `STAMP_ANCHORS` vocabulary
--                               ('bottom-right' etc., hyphens, not underscores)
--   stamp_anchor_moved_reason   why it differs from the corner asked for, when it
--                               differs: 'busy' or 'unreadable'
--
-- Both follow `stamp_outcome` (20260831150000) exactly: text with a CHECK rather
-- than a Postgres enum, so the vocabulary can grow without an ALTER TYPE and a
-- lock; nullable with no default and no backfill; documented so a reader knows
-- that NULL is a real answer and never "as chosen".
--
-- NO INDEX, NO TRIGGER, NO POLICY. Neither column is a foreign key, so there is no
-- set-null action to index for and no cross-tenant pointer to guard: a corner name
-- names no row. The table's RLS, its append-only `block_mutations` trigger and its
-- `workspace_id` tenancy are all unchanged, and these columns are covered by the
-- SELECT/INSERT policies already on the table. Nothing here needs an anon-client
-- RLS test because nothing about who may read or write a row has changed.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. Both columns are
-- new, nullable, have no default, and the only reader degrades without them. Every
-- existing `studio_generation_images` row keeps both NULL, which is the "not
-- recorded" case and stays supported forever. `asset_id`, `stamped_asset_id` and
-- `stamp_outcome` are untouched.
--
-- HOW THE APPLICATION DEGRADES BEFORE THIS IS APPLIED. The generate action writes
-- the image row with these two columns; on `42703` (undefined column) it re-writes
-- WITHOUT them but STILL WITH `stamped_asset_id` and `stamp_outcome`, which are
-- already applied in production. So a deploy that has this code and not this
-- migration still generates, charges, stamps and records the logo link; it only
-- loses the record of the corner move, and the result screen then says nothing
-- about a move rather than guessing one. A read of the row uses `select *`, which
-- omits an absent column rather than erroring, so the reader sees NULL and stays
-- silent. NULL is never rendered as "stamped where asked".
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping these
-- loses only WHICH corner each mark landed in and WHY. No file is lost and no
-- pointer dangles: these columns never held bytes or ids.
--
-- APPLY ORDER: after 20260829210000_studio_generations.sql (the
-- `studio_generation_images` table this alters). Independent of
-- 20260831150000_studio_stamped_asset.sql and
-- 20260904140000_studio_remix_lineage_and_stamp_settings.sql: it neither reads nor
-- writes anything either of them touches. Note that the remix file adds a
-- `stamp_anchor` column to the PARENT `studio_generations` recording the corner
-- the customer ASKED for; this `stamped_anchor` on the CHILD image records the
-- corner the mark actually LANDED in. Different tables, different questions.


-- ── 1 of 2 · the corner the mark actually landed in ────────────────────────────
-- Text with a check, and the check lists exactly the four `STAMP_ANCHORS` values
-- from `@sahoda/shared`, spelled with HYPHENS. This is the vocabulary the whole
-- system already speaks: `StampAnchorSchema`, the `Anchor` type in
-- `logo-placement.ts` and `AnchorChoice.to` in `corner-choice.ts` all carry these
-- same four strings. The constraint admits ONLY these four so a stray spelling
-- ('bottomright', 'bottom_right') cannot land here later and be read as a corner.
alter table studio_generation_images
  add column if not exists stamped_anchor text;

do $$
begin
  alter table studio_generation_images
    add constraint studio_generation_images_stamped_anchor_check
    check (stamped_anchor is null or stamped_anchor in
      ('bottom-right', 'bottom-left', 'top-right', 'top-left'));
exception
  when duplicate_object then null;
end
$$;

comment on column studio_generation_images.stamped_anchor is
  'The corner the logo mark was actually stamped in, in the shared STAMP_ANCHORS '
  'vocabulary (bottom-right, bottom-left, top-right, top-left, with hyphens). NULL '
  'means the corner was not recorded: every row written before this shipped, any '
  'deploy where this column is not applied, and any image that carries no mark at '
  'all (no logo, skipped, or a stamp that failed). NULL is never "stamped where '
  'asked" and must not be rendered as one. When the mark went where the customer '
  'chose this holds that chosen corner and stamp_anchor_moved_reason is NULL; when '
  'it moved this holds the DESTINATION corner and stamp_anchor_moved_reason says why.';


-- ── 2 of 2 · why it moved, when it did ─────────────────────────────────────────
-- Only ever set alongside a non-null stamped_anchor, and only when the mark moved
-- off the chosen corner. NULL is the ordinary case: the mark landed where asked,
-- or none was placed. Two values, matching STAMP_ANCHOR_MOVE_REASONS in
-- `@sahoda/shared` and `AnchorChoice.reason` in `corner-choice.ts`, because they
-- are two different sentences to a shop owner: 'busy' is a design call about a
-- crowded corner, 'unreadable' is a legibility call about contrast. Neither has a
-- remedy the reader owns, which is why they are recorded to be STATED, not acted on.
alter table studio_generation_images
  add column if not exists stamp_anchor_moved_reason text;

do $$
begin
  alter table studio_generation_images
    add constraint studio_generation_images_stamp_anchor_moved_reason_check
    check (stamp_anchor_moved_reason is null or stamp_anchor_moved_reason in
      ('busy', 'unreadable'));
exception
  when duplicate_object then null;
end
$$;

comment on column studio_generation_images.stamp_anchor_moved_reason is
  'Why the mark landed somewhere other than the corner the customer chose: busy '
  '(the chosen corner was too busy behind the mark) or unreadable (the mark would '
  'not have cleared contrast in the chosen corner). NULL means the mark was not '
  'moved: it went where asked, or none was placed. Set only alongside a non-null '
  'stamped_anchor holding the destination corner. Recorded when stamping ran, '
  'never derived at read time, because the corner a picture drawn last week landed '
  'in cannot be re-measured from today''s picture.';


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   alter table studio_generation_images
--     drop constraint if exists studio_generation_images_stamp_anchor_moved_reason_check;
--   alter table studio_generation_images drop column if exists stamp_anchor_moved_reason;
--   alter table studio_generation_images
--     drop constraint if exists studio_generation_images_stamped_anchor_check;
--   alter table studio_generation_images drop column if exists stamped_anchor;
--
-- Dropping this loses WHICH corner each mark landed in and WHY it moved. No file is
-- lost and no pointer dangles: these two columns never held bytes or ids, and
-- asset_id, stamped_asset_id and stamp_outcome are untouched. The result screen
-- falls back to saying nothing about placement, which is the same honest silence
-- it shows for a row written before this shipped.
