-- ─────────────────────────────────────────────────────────────────────────────
-- M3.3 · Remix — one pillar asset, many drafts, and a halt in front of the money
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── WHY TWO TABLES AND NOT A COLUMN ON `posts` ───────────────────────────────
-- The obvious shape is `posts.origin = 'remix'`. It is wrong for the same reason
-- the Loop rejected it (20260820000400 §"Scoped through `loop_briefs`, NOT
-- through `posts.origin`"): `origin` is a single text column that can record
-- WHICH FEATURE made a post and nothing else. Remix has to record what the post
-- was made FROM, which run made it, what that run cost, and — the part with a
-- person's name on it — whose work the source was. None of that fits in an enum,
-- and widening an applied CHECK to add a value that still could not carry the
-- data would be a migration that bought nothing.
--
-- So Remix follows the Loop precedent exactly: its own tables, linked to `posts`,
-- and `posts.origin` untouched.
--
-- ── THE HALT IS A STORED FACT, NOT AN `if` ───────────────────────────────────
-- FSD M2 made the Loop park at a cost preview and put the halt in the database:
-- `runCreateStage` reads a persisted status and refuses to move. This does the
-- same, and for the same reason — a refusal that lives only inside the function
-- that spends the money cannot be TESTED by forcing the state and watching the
-- balance not move. `approved_at` is that fact. Every path that spends credits
-- reads it, and a batch may be forced to `running` by hand and still spend
-- nothing.
--
-- `approved_credits` is the second half of the same promise. It records the
-- total a person actually agreed to. If the catalogue or a price moves between
-- the approval and the run, the run REFUSES rather than charging a number nobody
-- saw. A preview that can be overtaken by a price change is not a preview.
--
-- ── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────────
-- No `credits_charged` column. Credits are the ledger's to record, and a second
-- copy here would be a second source of truth about money that could disagree
-- with `credit_ledger`. What a run cost is a ledger query keyed on the object
-- ref, exactly as it is for every other paid action.
--
-- No price and no action key. `action_type` per derivative was drafted and cut:
-- it would be a second place a derivative's PRICE KEY lives, and the first one
-- (the catalogue in apps/web) is the one the runner reads. The kind is stored;
-- the price key is derived from it in one place.
--
-- IF THIS IS WRONG: /remix cannot store a batch. Nothing existing breaks — no
-- existing table, column, policy or function is altered by this file.
--
-- REVERSIBLE:
--   drop table if exists remix_derivatives;
--   drop table if exists remix_batches;
--
-- APPLY ORDER: after 20260718000004_content.sql (posts) and
-- 20260718000001_helpers.sql (app.apply_tenant_policies).


-- ══ The run ══════════════════════════════════════════════════════════════════

create table remix_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- The source. A SOFT link, exactly like `leads.site_id`: deleting the post the
  -- batch came from must not delete the drafts it produced, and must not delete
  -- the record of where they came from either.
  source_post_id uuid references posts (id) on delete set null,

  -- ── ATTRIBUTION, COPIED RATHER THAN JOINED ─────────────────────────────────
  -- Remix takes someone's long-form work as input, and the /remix screen has
  -- promised since it was a drawing that "where it came from is stored on every
  -- piece". A join to `posts` cannot keep that promise: the row is nullable by
  -- the line above, and the source may not be a post at all one day. Copying the
  -- title and the credit line at batch time is what makes the attribution
  -- survive the thing it attributes.
  source_title text,
  source_credit text,

  -- ── THE HALT ───────────────────────────────────────────────────────────────
  -- `planned` costs nothing and is the only state a batch is born in.
  -- `approved` is the ONLY state the runner will act on, and it is reached by a
  -- person pressing a button that showed them a total.
  status text not null default 'planned'
    check (status in ('planned', 'approved', 'running', 'done', 'failed')),

  -- The total shown to the person, in credits, at the moment they approved it.
  -- Null until then, which is what makes "nobody approved this" a fact and not
  -- an inference from the status string.
  approved_credits int check (approved_credits is null or approved_credits >= 0),
  approved_at timestamptz,
  approved_by text,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Composite-FK target so a derivative cannot point at another tenant's batch.
  unique (id, workspace_id),

  -- The two approval columns move together or not at all. A row with a total and
  -- no timestamp records a price nobody agreed to; a row with a timestamp and no
  -- total records an agreement to nothing.
  constraint remix_batches_approval_is_whole
    check ((approved_at is null) = (approved_credits is null))
);
create index on remix_batches (workspace_id);
create index on remix_batches (workspace_id, created_at desc);

comment on table remix_batches is
  'One Remix run: a source, the drafts it produced, and the credit total a '
  'person approved before any of it was spent. `approved_at` is the halt — the '
  'runner refuses a batch that has none, whatever its status says.';


-- ══ The pieces ═══════════════════════════════════════════════════════════════

create table remix_derivatives (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  batch_id uuid not null,

  -- What kind of derivative this is. The vocabulary is CLOSED and every value in
  -- it maps to a mesh task that exists today — `adaptation` to content_variants,
  -- the other three to caption_rewrite. A kind with no task behind it would be a
  -- row that can never be written, which is the fake-success state in table form.
  kind text not null check (kind in ('adaptation', 'short', 'hook', 'thread')),

  -- Channel and format are both REAL or the row cannot exist. The channel list
  -- is `post_variants.channel`'s; the format list is `post_variants.format`'s
  -- (20260819000200, widened by 20260820144500). A derivative that named a
  -- format the variant table rejects would be a draft that cannot be saved.
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),
  format text not null
    check (format in ('text', 'image', 'carousel', 'story', 'thread', 'video')),

  -- Trimming happens BEFORE the run, in the preview, and this is where it lands.
  -- An excluded derivative is kept rather than deleted so the preview can be
  -- re-opened and the trim undone without re-planning.
  included boolean not null default true,

  status text not null default 'pending'
    check (status in ('pending', 'written', 'failed', 'skipped')),

  -- The draft this became. Null until it is written, and null forever for one
  -- that was trimmed or failed.
  post_id uuid references posts (id) on delete set null,

  -- Our own copy for a failed derivative, never a provider message.
  failure text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (batch_id, workspace_id) references remix_batches (id, workspace_id)
    on delete cascade,

  -- One derivative per kind per channel per batch. Two `short` rows for X in one
  -- batch is a double charge for the same piece of work, and the preview would
  -- have quoted it twice.
  unique (batch_id, kind, channel)
);
create index on remix_derivatives (workspace_id);
create index on remix_derivatives (batch_id);

comment on table remix_derivatives is
  'One derivative in a Remix batch. Every row names a channel and a format that '
  'actually publish, and every row becomes a DRAFT a person approves — nothing '
  'here is ever scheduled or published by Remix.';


-- ══ RLS ══════════════════════════════════════════════════════════════════════
-- Ordinary tenant tables: members read and write their own workspace's rows.
-- Nothing here is PII and nothing here is money, so there is no reason to make
-- either narrower than the standard policy set.
select app.apply_tenant_policies('remix_batches');
select app.apply_tenant_policies('remix_derivatives');

create trigger set_updated_at before update on remix_batches
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on remix_derivatives
  for each row execute function app.set_updated_at();
