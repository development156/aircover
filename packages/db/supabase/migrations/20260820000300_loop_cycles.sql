-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop, part 2 of 2 — the weekly cycle and the briefs it produces
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS. One row per workspace per ISO week recording a run of the weekly
-- cycle, and one row per post brief that run produced. FSD M2 specifies the
-- machine: collect → reflect → plan → create → test → stage → report.
--
-- ── THE ONE STRUCTURAL DECISION IN THIS FILE ─────────────────────────────────
-- `awaiting_cost_approval` IS A REAL STATUS AND THE WHOLE FILE IS SHAPED AROUND
-- IT. FSD M2 says every credit the cycle will spend is shown "in the plan's cost
-- preview BEFORE stage 4 runs". That sentence is a schema requirement, not a
-- screen requirement.
--
-- If the cycle were one job that ran collect-through-report in a single pass, the
-- cost preview could only ever be a thing the screen drew AFTER the money was
-- gone. So the machine HALTS: planning ends by writing the briefs, their prices
-- and a total, and setting the status to `awaiting_cost_approval`. Nothing
-- advances from there without `cost_approved_at` being set by a person. The
-- create stage's first act is to check that column, and it refuses if it is null.
--
-- That is why the pause is a COLUMN and not a React state: a preview a person
-- never saw and a preview they approved must be distinguishable by a query, days
-- later, by a different process, on a different machine.
--
-- ── WHAT IS DELIBERATELY NOT HERE: A LEARNINGS TABLE ─────────────────────────
-- The Reflect stage produces learnings, and there is no `loop_learnings` table.
-- `memory_events` already is one — `{source, diff, status: pending|accepted|
-- rejected, evidence_refs, applied_memory_version, resolved_at}` — built for
-- exactly this in 20260718000003, with `source = 'insight'` reserved for a job
-- that proposes a Brand Brain change.
--
-- Reusing it is not a shortcut. That table's whole design is "a diff a person
-- accepts, never a write that happens silently", which is the single invariant
-- the Reflect stage must not break. A second table would be a second chance to
-- get that wrong. The cycle a learning came from rides in `evidence_refs`.
--
-- IF THIS FILE IS WRONG: no cycle can be recorded. Nothing existing breaks —
-- nothing reads these tables, because neither exists. No publish path, no credit
-- path and no post is touched by applying it.
--
-- REVERSIBLE: yes, `drop table loop_briefs` then `drop table loop_cycles`. That
-- discards the history of what the Loop did, which cannot be recovered. It
-- touches no post: the link runs from brief to post, and dropping the brief
-- leaves the post exactly where it is.
--
-- APPLY ORDER: after 20260820000200_loop_autonomy.sql, before
-- 20260820000400_loop_rpcs.sql.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- The cycle. One run of the week.
--
-- IF THIS IS WRONG: the Loop cannot start. Nothing else is affected.
create table loop_cycles (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- WHICH WEEK, as ISO year + ISO week rather than a date. A cycle is a thing
  -- that belongs to a week, and two runs on the Sunday and the Monday of the same
  -- ISO week are the same cycle attempted twice, not two cycles. Storing a date
  -- would make that comparison a piece of arithmetic every reader has to
  -- re-derive; storing the week makes it an equality.
  --
  -- ISO week, specifically — `extract(isoyear …)` / `extract(week …)` — because
  -- ISO weeks start on Monday and never split, so week 1 of a year has no
  -- ambiguity. The plan runs on the Sunday BEFORE the week it plans, so a cycle's
  -- ISO week is the week it plans FOR, not the day it ran.
  iso_year int not null check (iso_year >= 2020 and iso_year <= 2100),
  iso_week int not null check (iso_week >= 1 and iso_week <= 53),

  -- Where the machine is. The seven FSD stages, plus the halt, plus two endings.
  --
  --   collecting              reading last week's numbers
  --   reflecting              turning them into proposed learnings
  --   planning                writing the briefs
  --   awaiting_cost_approval  THE HALT. Briefs and prices exist; nothing is spent
  --   creating                drafts being written, money being spent
  --   testing                 Twin pre-flight, when it exists
  --   staging                 placing the drafts per the Autonomy Dial
  --   reported                finished; the CMO Report can be drawn from it
  --   cancelled               the kill switch, or a person stopping it
  --   failed                  stopped on an error; `failure_reason` says which
  status text not null default 'collecting'
    check (status in (
      'collecting', 'reflecting', 'planning', 'awaiting_cost_approval',
      'creating', 'testing', 'staging', 'reported', 'cancelled', 'failed'
    )),

  -- How the cycle was started: the schedule, or a person pressing the button.
  -- Worth keeping because "why did this run" is the first question asked about
  -- any charge, and the answer is otherwise unrecoverable.
  trigger_source text not null default 'schedule'
    check (trigger_source in ('schedule', 'manual')),

  -- ── THE COST PREVIEW, RECORDED ─────────────────────────────────────────────
  -- What the plan said it would cost, at the moment it said so. Set when the
  -- cycle enters `awaiting_cost_approval`. Null before then, because before the
  -- briefs exist there is no estimate to make.
  estimated_credits int check (estimated_credits is null or estimated_credits >= 0),

  -- WHEN A PERSON APPROVED THAT ESTIMATE, AND WHO. The gate. `creating` is
  -- unreachable while this is null, and that is checked in the RPC, in the
  -- orchestrator, and by the partial index in section 4 — three places, because
  -- this is the column that stands between a customer and a surprise bill.
  cost_approved_at timestamptz,
  cost_approved_by text,

  -- What the estimate had become by the time it was approved. Stored SEPARATELY
  -- from `estimated_credits` because a person may trim briefs before approving,
  -- and the difference between "we proposed 47" and "they approved 29" is the
  -- record that the trim happened and was theirs.
  approved_credits int check (approved_credits is null or approved_credits >= 0),

  -- What was ACTUALLY spent, accumulated as the create stage charges. This is a
  -- convenience mirror for the report; `credit_ledger` remains the only truth
  -- about money, and this column is never used to decide anything.
  spent_credits int not null default 0 check (spent_credits >= 0),

  -- The weekly budget in force when this cycle planned. Copied from
  -- `loop_settings` rather than read live, so a report on last week's cycle shows
  -- the budget that week was trimmed against and not whatever the slider says now.
  budget_credits int check (budget_credits is null or budget_credits >= 0),

  -- Why it stopped, when it stopped badly. Our own vocabulary, never a provider's
  -- text — the same rule the paid actions follow.
  failure_reason text,

  -- The Reflect stage's honest answer when there is nothing to reflect on. True
  -- means: no metric history existed for the window, so no insight pass was run
  -- and no model was called. Recorded because the report has to SAY this, and
  -- "there were no learnings" and "there was nothing to learn from" are different
  -- sentences.
  reflect_skipped_no_history boolean not null default false,

  started_at timestamptz not null default now(),
  reported_at timestamptz,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Needed so `loop_briefs` below can link to both the cycle and the customer at
  -- once, which is what stops a brief being pulled into another tenant's cycle.
  unique (id, workspace_id),

  -- Approval is one fact in three columns; two of them set and one null is a row
  -- nobody wrote on purpose. Checked here so no writer has to remember.
  check ((cost_approved_at is null) = (cost_approved_by is null)),

  -- A cycle that has been approved must say what was approved. Without this a
  -- write could set the timestamp and leave the amount null, and the report would
  -- have to render "approved: unknown".
  check (cost_approved_at is null or approved_credits is not null)
);


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- ONE LIVE CYCLE PER WORKSPACE PER ISO WEEK (FSD M2: "One `loop_cycle` per
-- workspace per ISO week").
--
-- A PARTIAL index, excluding the two endings. A plain unique constraint would
-- mean that killing a cycle also bans the customer from running another one that
-- week — so the kill switch, whose entire purpose is to be safe to press, would
-- carry a hidden week-long punishment. Cancelled and failed runs stay on the
-- record and stop competing for the slot.
--
-- IF THIS IS WRONG in the loose direction: two live cycles could plan the same
-- week, and the customer would be charged twice and get two sets of drafts.
create unique index loop_cycles_one_live_per_week
  on loop_cycles (workspace_id, iso_year, iso_week)
  where status not in ('cancelled', 'failed');


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- The briefs. What the plan stage decided to make.
--
-- A brief exists BEFORE the draft does, and that gap is the point: it is what the
-- cost preview prices and what a person trims. `post_id` fills in later, if and
-- when the create stage writes the draft.
--
-- IF THIS IS WRONG: the cycle can start but cannot plan. Posts are untouched.
create table loop_briefs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,
  cycle_id uuid not null,

  -- Where in the week's order this sits. Also the trim order: FSD M2 says the
  -- budget cap trims "lowest-priority first", so the number has to mean something
  -- before anything can trim by it. 1 is the most important.
  priority int not null default 1 check (priority >= 1),

  title text not null,
  body text not null,

  -- Which channels this brief is for. A text[] like `posts.channels`, and read
  -- the same way — as a SET. Duplicates in this column are what shipped three
  -- separate defects elsewhere in this product; the writer de-dupes through the
  -- one shared helper and never hand-rolls it.
  channels text[] not null default '{}',

  -- When the plan wants it to go out. Nullable: a brief whose slot could not be
  -- placed is still a brief.
  suggested_slot timestamptz,

  -- Why the plan chose this. Kept because the CMO Report can show it, and
  -- deliberately NOT copied into the post body — planning notes in a caption is
  -- how internal reasoning ends up on a customer's Instagram.
  rationale text,

  -- ── THE PRICE, PER BRIEF ───────────────────────────────────────────────────
  -- What making this brief into drafts will cost, summed over the actions it
  -- needs. Written at plan time so the preview can show a per-line price and not
  -- just a total — a total a person cannot decompose is a total they cannot trim.
  estimated_credits int not null default 0 check (estimated_credits >= 0),

  -- Whether this brief is still in the plan. A person trimming the preview sets
  -- this false rather than deleting the row, so the report can say what was
  -- proposed AND what was dropped. The create stage only makes the included ones.
  included boolean not null default true,

  -- The draft this became, once it exists. Null until the create stage runs, and
  -- null again if that post is later deleted.
  --
  -- A single-column reference plus the tenancy trigger in section 5, rather than
  -- the composite `(post_id, workspace_id)` foreign key used elsewhere in this
  -- schema. The composite form cannot express what is needed here: it would have
  -- to be ON DELETE CASCADE (deleting a post would erase the record that the Loop
  -- ever planned it) or ON DELETE SET NULL (which would try to null
  -- `workspace_id` too, and that column is NOT NULL, so the delete would fail
  -- outright and a customer could not delete their own post). The single-column
  -- form gives the right delete behaviour; the trigger restores the tenancy
  -- guarantee the composite form would have carried.
  post_id uuid references posts (id) on delete set null,

  -- What happened to it at the staging step, per the Autonomy Dial.
  --   planned    written, nothing done with it yet
  --   drafted    left in the Planner (L1)
  --   awaiting_approval  scheduled pending a person's approval (L2)
  --   suggested  idea only, no draft written (L0)
  --   skipped    trimmed out, or the cycle was cancelled first
  --   failed     the draft could not be written
  stage_outcome text not null default 'planned'
    check (stage_outcome in (
      'planned', 'suggested', 'drafted', 'awaiting_approval', 'skipped', 'failed'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Both halves of the link name the customer, so a brief can never be attached
  -- to another customer's cycle.
  foreign key (cycle_id, workspace_id) references loop_cycles (id, workspace_id) on delete cascade,

  -- Two briefs cannot hold the same slot in the same cycle's order, or the trim
  -- order is not an order.
  unique (cycle_id, priority)
);


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- Indexes: the ones the policies need, and the ones the two real reads need —
-- "this workspace's recent cycles" (the report) and "this cycle's briefs" (the
-- preview, the create stage, the kill switch).
--
-- IF THESE ARE WRONG: nothing incorrect, only slower.
create index on loop_cycles (workspace_id);
create index on loop_cycles (workspace_id, started_at desc);
create index on loop_briefs (workspace_id);
create index on loop_briefs (cycle_id);

-- The kill switch's read: every brief of this workspace that points at a post.
-- Partial, because the briefs that matter to it are only ever the linked ones.
create index loop_briefs_linked_posts
  on loop_briefs (workspace_id, post_id)
  where post_id is not null;

-- The scheduler's read: which workspaces have a cycle stuck at the halt, so the
-- app can nudge someone to look at their preview. Partial and tiny.
create index loop_cycles_awaiting_cost
  on loop_cycles (workspace_id, started_at)
  where status = 'awaiting_cost_approval';


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- The tenancy guard for `loop_briefs.post_id`, replacing what a composite foreign
-- key would have given — see the column comment for why one could not be used.
--
-- Without this, a writer holding an owner connection (the orchestrator does) could
-- link one customer's brief to another customer's post, and the kill switch would
-- then cancel a stranger's scheduled post. That is the single worst thing this
-- table could cause, so it is refused by the database rather than by convention.
--
-- IF THIS IS WRONG in the loose direction: cross-tenant post links become
-- possible. Worth reading twice before applying.
create or replace function app.assert_loop_brief_post_tenancy() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_ws uuid;
begin
  -- Nothing to check when no post is linked. This is the normal state of a brief
  -- between planning and creating, and of every brief at L0.
  if new.post_id is null then
    return new;
  end if;

  select p.workspace_id into v_post_ws from posts p where p.id = new.post_id;

  -- A missing post is not a tenancy violation — the foreign key already refuses
  -- that — but reaching here with no row means the post vanished mid-statement,
  -- and linking to nothing is not better than linking wrongly.
  if v_post_ws is null then
    raise exception 'LOOP_BRIEF_POST_MISSING' using errcode = 'foreign_key_violation';
  end if;

  -- `is distinct from` rather than `<>`: a NULL on either side would make `<>`
  -- evaluate to NULL, which is not true, which would let the row through.
  if v_post_ws is distinct from new.workspace_id then
    raise exception 'LOOP_BRIEF_CROSS_TENANT' using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger assert_post_tenancy
  before insert or update of post_id, workspace_id on loop_briefs
  for each row execute function app.assert_loop_brief_post_tenancy();


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- Security. READ-ONLY for members, unlike the settings tables in the previous
-- file.
--
-- These rows are the record of what Sahoda did and what it charged for. A member
-- who could UPDATE them could mark a cycle approved without approving it, or edit
-- what a brief was estimated to cost after being billed for it. Every write goes
-- through the orchestrator (an owner connection, no JWT) or through one of the
-- three functions in 20260820000400_loop_rpcs.sql, each of which checks
-- membership itself and does exactly one thing.
--
-- IF THIS IS WRONG in the loose direction: a customer could rewrite their own
-- billing history, and — if the workspace scoping were also wrong — read another
-- customer's marketing plan for the week. Worth reading twice before applying.
select app.apply_tenant_read_policy('loop_cycles');
select app.apply_tenant_read_policy('loop_briefs');

create trigger set_updated_at before update on loop_cycles
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on loop_briefs
  for each row execute function app.set_updated_at();
