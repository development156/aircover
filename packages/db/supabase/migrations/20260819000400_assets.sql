-- ─────────────────────────────────────────────────────────────────────────────
-- A5 · assets — a real media library, and a record of where each file is used
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- Photos live in `post_media`, and every row there belongs to exactly one post.
-- That means there is no library: the same photo uploaded to three posts is three
-- separate rows with three separate uploads, nothing can list "all our photos",
-- nothing records what kind of file something is beyond its mime type, and nothing
-- can answer "where is this picture being used?" before someone deletes it.
--
-- WHAT THIS FILE DOES. Two tables. `assets` is the library — one row per file,
-- belonging to the workspace rather than to a post. `asset_usages` records which
-- posts use which file, so one upload can appear in many posts and each one knows
-- about the others.
--
-- ── WHAT HAPPENS TO THE PHOTOS ALREADY ATTACHED TO POSTS ────────────────────
-- NOTHING. This file does not read, change, move or delete a single `post_media`
-- row, and it does not copy them into the library. Existing posts keep their
-- photos exactly as they are and keep working exactly as they do.
--
-- That is a deliberate choice, not an oversight. Copying them across would have to
-- guess which of several identical uploads are "the same photo", and a wrong guess
-- would merge two customers' distinct files into one library entry. A migration
-- should not guess. Whether old attachments are ever brought into the library is a
-- separate decision, made with the screen in front of you, and it can be made at
-- any time because nothing here is destroyed.
--
-- The two therefore coexist: `post_media` keeps serving today's posts, `assets`
-- serves the library. Whoever builds the library screen decides when, or whether,
-- to retire the old path.
--
-- IF THIS FILE IS WRONG: nothing that works today stops working. Both tables are
-- new and nothing reads them yet.
--
-- REVERSIBLE: yes, by dropping both tables (usages first, then assets). Doing so
-- discards the library records — the FILES themselves live in storage and are not
-- touched by this file at all, so nothing a customer uploaded would be lost.
--
-- APPLY ORDER: `assets` must be created BEFORE `asset_usages`, which is why they
-- are in one file and in this order. Independent of everything else in the batch.


-- ── 1 of 5 ───────────────────────────────────────────────────────────────────
-- The library.
--
-- IF THIS IS WRONG: no library. Existing posts and their photos are untouched.
create table assets (
  id uuid primary key default gen_random_uuid(),

  -- Whose file it is.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- Where the file actually sits in storage. The `media` bucket already stores
  -- objects under a folder named after the workspace, so this path is the same
  -- shape `post_media` already uses and the same storage rules already cover it.
  storage_path text not null,

  -- WHAT KIND of thing this is — the part `post_media` has no answer for. A mime
  -- type says "image/jpeg"; this says "a photo", which is what a library filters on
  -- and what a channel's rules are written against.
  kind text not null check (kind in ('image', 'video', 'document')),

  mime text,
  bytes bigint,
  width int,
  height int,

  -- What a screen reader says about it. Carried on the FILE rather than on each
  -- use, so describing a photo once describes it everywhere it appears.
  alt text,

  -- What the customer calls it in the library, if anything.
  title text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same file uploaded twice is one library entry, not two.
  unique (workspace_id, storage_path),

  -- Needed so the usage table below can point at both the file AND the customer in
  -- one link. Without this line the next table cannot be created at all.
  unique (id, workspace_id)
);


-- ── 2 of 5 ───────────────────────────────────────────────────────────────────
-- Where each file is used. This is the "used in" record.
--
-- One row means "this post uses this file". A file with three rows is in three
-- posts, which is the question nobody can answer today — and the one that has to be
-- answered before a delete button can exist without destroying someone's post.
--
-- IF THIS IS WRONG: the library cannot say where a file is used, and a delete
-- button built on it would be unsafe. Nothing existing is affected.
create table asset_usages (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  asset_id uuid not null,
  post_id uuid not null,

  -- Which channel's version uses it, or empty when it belongs to the post as a
  -- whole. Empty is the ordinary case; this is here so a channel can eventually
  -- carry a different picture from its siblings.
  channel text check (channel is null or channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- The order photos appear in, for a swipeable set.
  position int not null default 0,

  created_at timestamptz not null default now(),

  -- One file is used once per post per channel. Recording it twice would show a
  -- duplicate photo in the post and inflate every count on the library screen.
  unique (asset_id, post_id, channel),

  -- Both links name the customer as well as the row, so a usage can never tie one
  -- customer's post to another customer's file. This is the same pairing every
  -- other child table in this database uses, and it is the line that makes a
  -- cross-account mix-up impossible rather than merely unlikely.
  foreign key (asset_id, workspace_id) references assets (id, workspace_id) on delete cascade,
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);


-- ── 3 of 5 ───────────────────────────────────────────────────────────────────
-- The indexes the security rules and the two obvious questions need: "show me my
-- library" and "where is this file used?".
--
-- IF THESE ARE WRONG: nothing incorrect, only slower as the library grows.
create index on assets (workspace_id);
create index on asset_usages (workspace_id);
create index on asset_usages (asset_id);
create index on asset_usages (post_id);


-- ── 4 of 5 ───────────────────────────────────────────────────────────────────
-- Security. Members may manage their own library and their own usage records;
-- every rule is scoped to `workspace_id`, so one customer can never see another's
-- files or find out what they are posting.
--
-- IF THIS IS WRONG in the loose direction: one customer could list another's
-- uploads. Worth reading twice before applying.
select app.apply_tenant_policies('assets');
select app.apply_tenant_policies('asset_usages');


-- ── 5 of 5 ───────────────────────────────────────────────────────────────────
-- Keeps the "last changed" time on a library entry honest without anyone having to
-- remember to set it.
create trigger set_updated_at before update on assets
  for each row execute function app.set_updated_at();
