-- ─────────────────────────────────────────────────────────────────────────────
-- M10 · PLAYBOOKS — the curated recipe library, and deliberately not a canvas
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS. Three tables and one widened check. A `playbooks` row is one
-- CURATED recipe switched on for one workspace with its blanks filled; a
-- `playbook_runs` row is one firing of it; a `playbook_run_items` row is one
-- thing that firing proposed to make.
--
-- ── THE ONE LINE THAT MAKES THIS NOT A WORKFLOW BUILDER ──────────────────────
-- `recipe_key` carries a CHECK constraint naming the five recipes this product
-- offers. PRD §5.3 removed the node-based canvas from v1 and replaced it with
-- these, and the difference between the two products is exactly this constraint:
-- a customer can pick a recipe and fill in two or three fields, and cannot author
-- one. Adding a sixth recipe takes a migration — which is the correct amount of
-- friction for "a new standing instruction that may spend someone's credits".
--
-- The list is duplicated in `packages/shared/src/playbooks/recipes.ts`, which is
-- where the copy, the fields and the prices live. `recipes.test.ts` asserts the
-- two lists are character-identical rather than trusting they stayed in step.
--
-- ── THE HALT IS A COLUMN, FOR THE SAME REASON THE LOOP'S IS ─────────────────
-- `awaiting_cost_approval` is a real status and `cost_approved_at` is a real
-- column, because a preview a person never saw and a preview they approved must
-- be distinguishable BY A QUERY — days later, by a different process, on a
-- different machine. A React state cannot be forced in a test; a column can, and
-- that is what makes the gate testable at all.
--
-- Nothing is charged before that column is set. This differs from the Loop,
-- which spends its orchestration charge to think about the week and only then
-- halts: a Playbook's proposal step is deterministic — reading a calendar, not
-- calling a model — so there is no honest reason to take money before the person
-- has seen the number. The whole cost is downstream of the halt.
--
-- ── THREE TABLES WHERE THE BRIEF SAID TWO, AND WHY ──────────────────────────
-- `playbook_run_items` is the third and it is not decomposition for its own
-- sake. Two things need it and neither survives a jsonb array on the run:
--
--   · THE PRICE PER LINE. A total a person cannot decompose is a total they
--     cannot trim, so each proposed output carries its own figure.
--   · THE POST LINK THE KILL SWITCH SCOPES BY. The switch must find its posts
--     through this table and never through `posts.origin`, and a jsonb array can
--     carry neither an index nor a tenancy trigger.
--
-- ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
-- No autonomy table. `loop_channel_autonomy` already IS the Autonomy Dial and a
-- Playbook obeys the same one. A second dial would be a second answer to "may
-- Sahoda publish this", and the two would disagree the first time somebody
-- changed one.
--
-- No delete path for a playbook either. The customer switches one off
-- (`enabled = false`); nothing in the app deletes the row, because deleting it
-- would cascade away the record of what it ran and what it charged, and PRD M10
-- says every run is logged.
--
-- IF THIS FILE IS WRONG: no playbook can be stored or run. Nothing existing
-- breaks — nothing reads these tables, because none of them exists. The one
-- change to an existing table is the `posts_origin_check` widening in section 0,
-- which only ADMITS a value that was previously refused and cannot invalidate a
-- stored row.
--
-- REVERSIBLE: yes.
--   drop table playbook_run_items; drop table playbook_runs; drop table playbooks;
--   drop function public.playbook_approve_cost, public.playbook_kill_switch;
--   drop function app.assert_playbook_item_post_tenancy;
--   -- and, only if no post carries it, restore the two-value origin check.
-- Dropping the tables discards the history of what a playbook did, which cannot
-- be recovered. It touches no post: the link runs from item to post, and dropping
-- the item leaves the post exactly where it is.
--
-- APPLY ORDER: after 20260820000600_loop_kill_switch_reported.sql. It needs
-- `app.is_channel_set` (20260820000500) and `loop_channel_autonomy` is read by
-- the app rather than by this file.


-- ── 0 of 8 ───────────────────────────────────────────────────────────────────
-- `posts.origin` learns a third value.
--
-- Origin answers "who made this", and a playbook draft was not made by hand. The
-- blade that marks a post as Sahoda's work reads this column, so without the new
-- value every playbook draft would either be refused by the constraint or would
-- have to lie about its provenance.
--
-- ORIGIN IS A LABEL AND NEVER A SCOPE, and the kill switch below is where that
-- distinction is load-bearing: it finds its posts through `playbook_run_items`,
-- because a post can carry `origin = 'playbook'` with no run still pointing at
-- it, and destroying that post is the one thing the switch must not do.
--
-- IF THIS IS WRONG: no playbook draft can be inserted. Existing posts are
-- untouched — this widens an allowed set and invalidates nothing already stored.
alter table posts drop constraint posts_origin_check;
alter table posts
  add constraint posts_origin_check
  check (origin in ('manual', 'plan_week', 'playbook'));


-- ── 1 of 8 ───────────────────────────────────────────────────────────────────
-- The enrolment. One curated recipe, switched on for one workspace.
--
-- IF THIS IS WRONG: no playbook can be enabled. Nothing else.
create table playbooks (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- THE FENCE. See the header: this list is the product, and it is not
  -- extensible from the application.
  recipe_key text not null check (recipe_key in (
    'festival_calendar', 'rss_to_post', 'review_reply', 'product_drop', 'quiet_post_remix'
  )),

  -- PRD M10: "Enable/disable per workspace". Default FALSE — creating the row is
  -- filling in the form, and turning it on is a second, separate act. A recipe
  -- that started running the moment its parameters were saved would spend credits
  -- on the strength of a half-finished thought.
  enabled boolean not null default false,

  -- The blanks, in the recipe's own shape. Validated in the application against
  -- that recipe's zod schema, because which shape applies depends on
  -- `recipe_key` in this same row and a CHECK constraint cannot dispatch on it.
  -- What the database DOES refuse is the shape-independent part: not an object,
  -- and not null.
  params jsonb not null default '{}'::jsonb
    check (jsonb_typeof(params) = 'object'),

  -- What sets it off.
  --   manual    a person presses Run
  --   schedule  a cadence, on the cron that demonstrably works
  --   event     something arrives from outside — NOT BUILT. The value is storable
  --             so the shape is honest, and the check in section 2 stops an event
  --             playbook being ENABLED, which is the part that would be a lie.
  trigger_kind text not null default 'manual'
    check (trigger_kind in ('manual', 'schedule', 'event')),

  cadence text check (cadence is null or cadence in ('daily', 'weekly')),

  -- When it last fired. The scheduler's due-check reads this, so a crashed tick
  -- cannot make a daily playbook run twice in a day.
  last_run_at timestamptz,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- ONE ENROLMENT PER RECIPE PER WORKSPACE. Two rows for the same recipe would
  -- make "is my festival calendar on" a question with two answers, and the
  -- scheduler would fire whichever came back first — or both.
  unique (workspace_id, recipe_key),

  -- A cadence is what 'schedule' MEANS, and a cadence on a manual playbook is a
  -- setting nothing reads. Both directions are refused so no writer has to
  -- remember which.
  constraint playbooks_cadence_matches_trigger
    check ((trigger_kind = 'schedule') = (cadence is not null)),

  -- Needed so `playbook_runs` can name both the playbook and the customer at
  -- once, which is what stops a run being attached to another tenant's playbook.
  unique (id, workspace_id)
);


-- ── 2 of 8 ───────────────────────────────────────────────────────────────────
-- A BLOCKED RECIPE CANNOT BE SWITCHED ON, and an EVENT TRIGGER CANNOT BE
-- SWITCHED ON, in the database rather than in the form.
--
-- Four of the five recipes wait on a capability this product does not have yet —
-- a feed reader that is safe to point at any address, a receiver for platform
-- events, a product source, the Remix engine. The screen renders each of them as
-- a sentence naming the one thing it needs, and does not offer a switch.
--
-- That refusal is repeated here because a form is a request and a constraint is
-- a refusal. Every route into this column — the screen, a server action, a
-- future job, a psql session — meets the same answer, and the day one of those
-- capabilities lands, turning its recipe on is a deliberate two-line migration
-- somebody reviews.
--
-- IF THIS IS WRONG in the loose direction: a customer could enable a recipe whose
-- runner does not exist, and its scheduled runs would fail every night.
alter table playbooks
  add constraint playbooks_enabled_recipe_is_runnable
  check (
    not enabled
    or (recipe_key = 'festival_calendar' and trigger_kind in ('manual', 'schedule'))
  );


-- ── 3 of 8 ───────────────────────────────────────────────────────────────────
-- One firing.
--
-- IF THIS IS WRONG: a playbook can be enabled but cannot run. Posts untouched.
create table playbook_runs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,
  playbook_id uuid not null,

  -- Copied at run time rather than joined. A recipe can be retired and the
  -- record of what ran and what it charged has to keep making sense afterwards.
  -- NO CHECK CONSTRAINT here, for that same reason: constraining it to the
  -- current catalogue would make retiring a recipe rewrite history or fail.
  recipe_key text not null,

  -- Where the machine is. The halt, three endings that are not failures, and two
  -- that are.
  --
  --   proposing               deciding what to make. Deterministic; spends nothing
  --   awaiting_cost_approval  THE HALT. Items priced, nothing spent
  --   running                 drafts being written, money being spent
  --   completed               finished
  --   nothing_to_do           the trigger fired and there was nothing. NOT a
  --                           failure, and charged nothing
  --   cancelled               the kill switch, or a person stopping it
  --   failed                  stopped on an error; `failure_reason` says which
  status text not null default 'proposing'
    check (status in (
      'proposing', 'awaiting_cost_approval', 'running',
      'completed', 'nothing_to_do', 'cancelled', 'failed'
    )),

  trigger_source text not null default 'manual'
    check (trigger_source in ('manual', 'schedule', 'event')),

  -- WHY THIS RUN HAPPENED, in the recipe's own vocabulary — which festival, which
  -- date. The first question anyone asks about a charge, and otherwise
  -- unrecoverable.
  trigger_detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(trigger_detail) = 'object'),

  -- ── THE COST PREVIEW, RECORDED ─────────────────────────────────────────────
  -- What the run said it would cost, at the moment it said so. Set when the run
  -- enters `awaiting_cost_approval`; null before then, because before the items
  -- exist there is no estimate to make.
  estimated_credits int check (estimated_credits is null or estimated_credits >= 0),

  -- WHEN A PERSON APPROVED THAT ESTIMATE, AND WHO. The gate. `running` is
  -- unreachable while this is null, and it is checked in the RPC AND re-read from
  -- this table by the executor — two places, because this column is what stands
  -- between a customer and a surprise bill.
  cost_approved_at timestamptz,
  cost_approved_by text,

  approved_credits int check (approved_credits is null or approved_credits >= 0),

  -- What was actually spent. A convenience mirror for the history screen;
  -- `credit_ledger` remains the only truth about money and this decides nothing.
  spent_credits int not null default 0 check (spent_credits >= 0),

  -- Our own vocabulary, never a provider's text.
  failure_reason text,

  started_at timestamptz not null default now(),
  finished_at timestamptz,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (playbook_id, workspace_id) references playbooks (id, workspace_id) on delete cascade,

  unique (id, workspace_id),

  -- Approval is one fact in three columns; two set and one null is a row nobody
  -- wrote on purpose.
  check ((cost_approved_at is null) = (cost_approved_by is null)),
  check (cost_approved_at is null or approved_credits is not null)
);


-- ── 4 of 8 ───────────────────────────────────────────────────────────────────
-- ONE LIVE RUN PER PLAYBOOK.
--
-- A partial index, excluding every ending. A plain unique constraint would mean
-- that cancelling a run also banned the customer from running that playbook ever
-- again — so the kill switch, whose entire purpose is to be safe to press, would
-- carry a permanent punishment.
--
-- IF THIS IS WRONG in the loose direction: a double-fired cron would open two
-- runs for the same playbook and the customer would be charged twice for one
-- festival.
create unique index playbook_runs_one_live_per_playbook
  on playbook_runs (playbook_id)
  where status in ('proposing', 'awaiting_cost_approval', 'running');


-- ── 5 of 8 ───────────────────────────────────────────────────────────────────
-- What the run proposed to make.
--
-- An item exists BEFORE the draft does, and that gap is the point: it is what the
-- cost preview prices and what a person trims. `post_id` fills in later, if and
-- when the run writes the draft.
--
-- IF THIS IS WRONG: a run can start but cannot propose. Posts untouched.
create table playbook_run_items (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,
  run_id uuid not null,

  -- Position in the run's order, and the order a budget trim works down.
  position int not null check (position >= 1),

  title text not null,
  body text not null,

  -- A text[] read as a SET, exactly like `posts.channels` and
  -- `loop_briefs.channels`. Duplicates in a column of this shape are what shipped
  -- three separate defects in this product.
  channels text[] not null default '{}',

  suggested_slot timestamptz,

  -- ── THE PRICE, PER ITEM ────────────────────────────────────────────────────
  -- What turning THIS item into a draft will cost. Written at proposal time so
  -- the preview shows a per-line figure and not only a total.
  --
  -- ZERO IS LEGITIMATE AND MEANINGFUL. At L0 the item IS the suggestion, no model
  -- is called, and a preview quoting a price for it would be quoting for work
  -- nobody does. The constraint is `>= 0`, not `> 0`, for that reason.
  estimated_credits int not null default 0 check (estimated_credits >= 0),

  -- Whether this item is still in the plan. A person trimming the preview sets
  -- this false rather than deleting the row, so the history can say what was
  -- proposed AND what was dropped.
  included boolean not null default true,

  -- The draft this became. A single-column reference plus the tenancy trigger in
  -- section 6, and not the composite key used elsewhere in this schema, for the
  -- reason `loop_briefs.post_id` gives: the composite form would have to be
  -- ON DELETE CASCADE (deleting a post would erase the record that a playbook
  -- ever made it) or ON DELETE SET NULL (which would try to null `workspace_id`
  -- too, and that column is NOT NULL, so a customer could not delete their own
  -- post at all).
  post_id uuid references posts (id) on delete set null,

  outcome text not null default 'proposed'
    check (outcome in (
      'proposed', 'suggested', 'drafted', 'awaiting_approval', 'skipped', 'failed'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (run_id, workspace_id) references playbook_runs (id, workspace_id) on delete cascade,

  -- Two items cannot hold the same slot in one run's order, or the order is not
  -- an order and the trim has no direction.
  unique (run_id, position),

  constraint playbook_run_items_channels_is_set check (app.is_channel_set(channels))
);


-- ── 6 of 8 ───────────────────────────────────────────────────────────────────
-- Indexes, and the tenancy guard for `post_id`.
--
-- IF THE INDEXES ARE WRONG: nothing incorrect, only slower. IF THE TRIGGER IS
-- WRONG in the loose direction: cross-tenant post links become possible, and the
-- kill switch would then unschedule a stranger's post. Worth reading twice.
create index on playbooks (workspace_id);
create index on playbook_runs (workspace_id);
create index on playbook_runs (workspace_id, started_at desc);
create index on playbook_runs (playbook_id, started_at desc);
create index on playbook_run_items (workspace_id);
create index on playbook_run_items (run_id);

-- THE KILL SWITCH'S READ: every item of this workspace that points at a post.
-- Partial, because the items that matter to it are only ever the linked ones.
create index playbook_run_items_linked_posts
  on playbook_run_items (workspace_id, post_id)
  where post_id is not null;

-- The scheduler's read: which playbooks are due. Partial and tiny.
create index playbooks_due
  on playbooks (trigger_kind, cadence, last_run_at)
  where enabled and trigger_kind = 'schedule';

create or replace function app.assert_playbook_item_post_tenancy() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_ws uuid;
begin
  -- Nothing to check when no post is linked. This is the normal state of an item
  -- between proposing and running, and of every item at L0.
  if new.post_id is null then
    return new;
  end if;

  select p.workspace_id into v_post_ws from posts p where p.id = new.post_id;

  if v_post_ws is null then
    raise exception 'PLAYBOOK_ITEM_POST_MISSING' using errcode = 'foreign_key_violation';
  end if;

  -- `is distinct from` rather than `<>`: a NULL on either side would make `<>`
  -- evaluate to NULL, which is not true, which would let the row through.
  if v_post_ws is distinct from new.workspace_id then
    raise exception 'PLAYBOOK_ITEM_CROSS_TENANT' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger assert_post_tenancy
  before insert or update of post_id, workspace_id on playbook_run_items
  for each row execute function app.assert_playbook_item_post_tenancy();


-- ── 7 of 8 ───────────────────────────────────────────────────────────────────
-- Security.
--
-- `playbooks` is READ + WRITE for members: enabling a recipe and filling in its
-- fields is a setting a customer owns, exactly like the Autonomy Dial.
--
-- `playbook_runs` and `playbook_run_items` are READ-ONLY. These rows are the
-- record of what Sahoda did and what it charged for. A member who could UPDATE
-- them could mark a run approved without approving it, or edit what an item was
-- estimated to cost after being billed for it. Every write goes through the
-- executor (an owner connection, no JWT) or through one of the two functions in
-- section 8, each of which checks membership itself.
--
-- IF THIS IS WRONG in the loose direction: a customer could rewrite their own
-- billing history, and — if the workspace scoping were also wrong — read another
-- customer's standing instructions. Worth reading twice before applying.
select app.apply_tenant_read_policy('playbook_runs');
select app.apply_tenant_read_policy('playbook_run_items');

alter table playbooks enable row level security;

create policy playbooks_select on playbooks
  for select using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
    )
  );

-- INSERT and UPDATE, but no DELETE policy — see the header. Switching a playbook
-- off is `enabled = false`; there is no path that removes the row, and therefore
-- no path that cascades its run history away.
create policy playbooks_insert on playbooks
  for insert with check (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create policy playbooks_update on playbooks
  for update using (
    exists (
      select 1 from workspace_members m
       where m.workspace_id = playbooks.workspace_id
         and m.user_id = auth.jwt() ->> 'sub'
         and m.role in ('owner', 'editor', 'approver')
    )
  );

create trigger set_updated_at before update on playbooks
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on playbook_runs
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on playbook_run_items
  for each row execute function app.set_updated_at();


-- ── 8 of 8 ───────────────────────────────────────────────────────────────────
-- The two functions a person reaches: approve a cost, and stop everything.
-- Both are in 20260822030100_playbook_rpcs.sql, so this file can be read as
-- schema and that one as behaviour.
