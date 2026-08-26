-- ─────────────────────────────────────────────────────────────────────────────
-- Draft capture · the model's words, kept apart from the customer's edit
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS FOR. `posts.body` and `post_variants.body` are single mutable
-- columns, so every save overwrites what the model produced. The difference
-- between the generated caption and the published one has never been recorded
-- for any customer, and it is the one signal in this product that a competitor
-- cannot reproduce: it exists only if Sahoda wrote the draft first.
-- `apps/web/REQUESTS.md` §22 is the specification.
--
-- WHY A COLUMN AND NOT A `post_revisions` TABLE. §22 names both and calls the
-- column "smaller and enough for the delta", which is what is being built. A new
-- table also turns six unrelated repo guards red on its own (the table count in
-- docs/38, the DPDP export manifest, the named operator-only set in
-- `rls_tenant_isolation`, the erasure seeder, the cron-wiring trio, and both
-- per-route perf baselines). That cost buys per-save history nobody has asked to
-- read. WHAT THIS THEREFORE CANNOT DO, stated here rather than discovered later:
-- it holds the FIRST generation only, so "what did this look like last Tuesday"
-- stays unanswerable. A revision table remains the answer if that is ever wanted.
--
-- NULL IS A REAL ANSWER AND MUST STAY ONE. A row whose copy a person typed has
-- no model draft, and `generated_body is null` says exactly that. It must never
-- be backfilled from `body` — that would invent a model draft for human text and
-- report an edit distance of zero for work the model never touched, which is the
-- fabricated-figure failure this project has hit before. Nothing here backfills.
--
-- REVERSIBLE: yes. `drop trigger` on both tables, `drop function`, then
-- `alter table … drop column generated_body` — no data outside these columns
-- depends on it.
--
-- RLS: no new table, so no new policy. `posts` and `post_variants` already carry
-- row-level security and this column inherits it, because a policy grants access
-- to a ROW and never to a subset of its columns.

-- ── 1 of 3 · the columns ─────────────────────────────────────────────────────
-- Nullable and with no default, deliberately. A default would mean "every row
-- has a model draft", which is false for every row that exists today and for
-- every one a person writes from scratch tomorrow.
alter table public.posts
  add column if not exists generated_body text;
alter table public.post_variants
  add column if not exists generated_body text;

comment on column public.posts.generated_body is
  'The body as a model first produced it, written once at generation and never updated. NULL means no model wrote this post - it is not a missing value to be backfilled.';
comment on column public.post_variants.generated_body is
  'The channel copy as a model first produced it, written once at generation and never updated. NULL means a person wrote this variant.';

-- ── 2 of 3 · write-once, enforced in the database ────────────────────────────
-- The whole value of the column is that it does NOT move when the customer
-- edits. Enforcing that in TypeScript would put the guarantee in the one place
-- that cannot hold it: four separate insert paths write these rows today
-- (`plan-week`, `remix-run`, `loop-create`, `playbook-run`) and a fifth added
-- next month would silently opt out. In the database it holds for every writer,
-- including a hand-run SQL statement.
--
-- `is distinct from` rather than `<>` is load-bearing: `<>` is NULL when either
-- side is NULL, so a statement setting `generated_body = null` over a stored
-- draft would slip past a `<>` test and erase the record. `is distinct from`
-- returns true there and the erase is refused.
--
-- An UPDATE that leaves the column alone sets `new.generated_body` equal to
-- `old.generated_body`, is not distinct, and passes. That is what makes
-- `public.save_post_variant` - the compare-and-set edit path, which sets `body`
-- and never this column - keep working untouched.
create or replace function public.refuse_generated_body_rewrite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.generated_body is not null
     and new.generated_body is distinct from old.generated_body then
    raise exception
      'generated_body is write-once: this row already holds the model draft'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.refuse_generated_body_rewrite() is
  'Refuses any UPDATE that changes or erases a generated_body already stored. The record of what the model wrote is the point; a writer that could overwrite it would destroy the signal the column exists to keep.';

drop trigger if exists posts_generated_body_write_once on public.posts;
create trigger posts_generated_body_write_once
  before update on public.posts
  for each row
  execute function public.refuse_generated_body_rewrite();

drop trigger if exists post_variants_generated_body_write_once on public.post_variants;
create trigger post_variants_generated_body_write_once
  before update on public.post_variants
  for each row
  execute function public.refuse_generated_body_rewrite();

-- ── 3 of 3 · finding the rows the delta can be computed from ─────────────────
-- Partial indexes, because the interesting set is small and stays small: only
-- rows a model wrote. A full index would carry every human-written row for
-- nothing.
create index if not exists posts_generated_body_present
  on public.posts (workspace_id)
  where generated_body is not null;
create index if not exists post_variants_generated_body_present
  on public.post_variants (workspace_id)
  where generated_body is not null;

-- ── 4 of 4 · the observation kind this column feeds ──────────────────────────
-- `marketing_observations.kind` is a closed CHECK, and `20260825000000` set it
-- to exactly one value. That migration is APPLIED to production and must never
-- be edited, so the constraint is replaced here instead.
--
-- The set stays closed on purpose. It is the thing that stops a future writer
-- inventing a kind with no computer and no floor behind it: adding a value costs
-- a migration, which is a deliberate act, and the column comment on `claim`
-- already says every sentence must be computed rather than phrased by a model.
--
-- WHY `edit_distance` EARNS A KIND. It is the measure §22 names as the one that
-- keeps the moat honest: average edit distance per post should FALL over months,
-- and if it does not, the learning is decorative. It is arithmetic over stored
-- text with no model call, exactly like `tone_drift`.
alter table public.marketing_observations
  drop constraint if exists marketing_observations_kind_check;
alter table public.marketing_observations
  add constraint marketing_observations_kind_check
  check (kind in ('tone_drift', 'edit_distance'));
