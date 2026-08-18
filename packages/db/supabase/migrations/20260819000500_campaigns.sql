-- ─────────────────────────────────────────────────────────────────────────────
-- A6 · campaigns — group posts under one push, and be honest about the rest
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS. A campaign is a named push with a start and an end — "Diwali
-- week", "New menu launch" — that a handful of posts belong to, so they can be
-- planned and reported on together.
--
-- ── THE HONEST PART, WHICH IS THE REASON THIS COMMENT IS LONG ───────────────
-- THE TABLE BELOW IS THE SMALL PART OF CAMPAIGNS. It is perhaps a tenth of the
-- work, and applying it does not bring campaigns any closer to existing in a way a
-- customer would recognise. What people mean by a campaign is money and reach:
-- set a budget, run paid ads on Meta and Google, and see what it cost against what
-- it earned. None of that is here, and none of it is a schema problem.
--
-- Three things stand between this table and a campaign anyone would pay for:
--
--   1. BUDGETS ARE THEIR OWN BUILD. A budget is not a number on a row; it is money
--      moving. It needs a spend record that cannot be edited after the fact, a
--      running total that stays correct when two things spend at once, and a rule
--      for what happens when a platform reports a charge days late. This codebase
--      already has one system built to that standard — the credit ledger — and the
--      reason it is as careful as it is, is that money is where a mistake is not
--      recoverable by re-running something. Ad spend needs the same care, and
--      giving this table a `budget` column would invite a much simpler and much
--      more wrong version of it.
--
--   2. THE AD PLATFORMS ARE NOT OURS TO SCHEDULE. Running a paid ad on Meta or
--      Google is not the same kind of thing as posting: it needs a different
--      permission from the customer than the one they already granted, a business
--      account set up on the platform's side, and — the part that cannot be
--      engineered around — a REVIEW QUEUE. Meta reviews both the app's access and
--      each ad; Google Ads does the same. Those reviews take as long as they take,
--      can be refused, and can ask for changes to things that have nothing to do
--      with this table. That waiting is outside anyone here's control, so it should
--      be started early and it should never be on the critical path of a promise
--      made to a customer.
--
--   3. REPORTING ON PAID IS A DIFFERENT SHAPE FROM REPORTING ON POSTS. Cost per
--      result, spend against budget, and which ad was shown to whom are numbers
--      that come from a different set of endpoints than the post numbers this app
--      reads today.
--
-- So: apply this if grouping posts under a named push is worth having on its own —
-- it is, and it is honest, because everything on it is something Sahoda actually
-- does. Do not read it as campaigns being nearly done.
--
-- IF THIS FILE IS WRONG: nothing breaks. Nothing reads these tables yet.
--
-- REVERSIBLE: yes, by dropping both tables (the membership table first). Posts are
-- not touched by either drop.
--
-- APPLY ORDER: `campaigns` before `campaign_posts`, which is why they are in one
-- file in this order. Independent of everything else in the batch.


-- ── 1 of 4 ───────────────────────────────────────────────────────────────────
-- The campaign itself. Deliberately small: a name, a period, and where it is up to.
--
-- NO BUDGET COLUMN, and that is on purpose — see point 1 above. A column that
-- holds a budget with nothing enforcing or spending against it is a number on a
-- screen that means nothing, and it is worse than an empty space because it looks
-- like a working feature.
--
-- IF THIS IS WRONG: campaigns cannot be created. No post, publish or credit path
-- is affected.
create table campaigns (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  name text not null check (length(trim(name)) > 0),

  -- What the customer is trying to do, in their words, if they said. Free text
  -- rather than a fixed list: the fixed lists that exist belong to the ad platforms,
  -- and borrowing one here would imply a connection to them that does not exist.
  objective text,

  -- Where it is up to. 'draft' is planned but not started; 'active' is running;
  -- 'finished' has ended; 'cancelled' was called off. Nothing moves a campaign
  -- between these automatically — a person does, until something is built that can.
  status text not null default 'draft'
    check (status in ('draft', 'active', 'finished', 'cancelled')),

  starts_at timestamptz,
  ends_at timestamptz,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Two campaigns with the same name in one workspace cannot be told apart in a list.
  unique (workspace_id, name),

  -- A campaign that ends before it starts is a typo, and catching it here means no
  -- screen has to remember to.
  check (ends_at is null or starts_at is null or ends_at >= starts_at),

  -- Needed so the membership table below can link to both the campaign and the
  -- customer at once. Without this line that table cannot be created.
  unique (id, workspace_id)
);


-- ── 2 of 4 ───────────────────────────────────────────────────────────────────
-- Which posts are in which campaign.
--
-- A separate table rather than a column on the post, so a post can eventually
-- belong to more than one push without the schema having to change again.
--
-- IF THIS IS WRONG: posts cannot be grouped. Nothing existing is affected.
create table campaign_posts (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces (id) on delete cascade,

  campaign_id uuid not null,
  post_id uuid not null,

  created_at timestamptz not null default now(),

  -- The same post added twice would be counted twice in every campaign total.
  unique (campaign_id, post_id),

  -- Both links name the customer as well as the row, so a post can never be pulled
  -- into another customer's campaign.
  foreign key (campaign_id, workspace_id) references campaigns (id, workspace_id) on delete cascade,
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);


-- ── 3 of 4 ───────────────────────────────────────────────────────────────────
-- The indexes the security rules and the obvious reads need.
--
-- IF THESE ARE WRONG: nothing incorrect, only slower.
create index on campaigns (workspace_id);
create index on campaigns (workspace_id, starts_at);
create index on campaign_posts (workspace_id);
create index on campaign_posts (campaign_id);
create index on campaign_posts (post_id);


-- ── 4 of 4 ───────────────────────────────────────────────────────────────────
-- Security. Members manage their own campaigns; every rule is scoped to
-- `workspace_id`, so one customer can never see another's plans.
--
-- IF THIS IS WRONG in the loose direction: one customer could read another's
-- marketing plan. Worth reading twice before applying.
select app.apply_tenant_policies('campaigns');
select app.apply_tenant_policies('campaign_posts');

create trigger set_updated_at before update on campaigns
  for each row execute function app.set_updated_at();
