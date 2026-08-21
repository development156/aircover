-- ─────────────────────────────────────────────────────────────────────────────
-- M2 · The Loop, part 1 of 2 — the Autonomy Dial and the Loop's own settings
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS. Two small tables that answer one question before the weekly cycle
-- is allowed to exist: HOW MUCH MAY SAHODA DO WITHOUT ASKING, and per which
-- channel. FSD §0.2 defines four levels; this file stores three of them and
-- refuses the fourth, which is the most important line in the file and is
-- explained at length below.
--
-- WHY THE DIAL COMES BEFORE THE CYCLE. A weekly cycle with no dial is an
-- automation with no brake. Every stage of the Loop consults this setting to
-- decide where its output lands, so it has to be readable before the first cycle
-- runs, for every workspace, including workspaces nobody has configured.
--
-- ── L3 IS NOT STORABLE, AND THAT IS ENFORCED HERE RATHER THAN IN THE SCREEN ──
-- The level check below is `between 0 and 2`. L3 (autopilot — publishing with no
-- per-item approval) is specified in the FSD, is marked P2 there, is drawn on the
-- Loop screen and is deliberately impossible to save.
--
-- It is enforced in the DATABASE and not in the form because those are different
-- strengths of promise. A disabled control in a form is a request; a check
-- constraint is a refusal. Every route into this column — the screen, a server
-- action, a direct psql session, a future job written by someone who never read
-- this comment — hits the same constraint and gets the same answer. Nothing in
-- this product can turn autopilot on by accident, and turning it on later is a
-- deliberate migration someone has to write and review, which is the correct
-- amount of friction for "publish to a customer's real account with nobody
-- watching".
--
-- IF THIS FILE IS WRONG: the Loop screen cannot save a dial setting. No existing
-- table, publish path or credit path is touched — nothing today reads either
-- table, because neither exists.
--
-- REVERSIBLE: yes, by dropping both tables. They hold settings a person chose,
-- so dropping them loses those choices; it loses nothing that cannot be re-picked
-- in a few seconds, and nothing any other table references.
--
-- APPLY ORDER: this file first, then 20260820000300_loop_cycles.sql. That file's
-- kill switch reads `loop_settings`.


-- ── 1 of 5 ───────────────────────────────────────────────────────────────────
-- The Loop's per-workspace settings. One row per workspace, created on first use.
--
-- These are the controls FSD M2 lists that are NOT per channel: whether the Loop
-- runs at all, and what it may spend in a week.
--
-- IF THIS IS WRONG: pause and the budget cannot be set. Nothing else.
create table loop_settings (
  -- The workspace IS the key. There is exactly one set of Loop settings per
  -- customer, so a separate id column would only create the possibility of two.
  workspace_id uuid primary key references workspaces (id) on delete cascade,

  -- Pause skips cycles entirely and charges nothing (FSD M2 Controls). Default
  -- false: a workspace that has never opened this screen is not paused, it simply
  -- has no cycle scheduled — those are different states and only one of them is
  -- a choice the customer made.
  paused boolean not null default false,

  -- The weekly credit budget slider. 150 is the FSD's default.
  --
  -- The upper bound is not a business rule, it is an abuse ceiling: this number is
  -- multiplied by nothing but it IS the number the cost preview trims briefs
  -- against, and a budget of 2^31 would make the trim a no-op. 5000 is the largest
  -- monthly grant in pricing.config.json, so a weekly budget above it cannot be
  -- funded by any plan that exists.
  weekly_budget_credits int not null default 150
    check (weekly_budget_credits >= 0 and weekly_budget_credits <= 5000),

  -- When the Sunday plan runs, in minutes past midnight in the workspace's own
  -- day. FSD M2 says Sunday 21:00 workspace-local and configurable. Stored as
  -- minutes rather than a `time` so the arithmetic in the runner is integer
  -- arithmetic and no timezone is implied by the column type itself.
  plan_at_minute int not null default 1260  -- 21:00
    check (plan_at_minute >= 0 and plan_at_minute < 1440),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ── 2 of 5 ───────────────────────────────────────────────────────────────────
-- The dial itself: one level per channel per workspace.
--
-- A ROW PER CHANNEL RATHER THAN A COLUMN ON `connections`, for two reasons that
-- are both about time. A person can set the dial for a channel they have not
-- connected yet — that is a reasonable thing to do on the way to connecting it —
-- and a column on `connections` has nowhere to put that. And a connection can be
-- removed and re-added (an expired token, a re-auth); a setting stored on the
-- connection row would be silently reset by a reconnect, which would move a
-- customer from "publish after I approve" to whatever the default is, without
-- them doing anything. This table survives both.
--
-- IF THIS IS WRONG: the dial cannot be saved. Publishing is unaffected — nothing
-- in the publish path reads this table, and the Loop is what consults it.
create table loop_channel_autonomy (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- Mirrors `ChannelSchema` in packages/shared and the same check on
  -- `post_variants.channel`. Written out rather than referencing a lookup table
  -- because the other two places that constrain a channel do it this way, and a
  -- third shape for the same idea is how the three drift apart.
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- 0 suggest · 1 draft · 2 approve-to-publish. THREE IS ABSENT ON PURPOSE — see
  -- the header. Default 1 (FSD §0.2: "Default L1"), which is the level at which
  -- Sahoda writes but nothing it writes can reach anyone.
  level int not null default 1 check (level >= 0 and level <= 2),

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One dial per channel. Two rows for the same channel would make "what is my
  -- Instagram level" a question with two answers, and the stage that reads it
  -- would pick whichever came back first.
  unique (workspace_id, channel)
);


-- ── 3 of 5 ───────────────────────────────────────────────────────────────────
-- Indexes. The unique constraint above already indexes (workspace_id, channel),
-- which serves both the policy and every read this table has — the reads are
-- always "the dial for this workspace" or "the dial for this workspace and this
-- channel", and a leading-column match covers the first.
--
-- `loop_settings` needs none: workspace_id is its primary key.
--
-- IF THESE ARE WRONG: nothing incorrect, only slower.
create index on loop_channel_autonomy (workspace_id);


-- ── 4 of 5 ───────────────────────────────────────────────────────────────────
-- Security. Both tables are FULL CRUD for members, unlike the cycle tables in the
-- next file which are read-only.
--
-- The difference is who writes them. These two hold choices the CUSTOMER makes,
-- typed into a form, and there is no reason a member may not write their own
-- settings directly. The cycle tables hold what SAHODA did, which a customer must
-- never be able to edit after the fact.
--
-- Every policy is scoped to workspace_id, so one customer can neither read nor
-- change another's autonomy level. That second half matters more than usual here:
-- an attacker who could write this table could not publish anything by doing so
-- (L3 does not exist and L2 still requires a per-item approval), but they could
-- silently lower a competitor's dial to L0 and stop their marketing.
--
-- IF THIS IS WRONG in the loose direction: one customer could change another's
-- automation settings. Worth reading twice before applying.
select app.apply_tenant_policies('loop_settings');
select app.apply_tenant_policies('loop_channel_autonomy');


-- ── 5 of 5 ───────────────────────────────────────────────────────────────────
-- updated_at maintenance, so "when did this change" is answerable without the
-- application having to remember to say.
create trigger set_updated_at before update on loop_settings
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on loop_channel_autonomy
  for each row execute function app.set_updated_at();
