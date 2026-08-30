-- ─────────────────────────────────────────────────────────────────────────────
-- studio_generations · the record of WHY an image looks the way it does,
-- which is also the queue that stops one being lost
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS EXISTS, AND WHY IT IS ONE TABLE AND NOT TWO SYSTEMS.
--
-- The Studio generates images with a model. That has two consequences the rest of
-- this product does not have to deal with anywhere else:
--
--   · IT COSTS REAL MONEY, per press, and it is spent before anything is shown.
--   · IT TAKES BETWEEN EIGHT SECONDS AND THREE MINUTES, which is far longer than a
--     person will sit and watch, and far longer than a browser tab reliably lives.
--
-- Both of those are the same requirement in the end: the request has to exist
-- somewhere OUTSIDE the browser from the moment it is made. A generation held only
-- in a React state is a generation destroyed by a Back press, and this codebase has
-- already measured that pressing Back inside this app does not unmount the segment,
-- does not fire `pagehide` and does not fire `beforeunload`
-- (apps/web/src/components/posts/use-flush-on-leave.ts). A server action cannot
-- outlive the navigation that started it. So the row is written FIRST, the model is
-- called against the row, and the answer is written back to it. A person who
-- refreshes, navigates away, locks their phone, or comes back tomorrow finds the
-- result waiting, because the result was never in their browser to begin with.
--
-- The provenance and the queue are therefore the SAME ROW. Splitting them would
-- mean writing the request twice and inventing a way to keep the two in step.
--
-- WHAT PROVENANCE MEANS HERE, PRECISELY.
--
-- A person must be able to point at an image and ask "why does it look like this",
-- and get an answer that is not a guess. And a REGENERATION that changes one thing
-- has to hold everything else fixed, which is impossible unless everything else was
-- written down: the prompt as actually sent, the model, the seed, every reference
-- image, which Brand Brain fields conditioned it and whether each of those was
-- CONFIRMED by the customer or INFERRED by us, the format, and the cost.
--
-- That last pair is the one that is easy to skip and expensive to add later. A
-- picture built partly from a fact the customer confirmed and partly from something
-- Sahoda guessed is not the same artefact as one built entirely from confirmed
-- facts, and the screen is required to say which. Storing the field NAMES without
-- their certainty would make that distinction unrecoverable.
--
-- IF THIS FILE IS WRONG: the Studio cannot queue or record a generation, and the
-- feature does not work. Nothing that exists today reads these tables, so nothing
-- currently working breaks. The application checks for its tables at runtime and
-- degrades to an honest "not available" rather than an error page.
--
-- REVERSIBLE: in structure yes, by dropping the two tables. NOT in data: the
-- provenance of every image already generated would go with them, and it cannot be
-- reconstructed from the images themselves. Nothing else depends on these tables.
--
-- APPLY ORDER: independent. Requires only `workspaces` and `assets`, both of which
-- long predate it.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- The generation. One row per PRESS, not per image: a series of five slides is one
-- generation with five images beneath it, because that is what a person asked for
-- and what they were charged for.
create table studio_generations (
  id uuid primary key default gen_random_uuid(),

  -- Which customer's. Every rule at the bottom of this file is written against it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- ── THE QUEUE HALF ──────────────────────────────────────────────────────────
  --
  -- 'queued'    written, paid for, not yet sent to a model
  -- 'running'   sent, waiting on the provider
  -- 'ready'     images exist and are in the library
  -- 'failed'    the provider refused or broke; see error_code
  -- 'cancelled' the person stopped it before it was sent
  --
  -- Spelled out so a typo becomes an error rather than a row no screen will ever
  -- show. There is no 'partial': a series that produced three of five images is
  -- 'failed' with three images beneath it, and the screen says exactly that,
  -- because "ready" would be a claim the row cannot support.
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'cancelled')),

  -- What the person chose. Each means something different about how the prompt was
  -- built, so it is provenance, not a preference.
  --
  -- 'on_brand' full Brand Brain conditioning plus approved references
  -- 'explore'  loose, high variation, cheap model, for finding a direction
  -- 'match'    conditioned on one existing image the person picked
  -- 'series'   N slides with consistency locked across them
  mode text not null check (mode in ('on_brand', 'explore', 'match', 'series')),

  -- ── THE PROVENANCE HALF ─────────────────────────────────────────────────────

  -- What the PERSON typed, kept exactly as typed. Shown back to them, and the
  -- starting point when they ask for another like this one.
  prompt_given text not null,

  -- What was ACTUALLY SENT to the model, after Brand Brain conditioning was folded
  -- in. Held apart from `prompt_given` deliberately and it is the more important of
  -- the two: it is the only honest answer to "why does it look like this", and
  -- reconstructing it later from the brain's CURRENT state would be a lie the
  -- moment anybody edits their brand. Null while queued, set when sent.
  prompt_sent text,

  -- The model, exactly as addressed, and who served it. Both, because the same
  -- model reached through two providers is not guaranteed to be the same weights,
  -- the same version or the same price.
  provider text,
  model_id text,

  -- 'draft' or 'finish': what the PERSON chose. Deliberately not called
  -- `model_tier`, because `ModelTier` already exists in this codebase and means
  -- something else — the Model Mesh's five-deep routing tier (nano, economy,
  -- standard, premium, research), which is an engineering decision about which
  -- model answers a call. This is the product decision a shop owner makes
  -- between "still looking" and "this is the one". An image tier maps onto a
  -- mesh tier; it is not one, and one column cannot be both.
  --
  -- Recorded rather than derived from `model_id`, because the routing table
  -- changes monthly and a row that outlives its rule must still be able to say
  -- which tier it was. A peer found ledger rows displaying a model tier they did
  -- not hold; this is that defect refused in advance.
  image_tier text check (image_tier in ('draft', 'finish')),

  -- The seed, when the provider exposes one. This is what makes a regeneration able
  -- to hold everything constant except the one thing being changed. Null means the
  -- provider gave us none, which is not the same as zero, and every reader has to
  -- keep those apart.
  seed bigint,

  -- The format, as chosen from the Constraint Engine. `format_id` and `channel` are
  -- what the person picked; the pixels are stored beside them because a format's
  -- dimensions can be tightened later and this row must still describe the image
  -- that actually exists.
  format_id text,
  channel text,
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),

  -- How many images this press asked for. One for a single image, N for a series.
  requested_count int not null default 1 check (requested_count between 1 and 20),

  -- Reference images that conditioned this generation, as asset ids. An array
  -- rather than a join table: it is ordered, it is small and bounded, it is never
  -- queried across rows, and it is written once and read whole.
  --
  -- NOT foreign-keyed, deliberately. A reference that is later deleted from the
  -- library must not delete or blank this record: what conditioned the image is a
  -- historical fact and stays true after the file is gone. The screen resolves what
  -- it can and says plainly when a reference no longer exists.
  reference_asset_ids uuid[] not null default '{}',

  -- WHICH BRAND BRAIN FIELDS CONDITIONED THIS, AND HOW SURE WE WERE OF EACH.
  --
  -- Shape, enforced by zod in packages/shared rather than by a check constraint,
  -- because it is a list and Postgres cannot validate one cheaply:
  --
  --   [{ "field": "palette", "certainty": "confirmed", "value": "..." },
  --    { "field": "audience", "certainty": "inferred",  "value": "..." }]
  --
  -- An EMPTY ARRAY means no brand signal was used, which is a real and different
  -- answer from a null. Explore mode legitimately produces an empty array; a row
  -- that failed before conditioning ran produces null.
  brand_signals jsonb,

  -- ── WHAT IT COST ────────────────────────────────────────────────────────────
  --
  -- Credits are what the customer paid. The ledger is the authority on that and
  -- this column is a copy for display; `ledger_entry_id` is the link back to the
  -- entry that actually moved the balance, so the two can always be reconciled and
  -- a disagreement between them is detectable rather than invisible.
  cost_credits int check (cost_credits is null or cost_credits >= 0),
  ledger_entry_id uuid,

  -- What WE paid the provider, in whole ten-thousandths of a US cent, as an
  -- integer. Not a float: image prices are quoted in fractions of a cent and
  -- floating point cannot add them up without drifting. Null until the provider
  -- tells us, and null is never rendered as zero.
  provider_cost_micro_usd bigint check (provider_cost_micro_usd is null or provider_cost_micro_usd >= 0),

  -- ── WHEN IT FAILED, IF IT DID ───────────────────────────────────────────────
  --
  -- A code the product can branch on, and the provider's own words kept separately
  -- so a screen never has to show a raw provider string to a shop owner. Nothing
  -- here is ever shown verbatim: `apps/web` maps the code to a sentence.
  error_code text,
  error_detail text,

  -- The clock, in three parts, because they answer three different questions:
  -- when did the person ask, when did we actually send it, and when did it land.
  -- "Queued for two minutes" and "the model took two minutes" are different
  -- problems and collapsing them into one timestamp loses that.
  started_at timestamptz,
  finished_at timestamptz,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A row cannot claim to be finished without saying when. Enforced here rather
  -- than in the application because a "ready" generation with no finish time is a
  -- row every screen would have to defend against forever.
  constraint finished_when_settled check (
    (status in ('ready', 'failed', 'cancelled')) = (finished_at is not null)
  ),

  -- The pair the images below point at. Declared HERE, inside the table, and not
  -- afterwards with an ALTER: Postgres requires a unique constraint on exactly
  -- these columns to EXIST before a foreign key can name them, and a child table
  -- created between the two fails with "there is no unique constraint matching
  -- given keys". Found by applying this file, not by reading it.
  unique (id, workspace_id)
);


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- One image that a generation produced.
--
-- Separate from the generation because a series is N images from one press, and
-- Phase 2's whole difficulty is re-rolling ONE slide against the same anchors. That
-- is only possible if each image carries its own seed and its own place in the set.
create table studio_generation_images (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- Tied through the customer as well as the parent, so an image can never be
  -- attached to a generation in somebody else's account. The composite this schema
  -- uses everywhere.
  generation_id uuid not null,

  -- Which slide. Zero-based, and the ORDER IS MEANING for a carousel: slide one is
  -- the hook and the last is the offer.
  idx int not null check (idx >= 0),

  -- The file in the library. `on delete set null` and not cascade: deleting the
  -- picture must not delete the record of how it was made, or the answer to "why
  -- did this cost me six credits" disappears with the file.
  asset_id uuid references assets (id) on delete set null,

  -- This image's own seed, which for a sequential set is not the parent's. It is
  -- what a single-slide re-roll is anchored to.
  seed bigint,

  width int check (width is null or width > 0),
  height int check (height is null or height > 0),

  -- The bytes, identified. The assets library already refuses a duplicate by
  -- content hash, so a deterministic model producing the same image twice would be
  -- answered with an upload refusal; holding the hash here is what lets the Studio
  -- recognise that case and point at the existing file instead of reporting an
  -- error for something that is not one.
  sha256 text,

  created_at timestamptz not null default now(),

  -- ONE ROW PER SLIDE PER GENERATION, and this is what makes the writer safe to run
  -- twice. A provider retry, an overlapping worker or a manual re-run would
  -- otherwise write a second row for the same slide and every count drawn from this
  -- table would quietly double.
  unique (generation_id, idx),

  foreign key (generation_id, workspace_id)
    references studio_generations (id, workspace_id) on delete cascade
);


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- The indexes the reads and the security rules need.
--
-- The first two are required by the policies below, which filter on `workspace_id`
-- on every single read; without them every read scans the whole table and the
-- Studio gets slower for everybody as it fills.
--
-- The third is the queue's own question, in index form: "what is still running for
-- this workspace", asked on every poll, which is the most frequent read this
-- feature makes.
--
-- The fourth is the gallery: newest first, per workspace.
--
-- IF THESE ARE WRONG: nothing is incorrect, the screens are just slow.
create index on studio_generations (workspace_id);
create index on studio_generations (workspace_id, status);
create index on studio_generations (workspace_id, created_at desc);
create index on studio_generation_images (workspace_id);
create index on studio_generation_images (generation_id);
create index on studio_generation_images (asset_id);


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- `updated_at` maintained by the database, so a status change can never leave a
-- stale timestamp behind it. Only the parent needs it: an image row is written once
-- and never edited.
create trigger set_updated_at before update on studio_generations
  for each row execute function app.set_updated_at();


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- Who may read and write: members of the workspace, and nobody else.
--
-- The parent takes full tenant policies because its STATUS legitimately changes:
-- queued becomes running becomes ready. A provenance record that could not be
-- completed would be no record at all.
select app.apply_tenant_policies('studio_generations');

-- The child takes SELECT and INSERT only, written out rather than taken from a
-- helper, and the missing DELETE is the whole point.
--
-- `apply_tenant_policies` would grant UPDATE and DELETE as well. On an
-- append-only table that is not merely redundant with the trigger in section 7,
-- it is a hole: `erasure.pglite.test.ts` refuses exactly this combination
-- because the erasure exemption, which lets a workspace deletion through the
-- append-only guard, would then hand an ordinary member the same route. Found by
-- that test rather than by reading, on the first run of this migration.
--
-- INSERT is still a member's, because the Studio writes these rows through a
-- server action carrying the member's own token, not a service key.
alter table studio_generation_images enable row level security;

create policy t_select on studio_generation_images for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

create policy t_insert on studio_generation_images for insert to authenticated
  with check (workspace_id in (select app.member_workspace_ids()));


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- Nothing may edit or delete a produced image's record once it is written.
--
-- This is the point of the whole table. A provenance record that anybody can edit
-- is a provenance record nobody can trust, and "why does this look like this" stops
-- having a truthful answer the first time a row is quietly corrected.
--
-- Deleting the parent generation still removes its images, and deleting the ASSET
-- still blanks `asset_id`: `app.block_mutations()` lets a change through when it
-- arrives as a knock-on effect of another statement (`pg_trigger_depth() > 1`),
-- which is exactly how the foreign keys above are implemented. The same mechanism
-- the publish log and the metric snapshots beside it already rely on.
--
-- CONSEQUENCE THE WRITER MUST RESPECT: because this blocks updates outright, the
-- job writes an image row with "create it, or do nothing" and never "create or
-- update". A writer built the other way would fail on its second attempt, which is
-- the attempt that only happens after something has already gone wrong.
--
-- IF THIS IS WRONG: provenance becomes editable. Nothing breaks visibly, and that
-- is precisely what makes it worth stating here.
create trigger block_mutations before update or delete on studio_generation_images
  for each row execute function app.block_mutations();
