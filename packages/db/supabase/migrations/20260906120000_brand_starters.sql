-- ─────────────────────────────────────────────────────────────────────────────
-- The picture ideas a workspace is offered, written once per Brand Brain
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS WRONG TODAY, AND WHY IT LOOKS LIKE A TOY.
-- `/studio` offers five starter sentences. They are `PROMPT_STARTERS` in
-- `apps/web/src/lib/studio/prompt.ts`: five hardcoded ideas written for a food
-- and shopfront business, shown to EVERY workspace. A sales-training company
-- and a design consultancy are both invited to draw a plate of samosas and a
-- cup of chai. Founder's ruling, 2026-09-06: it reads as an app that was thrown
-- together rather than a system that knows the business.
--
-- `buildPromptStarters(signals)` already exists beside it, is tested, and is
-- NOT WIRED. It would be an improvement and it is not the fix, because it is
-- template substitution: it drops the customer's one-line description into
-- sentences that still assume a physical product on a counter. "Vanisa Design
-- brings dependable design services to construction companies, set on a plain
-- surface with soft morning light" is the brand's words in the wrong frame. A
-- template cannot know what a business is PHOTOGRAPHABLE as, and that is the
-- whole difficulty.
--
-- WHAT THIS TABLE IS FOR.
-- The ideas are written by a model once, from the resolved Brand Brain, and
-- kept. Not on every page load: that would put a model call on the critical
-- path of a screen that must paint immediately, and would charge a customer for
-- looking at a screen. Once per brain, read thereafter.
--
-- WHY NOT INSIDE `brand_memory.payload`, WHICH IS THE OBVIOUS PLACE.
-- `public.resolve_brand_memory` guards that payload's SHAPE, and it is the most
-- delicate function in this schema: it dual-accepts v1 and v2 because seven
-- live brains are v1 and a stricter guard would make every one of them
-- unsaveable. Adding a key there means editing that guard, bumping the brand
-- contract, and making a Studio convenience part of what a Brand Brain IS.
-- Starters are DERIVED from a brand; they are not one of its facts.
--
-- APPLY ORDER: after 20260718000003_brand.sql (brand_memory) and any migration
-- that creates `app.member_workspace_ids()`.


-- ── 1 of 3 · the table ────────────────────────────────────────────────────────
-- `brand_version` is the load-bearing column and the reason this is not just a
-- column on `workspaces`. It is the `brand_memory.version` the sentences were
-- written FROM. A brain that is re-resolved produces a new version, and the
-- starters made from the old one describe a business that may have been
-- re-described since. Keyed this way, stale starters cannot be served: the read
-- asks for the ACTIVE version and finds nothing rather than finding something
-- old, and nothing is the honest answer that falls back to the generic five.
--
-- This is the same rule `asset_logo_facts` needed and the same one the stamp
-- columns needed: a cached derivation must name the exact input it came from,
-- or it outlives it silently.
create table if not exists brand_starters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  brand_version int not null,
  -- An array of {label, prompt} objects: `label` is the short chip text shown
  -- on screen, `prompt` is the full sentence that lands in the Studio box.
  -- Bounded so a malformed model answer cannot write four hundred, and floored
  -- at three because a screen offering one idea offers no choice at all. Shape
  -- is enforced by `BrandStarterIdeasSchema` (packages/shared); this column
  -- stays plain jsonb because Postgres cannot express a list of tagged
  -- records cheaply, the same reason `studio_generations.brand_signals` does.
  starters jsonb not null,
  -- Which model wrote them, for the same reason every generation records one:
  -- when the sentences are bad, the first question is what wrote them.
  model_id text,
  created_at timestamptz not null default now(),
  unique (workspace_id, brand_version),
  constraint brand_starters_shape check (
    jsonb_typeof(starters) = 'array'
    and jsonb_array_length(starters) between 3 and 8
  )
);

create index if not exists brand_starters_workspace_idx
  on brand_starters (workspace_id);

comment on table brand_starters is
  'Picture ideas written from a workspace''s resolved Brand Brain, one set per '
  'brand version. Derived from a brand, never part of one: brand_memory.payload '
  'is shape-guarded by resolve_brand_memory and a Studio convenience does not '
  'belong inside the brand contract. A row whose brand_version is not the '
  'active one is stale by construction and must not be served.';

comment on column brand_starters.brand_version is
  'The brand_memory.version these sentences were written from. The read matches '
  'it against the ACTIVE version and serves nothing when they differ, so a '
  're-resolved brain silently retires its old starters rather than describing a '
  'business as it used to be.';


-- ── 2 of 3 · tenancy ──────────────────────────────────────────────────────────
-- Same shape as every other table here: members of the workspace may read, and
-- may write. There is no update and no delete policy, deliberately. A set of
-- starters belongs to one brand version and is never edited in place; a new
-- brain writes a new row, and the old row is retired by being unmatched rather
-- than by being changed.
alter table brand_starters enable row level security;

create policy t_select on brand_starters for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

create policy t_insert on brand_starters for insert to authenticated
  with check (workspace_id in (select app.member_workspace_ids()));


-- ── 3 of 3 · no backfill, and what happens without one ────────────────────────
-- No workspace has starters until its brain is next resolved, and that is the
-- correct behaviour rather than a gap: the read finds no row for the active
-- version and the screen falls back to what it shows today. Nobody sees an
-- empty box, and nobody is charged for a model call they did not ask for.


-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
--   drop policy if exists t_insert on brand_starters;
--   drop policy if exists t_select on brand_starters;
--   drop index if exists brand_starters_workspace_idx;
--   drop table if exists brand_starters;
--
-- Dropping this loses every written set of starters and the Studio falls back to
-- the generic five. No brand is touched: `brand_memory` is not read or written
-- by anything in this file.
