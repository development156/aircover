-- ─────────────────────────────────────────────────────────────────────────────
-- The logo-stamped copy of a generated image becomes its own asset, recorded
-- beside the original it was made from
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- The Studio generates a picture, stores it as an `assets` row, and records it on
-- `studio_generation_images.asset_id` (20260829210000). A new step stamps the
-- workspace's logo onto that picture. The stamped picture is an ADDITIONAL asset:
-- the model's original stays primary and keeps being what
-- `studio_generation_images.asset_id` names. There is nowhere to record WHICH
-- asset is the stamped copy, so today the stamp would either overwrite the
-- original (destroying the un-stamped bytes the customer paid for) or float free
-- of the generation that produced it.
--
-- WHAT THIS FILE DOES. Adds `studio_generation_images.stamped_asset_id`, a
-- nullable pointer at the `assets` row holding the logo-stamped copy. It follows
-- `asset_derivatives` (20260821000001) exactly: the derived file is a new object,
-- the original is never modified and never deleted, and the column that names the
-- original (`asset_id`) is left untouched. It carries a tenancy trigger so the
-- pointer can only name a file in the SAME workspace, and a partial index so a
-- hard-deleted stamped asset can find the rows pointing at it.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. The column is
-- new, nullable, has no default, and nothing reads it yet. Every existing
-- `studio_generation_images` row keeps `stamped_asset_id` null, which is the
-- "not stamped" case and stays supported forever. `asset_id` and the provenance
-- it anchors are untouched.
--
-- REVERSIBLE: yes. See the ROLLBACK block at the foot of this file. Dropping it
-- loses only WHICH asset was the stamped copy of each image. No file is lost: the
-- pointer never held bytes, and both the original and the stamped `assets` rows
-- are untouched.
--
-- APPLY ORDER: after 20260829210000_studio_generations.sql (the
-- `studio_generation_images` table this alters) and after
-- 20260819000400_assets.sql (the `assets` table and its `unique (id,
-- workspace_id)`). Independent of the two logo migrations earlier today.


-- ── 1 of 5 · the pointer ────────────────────────────────────────────────────────
-- `on delete set null` and NOT cascade, deliberately, and this is the catastrophe
-- to design against. Deleting the STAMPED copy must leave the generation record
-- and its ORIGINAL picture intact. A cascade here would delete the record of a
-- generation the customer PAID FOR the moment a stamped copy was tidied out of the
-- library, and the answer to "why did this cost me six credits" would vanish with
-- a file that was never the point. The same choice `asset_id` makes one column
-- over, and for the same reason.
alter table studio_generation_images
  add column if not exists stamped_asset_id uuid references assets (id) on delete set null;

comment on column studio_generation_images.stamped_asset_id is
  'The assets row holding the logo-stamped copy of this image, or NULL. The '
  'original stays primary and is named by asset_id; this is an ADDITIONAL asset. '
  'NULL is never an error and covers three cases the copy must not conflate: the '
  'workspace has no logo to stamp, stamping was not attempted, and stamping was '
  'attempted and failed. On a hard delete of the stamped asset this is set to '
  'NULL by the foreign key, so it never dangles.';


-- ── 2 of 5 · WHY, recorded when it happened ────────────────────────────────────
-- Text with a check rather than a Postgres enum: adding a value to an enum type
-- is a migration and a lock, and this vocabulary will grow the first time a new
-- way of not-stamping appears. `not null` is deliberately NOT set — see step 5.
alter table studio_generation_images
  add column if not exists stamp_outcome text;

do $$
begin
  alter table studio_generation_images
    add constraint studio_generation_images_stamp_outcome_check
    check (stamp_outcome is null or stamp_outcome in
      ('stamped', 'no_logo', 'logo_unreadable', 'failed'));
exception
  when duplicate_object then null;
end
$$;

comment on column studio_generation_images.stamp_outcome is
  'Why this image does or does not carry the workspace logo, recorded when the '
  'stamping ran: stamped, no_logo, logo_unreadable, failed. NULL means stamping '
  'was never attempted, which is every row written before this shipped. Kept '
  'because the pointer beside it cannot answer the question: its NULL is one '
  'fact standing in for several situations, each a different sentence on a '
  'screen. Never derived at read time — the present cannot testify about the past.';


-- ── 3 of 5 · the index the set-null action needs ───────────────────────────────
-- `on delete set null` has to find every image row referencing a stamped asset at
-- the moment that asset is hard-deleted. Without an index that lookup is a full
-- scan of `studio_generation_images` per delete. Partial because a NULL pointer
-- references nothing and never needs to be found this way. (`asset_id` already has
-- its own index from 20260829210000; this is the matching one for the new column.)
create index if not exists studio_generation_images_stamped_asset_idx
  on studio_generation_images (stamped_asset_id)
  where stamped_asset_id is not null;


-- ── 4 of 5 · the tenancy guard ─────────────────────────────────────────────────
-- The plain foreign key above proves the stamped asset EXISTS. It cannot prove the
-- asset belongs to the SAME workspace as the image row pointing at it. A composite
-- foreign key `(stamped_asset_id, workspace_id) references assets (id,
-- workspace_id)` cannot express it here, and this is the trap: with `on delete set
-- null` that composite key would try to null BOTH columns on delete, including
-- `workspace_id`, which is `not null`. Yesterday's 20260831090000 hit exactly this
-- and reached for a trigger for the same reason. So this is a trigger, not a
-- composite key.
--
-- It raises when the stamped asset's `workspace_id` is not the image row's own
-- `workspace_id`. A NULL pointer passes untouched: an un-stamped image is always
-- allowed. The FK's own set-null on delete arrives as a nested statement
-- (`pg_trigger_depth() > 1`) with a NULL value, so this trigger waves it through
-- on the first branch and the append-only `block_mutations` trigger on this table
-- permits it as a knock-on effect, exactly as it already does for `asset_id`.
create or replace function app.studio_generation_images_stamped_same_tenant() returns trigger
language plpgsql as $$
declare
  v_owner uuid;
begin
  if new.stamped_asset_id is null then
    return new;
  end if;

  select a.workspace_id into v_owner
    from assets a
   where a.id = new.stamped_asset_id;

  if v_owner is distinct from new.workspace_id then
    raise exception
      'stamped_asset_id % does not belong to workspace %',
      new.stamped_asset_id, new.workspace_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger studio_generation_images_stamped_same_tenant
  before insert or update of stamped_asset_id on studio_generation_images
  for each row execute function app.studio_generation_images_stamped_same_tenant();


-- ── 5 of 5 · what NULL means, now that something records it ────────────────────
-- This step used to be prose and nothing else. It said the copy reading
-- `stamped_asset_id` must never collapse its NULL cases into one, and then left
-- the screen no way to tell them apart: a pointer's NULL is a single fact
-- standing in for a workspace with no logo, an image stamping never ran on, and
-- an image stamping ran on and failed. A rule with no mechanism is a rule that
-- gets broken by whoever writes the screen.
--
-- `stamp_outcome` (step 2) is that mechanism, and NULL on IT keeps a meaning of
-- its own: stamping was never attempted. That is true of every row written before
-- this shipped and of any deploy where step 2 has not been applied, and it is why
-- the column is nullable with no default and no backfill. Inventing a value for
-- an old row would be asserting something about a run that never happened.
--
-- WHY NOT DERIVE IT AT READ TIME. Every derivation asks about the past by looking
-- at the present. "This workspace has no logo" is true NOW and says nothing about
-- last Tuesday; a shop that uploads a logo today would have every older picture
-- silently re-explained. `packages/shared`'s `StampOutcomeSchema` carries the
-- same reasoning for the application side.


-- ── ROLLBACK ───────────────────────────────────────────────────────────────────
--   drop trigger if exists studio_generation_images_stamped_same_tenant
--     on studio_generation_images;
--   drop function if exists app.studio_generation_images_stamped_same_tenant();
--   drop index if exists studio_generation_images_stamped_asset_idx;
--   alter table studio_generation_images
--     drop constraint if exists studio_generation_images_stamp_outcome_check;
--   alter table studio_generation_images drop column if exists stamp_outcome;
--   alter table studio_generation_images drop column if exists stamped_asset_id;
--
-- Dropping this loses WHICH asset was the logo-stamped copy of each image and WHY
-- an image has none. No
-- file is lost: the pointer never held bytes, the original `assets` row and its
-- `asset_id` link are untouched, and every stamped `assets` row survives on its
-- own.
