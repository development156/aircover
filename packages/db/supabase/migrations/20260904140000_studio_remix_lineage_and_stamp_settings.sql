-- ─────────────────────────────────────────────────────────────────────────────
-- A generation may name the generation it was remixed FROM, and may record the
-- stamp settings the press was made with
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY, AND WHY IT IS TWO THINGS IN ONE FILE.
-- Studio is gaining a remix view: opening a picture refills the composer from
-- the row that made it, and pressing Draw again either JOINS that picture's
-- versions or starts a new picture from the same starting point. The customer
-- chooses which with a control that is ON by default.
--
-- Almost everything that view needs is already on `studio_generations`:
-- `prompt_given`, `model_id`, `mode`, `format_id`, `width`, `height`,
-- `requested_count`, `reference_asset_ids`, `brand_signals` and `seed`. Two
-- things are not, and they fail in DIFFERENT ways, which is why both are here:
-- the lineage cannot be reconstructed at all, and the stamp settings can be
-- reconstructed WRONGLY, which is worse.
--
--   1. There is no link between a remix and the picture it came from. Nothing
--      in the schema can express "a version of that one", so the history has to
--      show every press as a peer and a shop owner sees nine near-identical
--      tiles instead of one idea with nine versions.
--
--   2. `StampOptions` — whether to stamp, which corner, what size step — is a
--      per-request input to the generate action and is NEVER PERSISTED.
--      `studio_generation_images.stamp_outcome` records what HAPPENED
--      ('stamped', 'no_logo', 'logo_unreadable', 'failed', 'skipped'), which is
--      a different fact: it says the mark went on, not where the customer asked
--      for it. So a remix restoring "everything" would silently fall back to
--      today's DEFAULT corner and size — right for most pictures and wrong for
--      every one drawn with a different corner.
--
-- That second failure is the one this project has already met once. The result
-- screen shows "Exact placement: coming soon" behind a lock instead of a
-- measurement, precisely because nothing recorded the anchor, and a number that
-- is usually right is the failure mode this product's rules exist to prevent.
-- These columns are what turn that lock into a fact, and what let a remix
-- restore a press honestly rather than approximately.
--
-- WHAT THIS FILE DOES. Adds four nullable columns to `studio_generations`. No
-- backfill, and the reason is different for each pair: the lineage has no prior
-- signal to read (no press before this file was ever a remix), and the stamp
-- settings were genuinely not captured, so any value invented for an existing
-- row would be a guess wearing the clothes of a record.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. Every column
-- is nullable and additive, nothing reads them until `apps/web` is changed, and
-- generation, charging, stamping and the result screen are all untouched.
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping
-- these loses the version lineage of any remix made in the meantime and the
-- recorded stamp settings of any press made in the meantime. No picture is
-- lost: every generation row, every asset and every stamped copy is untouched,
-- and the screens fall back to exactly the behaviour they have today.
--
-- APPLY ORDER: after 20260829210000_studio_generations.sql (the table) and
-- after 20260831150000_studio_stamped_asset.sql (which added `stamp_outcome`,
-- the column these are deliberately NOT a duplicate of).


-- ── 1 of 4 · the lineage pointer ───────────────────────────────────────────────
-- Self-referential and nullable. NULL is the overwhelmingly common case and
-- means "this press stands on its own", which is true of every row written
-- before this file and of every press made with the remix control turned off.
--
-- `on delete set null`, not cascade, and the direction matters: deleting an
-- original must never delete the pictures somebody made from it. A remix whose
-- parent is gone becomes a standalone picture, which is a true statement about
-- what is left, rather than a pointer at a row that no longer exists.
alter table studio_generations
  add column if not exists remixed_from uuid references studio_generations (id) on delete set null;

comment on column studio_generations.remixed_from is
  'The studio_generations row this press was remixed from, or NULL when it '
  'stands on its own. NULL is the common case and means "not a remix", never '
  '"parent unknown". Set when the customer pressed Draw with the remix control '
  'on; left NULL when they turned it off, which starts a new picture from the '
  'same prompt and settings. On a hard delete of the parent this is set to '
  'NULL, so a remix outlives its original as a standalone picture.';


-- ── 2 of 4 · the index the set-null action and the version list both need ──────
-- Two readers, one index. `on delete set null` has to find every child of a row
-- being deleted, and the remix view lists a picture's versions by parent. Both
-- are lookups by `remixed_from`, and without an index both are a full scan.
-- Partial because a NULL pointer is not a child of anything and is never the
-- answer to either question.
create index if not exists studio_generations_remixed_from_idx
  on studio_generations (remixed_from)
  where remixed_from is not null;


-- ── 3 of 4 · the tenancy guard ─────────────────────────────────────────────────
-- A composite foreign key on `(remixed_from, workspace_id) references
-- studio_generations (id, workspace_id)` cannot be used here for the same
-- reason the logo columns could not use one: `on delete set null` would then
-- try to null `workspace_id`, which is `not null` and is the tenancy key. So
-- the cross-tenant check is a trigger, following the shape of
-- `app.workspaces_logo_same_tenant` exactly.
--
-- It raises when the parent generation belongs to a different workspace. A NULL
-- pointer passes untouched: not being a remix is always allowed.
create or replace function app.studio_generations_remix_same_tenant() returns trigger
language plpgsql as $$
declare
  v_owner uuid;
begin
  if new.remixed_from is null then
    return new;
  end if;

  select g.workspace_id into v_owner
    from studio_generations g
   where g.id = new.remixed_from;

  if v_owner is null then
    raise exception
      'remixed_from % does not exist', new.remixed_from
      using errcode = '23503';
  end if;

  if v_owner <> new.workspace_id then
    raise exception
      'remixed_from % belongs to another workspace', new.remixed_from
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger studio_generations_remix_same_tenant
  before insert or update of remixed_from on studio_generations
  for each row execute function app.studio_generations_remix_same_tenant();


-- ── 4 of 4 · the stamp settings, as ASKED FOR rather than as they turned out ───
-- Three columns and not one jsonb blob, because each is a closed set the screen
-- already knows how to render and a check constraint can hold. A blob would
-- accept 'bottomright', 'bottom-right' and 'BR' with equal enthusiasm.
--
-- All three nullable, and NULL means "not recorded", which is the honest answer
-- for every row written before this file. It must never be read as "off" or as
-- "the default": the whole point of these columns is that a default standing in
-- for a record is the defect. A remix reading NULL here says so on screen
-- rather than restoring a corner nobody chose.
--
-- The anchor and size vocabularies are `STAMP_ANCHORS` and `STAMP_SIZE_STEPS`
-- in packages/shared/src/studio/generation.ts. The constraint repeats them
-- because the database is the other producer and TypeScript never sees a row.
--
-- REPEATING A VOCABULARY IS HOW IT DRIFTS, AND THIS ONE DID. Until 2026-09-04
-- this constraint read 'top_left', 'top_right', 'bottom_left', 'bottom_right',
-- with UNDERSCORES, while `STAMP_ANCHORS` has always been hyphenated. The two
-- lines directly above claimed the constraint repeated the constant and it did
-- not, so the first write of a real anchor would have been rejected by a check
-- constraint whose comment said it would pass. Caught while adding
-- `studio_generation_images.stamped_anchor` (20260904160000), whose own
-- constraint is hyphenated, by an agent that went to look rather than trusting
-- the claim in this comment. The file was still unapplied, so this is a fix to
-- an unapplied migration and not a rewrite of history.
alter table studio_generations
  add column if not exists stamp_enabled boolean,
  add column if not exists stamp_anchor text,
  add column if not exists stamp_size_step text;

alter table studio_generations
  drop constraint if exists studio_generations_stamp_anchor_check;
alter table studio_generations
  add constraint studio_generations_stamp_anchor_check
  check (stamp_anchor is null or stamp_anchor in
    ('top-left', 'top-right', 'bottom-left', 'bottom-right'));

alter table studio_generations
  drop constraint if exists studio_generations_stamp_size_step_check;
alter table studio_generations
  add constraint studio_generations_stamp_size_step_check
  check (stamp_size_step is null or stamp_size_step in ('small', 'medium', 'large'));

comment on column studio_generations.stamp_enabled is
  'Whether the customer asked for their logo on this press, or NULL when it was '
  'not recorded (every row written before 2026-09-04). NULL is NOT "off": a '
  'press that was never asked about and a press somebody turned off are '
  'different facts, and studio_generation_images.stamp_outcome already '
  'distinguishes what HAPPENED. This column records what was ASKED FOR.';

comment on column studio_generations.stamp_anchor is
  'The corner the customer chose for the logo on this press, or NULL when not '
  'recorded. Never defaulted on read: a remix that restored a corner nobody '
  'chose would be right for most pictures and wrong for the rest.';

comment on column studio_generations.stamp_size_step is
  'The size step the customer chose for the logo on this press, or NULL when '
  'not recorded. Same rule as stamp_anchor: NULL is stated, never filled in.';


-- ── NO BACKFILL, AND WHY NOT FOR EITHER PAIR ──────────────────────────────────
-- `remixed_from`: no press before this file could have been a remix, because
-- there was no way to make one. Every existing row is correctly NULL.
--
-- The stamp columns: the settings were genuinely not captured. They could be
-- guessed from `stamp_outcome` — a row that says 'stamped' was presumably
-- enabled — but 'stamped' says the mark went on, not which corner it went in,
-- and DEFAULT_STAMP_OPTIONS is exactly the guess this file exists to stop. A
-- NULL a screen reports honestly beats a value it cannot justify.


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   drop trigger if exists studio_generations_remix_same_tenant on studio_generations;
--   drop function if exists app.studio_generations_remix_same_tenant();
--   drop index if exists studio_generations_remixed_from_idx;
--   alter table studio_generations
--     drop constraint if exists studio_generations_stamp_anchor_check,
--     drop constraint if exists studio_generations_stamp_size_step_check;
--   alter table studio_generations
--     drop column if exists remixed_from,
--     drop column if exists stamp_enabled,
--     drop column if exists stamp_anchor,
--     drop column if exists stamp_size_step;
--
-- Dropping these loses the version lineage of any remix made in the meantime,
-- and the recorded stamp settings of any press made in the meantime. No picture
-- is lost: every generation row, every asset and every stamped copy is
-- untouched, and both screens fall back to the behaviour they have today, which
-- is a history of peers and a locked placement readout.
