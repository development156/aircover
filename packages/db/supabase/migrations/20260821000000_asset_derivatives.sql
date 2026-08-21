-- ─────────────────────────────────────────────────────────────────────────────
-- A6 · derivatives — the cropped copies, and the record of where each came from
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS FOR. One uploaded photo has to become the right shape for every
-- channel it is going to. Instagram declares an aspect band (0.75–1.91 for a feed
-- post, measured against Zernio's own validator); a 9:16 phone photo is outside
-- it and is refused at attach time today. The product is going to OFFER a crop
-- instead — showing it first, letting the person move the focal point, and
-- writing nothing until they accept.
--
-- The cropped copy is a NEW object. The original is never modified and never
-- deleted, so a wrong crop is always recoverable: the file the customer uploaded
-- is still there, byte for byte, and the derivative is a separate row pointing at
-- a separate object.
--
-- ── WHY DERIVATIVES ARE NOT JUST MORE `assets` ROWS ─────────────────────────
-- This is the whole design decision, and getting it wrong opens a data-loss path
-- that looks exactly like the one 20260820000000 was written to close.
--
-- The delete gate works like this: `app.assert_asset_not_in_use()` reads
-- `asset_usages`, which is written by a trigger from `post_media.asset_id`. So
-- the gate can only see an attachment that NAMES ITS ASSET.
--
-- If a derivative were its own `assets` row and `post_media.asset_id` pointed at
-- the DERIVATIVE, then deleting the ORIGINAL would find no usage rows, the
-- trigger would find nothing to refuse, and a post scheduled for Thursday would
-- lose its photo silently. That is the back door, and it is opened by a schema
-- choice rather than by any line of application code.
--
-- So a derivative is a CHILD of its asset, in its own table, cascading from it.
-- `post_media.asset_id` keeps naming the ORIGINAL, and a new nullable
-- `derivative_id` says which cropped copy of that original is actually attached.
-- The gate, the trigger, the `asset_usages` record and the RPC are all untouched
-- and all keep working — because from their point of view nothing changed: the
-- post still uses the asset.
--
-- ── AND THE BACK DOOR IS CLOSED BY A CONSTRAINT, NOT BY A CONVENTION ────────
-- Section 3 adds `post_media_derivative_needs_asset`: a row may not name a
-- derivative without also naming the asset it came from. Without that check,
-- application code could one day write `derivative_id` with a null `asset_id`
-- and re-open the exact hole this table shape exists to close — and it would
-- look, in the diff, like a small omission rather than a data-loss bug.
--
-- The composite foreign key beside it goes further: `post_media` can only point
-- at a derivative OF THE ASSET IT NAMES. A row claiming asset A while carrying a
-- crop of asset B cannot be written at all.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- It does not read, change, move or delete a single existing row. Every
-- `post_media` row in this database keeps `derivative_id` null, which is the
-- "the original itself is attached" case and stays supported forever. The
-- publisher's query (`select storage_path, mime, bytes from post_media`) is
-- untouched and does not read the new column — it does not have to, because the
-- `storage_path` of a cropped attachment IS the derivative's path.
--
-- IF THIS FILE IS WRONG: no crop offer. Nothing that works today stops working;
-- every object it creates is new and the one column it adds is nullable with no
-- default.
--
-- REVERSIBLE: yes —
--   alter table post_media drop constraint post_media_derivative_of_asset_fk;
--   alter table post_media drop constraint post_media_derivative_needs_asset;
--   alter table post_media drop column derivative_id;
--   drop table asset_derivatives;
-- Dropping them discards the record of which crop is attached. No original and
-- no post is lost; the derivative OBJECTS would be orphaned in storage and can
-- be swept by prefix (`<workspace>/derivatives/`).
--
-- APPLY ORDER: after 20260820000100_delete_asset_rpc.sql. Independent of
-- everything else in the batch.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- The cropped copies.
--
-- IF THIS IS WRONG: crops cannot be recorded, so none can be offered. Originals
-- and existing attachments are untouched.
create table asset_derivatives (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- The ORIGINAL this was cut from. `on delete cascade`, and deliberately so: a
  -- derivative has no meaning without its original, and the original cannot be
  -- deleted at all while a committed post uses it — that refusal is the trigger
  -- in 20260820000000, which still fires first because it is a BEFORE trigger on
  -- `assets`. So the cascade can only ever run once the gate has allowed it.
  asset_id uuid not null,

  -- Where the cropped bytes sit: `<workspace>/derivatives/<asset>/<id>.<ext>`.
  -- First segment is the workspace uuid, which is the entire tenant boundary the
  -- storage policy reads, so the existing `media` bucket rules cover this folder
  -- with no change. See apps/web/src/lib/posts/media-path.ts.
  storage_path text not null,

  -- ── THE IDEMPOTENCY KEY ───────────────────────────────────────────────────
  -- Everything that determines the BYTES: the crop rectangle and the output
  -- encoding. Re-running the same crop of the same file finds this row and mints
  -- nothing, which is what stops a person who opens the crop screen twice from
  -- paying for two identical objects.
  --
  -- The channel set is deliberately NOT part of it. Two different channel sets
  -- that resolve to the same rectangle produce the same bytes, and minting a
  -- second identical object to record a second audience would be storage spent
  -- on nothing. The audience is recorded in `channels` below instead, and a
  -- reuse extends that array.
  recipe text not null,

  -- ── THE RECORD THE BRIEF ASKS FOR: WHICH CHANNELS, WHICH FORMAT ───────────
  -- Which channels this crop was cut for and verified against, and what the
  -- version said it was. `format` is null when no version stated an intent,
  -- which is the truth about every variant written before the column existed.
  channels text[] not null default '{}',
  format text,

  -- The rectangle, in the ORIGINAL's pixel coordinates. Stored rather than
  -- recomputed so the crop can always be explained — and so a future reader can
  -- see exactly what was removed without having both files in front of them.
  crop_x int not null,
  crop_y int not null,
  crop_w int not null check (crop_w > 0),
  crop_h int not null check (crop_h > 0),

  -- Where the person said the subject was, as fractions of the original. Kept so
  -- re-opening the crop screen starts where they left it rather than snapping
  -- back to the centre.
  focal_x real not null default 0.5 check (focal_x >= 0 and focal_x <= 1),
  focal_y real not null default 0.5 check (focal_y >= 0 and focal_y <= 1),

  -- Facts about the derivative FILE, established by sniffing the bytes sharp
  -- produced — never by predicting them. The Constraint Engine is re-run against
  -- these before anything is attached, so a crop that did not actually fix the
  -- problem is refused rather than stored.
  mime text not null,
  bytes bigint not null,
  width int not null check (width > 0),
  height int not null check (height > 0),

  created_by text,
  created_at timestamptz not null default now(),

  -- Same crop of the same file, once.
  unique (asset_id, recipe),
  unique (workspace_id, storage_path),

  -- Lets `post_media` name a derivative AND its asset in one link — see section 3.
  unique (id, asset_id),

  -- Names the customer as well as the file, exactly as `asset_usages` does. This
  -- is the line that makes it impossible, rather than unlikely, for one
  -- customer's crop to hang off another customer's photo.
  foreign key (asset_id, workspace_id) references assets (id, workspace_id) on delete cascade
);


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- The reads: "my crops of this photo" and the tenant scoping every policy needs.
create index on asset_derivatives (workspace_id);
create index on asset_derivatives (asset_id);


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- Which cropped copy is on this post.
--
-- Nullable forever: an attachment of the original itself has no derivative, and
-- that is the ordinary case rather than a gap to be backfilled.
--
-- IF THIS IS WRONG: a cropped attachment cannot say which crop it is. Existing
-- rows are unaffected.
alter table post_media add column derivative_id uuid;

-- THE CHECK THAT KEEPS THE DELETE GATE WHOLE.
--
-- The gate sees an attachment through `asset_id`. A row that named a derivative
-- but no asset would be invisible to it — the original could then be deleted out
-- from under a scheduled post, which is precisely the failure 20260820000000
-- exists to prevent, arriving through a door this migration would have opened.
--
-- Stated as a constraint rather than as a rule in the server action, because a
-- rule in a server action is a rule exactly one caller has.
alter table post_media add constraint post_media_derivative_needs_asset
  check (derivative_id is null or asset_id is not null);

-- …and the derivative must be a crop OF THE ASSET THIS ROW NAMES.
--
-- With MATCH SIMPLE (the default) this is not enforced when either column is
-- null, which is exactly right: a direct upload has neither, and a library
-- attachment of the original has an asset and no derivative. When both are
-- present they must agree, so a row claiming asset A while carrying a crop of
-- asset B cannot exist.
alter table post_media add constraint post_media_derivative_of_asset_fk
  foreign key (derivative_id, asset_id) references asset_derivatives (id, asset_id)
  on delete restrict;

create index post_media_derivative_id_idx on post_media (derivative_id);


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- Security. Members manage their own crops; every rule is scoped to
-- `workspace_id`, so one customer can never list, read or write another's.
--
-- IF THIS IS WRONG in the loose direction: one customer could enumerate another's
-- cropped files. Worth reading twice before applying.
select app.apply_tenant_policies('asset_derivatives');


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- Every path this table can hold sits under the workspace's own prefix.
--
-- The `media` bucket's policy reads `(storage.foldername(name))[1]` and nothing
-- else, so a derivative whose path did not start with its own workspace uuid
-- would be an object the owner cannot reach and, if the prefix happened to be
-- another workspace's, one THEY could. The path is built by a single module that
-- refuses anything but a canonical uuid; this is the database saying the same
-- thing, so a future writer that bypasses that module is refused here.
alter table asset_derivatives add constraint asset_derivatives_path_scoped
  check (storage_path like workspace_id::text || '/derivatives/%');


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- Documentation that travels with the schema rather than only in a file.
comment on table asset_derivatives is
  'Cropped copies of a library file, one row per distinct crop. The original is '
  'never modified or deleted to make one. Cascades from assets, so a derivative '
  'cannot outlive its original — and cannot be deleted ahead of it either, '
  'because the delete gate on assets is a BEFORE trigger that refuses first.';

comment on column asset_derivatives.recipe is
  'Everything that determines the bytes: the crop rectangle and the output '
  'encoding. The idempotency key — re-running the same crop mints nothing. The '
  'channel set is not part of it; identical bytes are one object.';

comment on column post_media.derivative_id is
  'Which cropped copy of `asset_id` is attached here, or null when the original '
  'itself is. Never present without `asset_id` — a check enforces that, because '
  'the delete gate can only see an attachment that names its asset.';
