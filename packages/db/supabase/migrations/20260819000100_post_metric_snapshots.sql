-- ─────────────────────────────────────────────────────────────────────────────
-- A2 · post_metric_snapshots — start keeping a history of the numbers
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS ONE IS URGENT.
-- Today Sahoda asks the platforms for each post's numbers every time a screen is
-- opened, shows them, and throws them away. Nothing is stored. That means the
-- "Performance over time" card cannot be drawn — and, more importantly, that every
-- day this table does not exist is a day of history that can never be recovered.
-- Whatever a post's reach was last Tuesday is gone. It is the only item in this
-- batch where waiting costs something permanent.
--
-- WHAT THIS FILE DOES.
-- Creates one table that stores one number, once a day, per post, per channel, per
-- metric — with the time the platform says it measured it. A background job writes
-- into it; the analytics screen reads a series out of it.
--
-- IF THIS FILE IS WRONG: no history is collected. Nothing already working breaks —
-- the application checks for this table at runtime, and without it the analytics
-- page renders exactly as it does today, with the "no history yet" card. Nothing
-- reads from this table to decide anything about publishing, credits or accounts.
--
-- REVERSIBLE: yes, by `drop table public.post_metric_snapshots`. That would throw
-- away the collected history, which cannot be recovered — so it is reversible in
-- structure and NOT in data. Nothing else depends on it.
--
-- APPLY ORDER: independent. It does not need A1 and A1 does not need it.


-- ── 1 of 5 ───────────────────────────────────────────────────────────────────
-- The table.
--
-- One row = one number, for one post, on one channel, for one metric, on one day.
-- Six of the columns were specified before this file existed; the rest are here
-- because the screen that reads them needs them, and each is explained.
--
-- IF THIS IS WRONG: the job cannot write and the chart stays empty. Nothing else.
--
-- IRREVERSIBLE ONCE DATA EXISTS: dropping this table later discards every
-- measurement collected since it was applied, and those cannot be re-fetched —
-- platforms report only CURRENT numbers, never last week's.
create table post_metric_snapshots (
  id uuid primary key default gen_random_uuid(),

  -- Which customer's data this is. Every table in this database carries it, and
  -- the security rules at the bottom of this file are written against it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  post_id uuid not null,

  -- 'instagram' | 'x' | 'gbp' | 'linkedin'. The same four the rest of the app uses,
  -- spelled out so a typo becomes an error instead of a row nothing will ever read.
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- Which number this is. Three, matching what the platforms actually report and
  -- what the comparison screen already ranks by.
  metric text not null check (metric in ('impressions', 'reach', 'engagement')),

  -- The number itself. `bigint` rather than a plain integer because a viral post on
  -- a large account can pass two billion impressions, and an ordinary integer would
  -- fail the write at exactly the moment the number mattered most.
  --
  -- THIS IS A RUNNING TOTAL SINCE THE POST WENT OUT, not that day's activity. The
  -- platforms report lifetime figures and Sahoda stores what they said. Subtracting
  -- one day from the next to get "reach on Tuesday" would produce a number no
  -- platform ever reported, so nothing does that.
  value bigint not null,

  -- When the PLATFORM says the number was measured. Not when we asked.
  measured_at timestamptz not null,

  -- The day `measured_at` falls on, in UTC, worked out by the database rather than
  -- supplied — so it can never disagree with the timestamp beside it. This is what
  -- makes one measurement a day, and it is what the chart plots along the bottom.
  --
  -- UTC, deliberately: the alternative is each workspace's own timezone, which
  -- would make the same measurement land on different days for different readers
  -- and make the uniqueness rule below unenforceable.
  measured_on date generated always as ((measured_at at time zone 'UTC')::date) stored,

  -- When Sahoda asked. Kept apart from `measured_at` on purpose: this codebase has
  -- a standing rule that a sync stamp proves a sync ran and never that anything was
  -- measured, and collapsing the two would lose exactly that distinction.
  created_at timestamptz not null default now(),

  -- ONE MEASUREMENT PER DAY, and this line is what makes the collecting job safe to
  -- run twice. Without it, a retry, an overlapping run, or a manual re-run would
  -- write a second row for the same day and every total drawn from this table would
  -- silently double.
  unique (workspace_id, post_id, channel, metric, measured_on),

  -- The post this belongs to, tied through the customer as well as the post, so a
  -- row can never be attached to a post in someone else's account. The same
  -- composite the rest of this schema uses.
  foreign key (post_id, workspace_id) references posts (id, workspace_id) on delete cascade
);


-- ── 2 of 5 ───────────────────────────────────────────────────────────────────
-- The indexes the reads and the security rules need.
--
-- The first is required by the security policy below, which filters on
-- `workspace_id` on every single read; without it every read scans the whole table
-- and the analytics page gets slower for everyone as the table grows.
--
-- The second is the chart's own query, in index form — see the query written out
-- under section 5. The uniqueness rule above already indexes
-- (workspace_id, post_id, channel, metric, measured_on), which serves a
-- single-post lookup; this one serves the whole-workspace series, which reads by
-- metric and day across all posts.
--
-- IF THESE ARE WRONG: nothing is incorrect, the analytics page is just slow.
create index on post_metric_snapshots (workspace_id);
create index on post_metric_snapshots (workspace_id, metric, measured_on);
create index on post_metric_snapshots (post_id);


-- ── 3 of 5 ───────────────────────────────────────────────────────────────────
-- Who may read it: members of the workspace, and nobody else. This switches on
-- row-level security and adds the read rule scoped to `workspace_id`.
--
-- READ-ONLY for members, not full access, and the reason is the point of the whole
-- table: a history anyone can edit is a history nobody can trust. Writing is done
-- by the background job, which connects with a service account.
--
-- IF THIS IS WRONG in the strict direction: the analytics chart shows nothing.
-- IF THIS IS WRONG in the loose direction: one customer could read another's
-- numbers — which is the failure this line exists to prevent, so it is worth
-- reading twice.
select app.apply_tenant_read_policy('post_metric_snapshots');


-- ── 4 of 5 ───────────────────────────────────────────────────────────────────
-- Nothing may change or delete a measurement once it is written — not a member,
-- not the background job, not the service account. A record of what a platform
-- reported on a given day is only worth keeping if it cannot be edited afterwards.
--
-- Deleting a whole POST still removes its measurements: the guard lets a deletion
-- through when it arrives as a knock-on effect of deleting the parent, which is how
-- the publish log beside it already behaves.
--
-- CONSEQUENCE THE JOB MUST RESPECT: because this blocks updates outright, the
-- collecting job writes with "create it, or do nothing" — never "create or update".
-- A job written the other way would fail every day after the first.
--
-- IF THIS IS WRONG: measurements become editable. Nothing breaks visibly, and that
-- is what makes it worth stating.
create trigger block_mutations before update or delete on post_metric_snapshots
  for each row execute function app.block_mutations();


-- ── 5 of 5 ───────────────────────────────────────────────────────────────────
-- THE QUERY THIS TABLE EXISTS TO ANSWER, written out so the shape above can be
-- checked against it rather than taken on trust. This is what the analytics page
-- runs to draw "Performance over time":
--
--   select measured_on,
--          sum(value)                       as total,
--          count(*)                         as series_count
--     from post_metric_snapshots
--    where workspace_id = $1
--      and metric       = $2
--      and measured_on >= $3
--    group by measured_on
--    order by measured_on;
--
-- Three things about it decided the columns above:
--
--   · it groups by DAY, which is why `measured_on` exists as a stored column and
--     is part of the uniqueness rule — grouping by a raw timestamp would put every
--     measurement in its own bucket;
--   · it filters by workspace and metric before it groups, which is the index in
--     section 2;
--   · it returns `series_count` alongside the total, because the number of posts
--     measured can differ from day to day, and a total that quietly covered fewer
--     posts would draw a fall that never happened. The screen states the coverage
--     rather than hiding it.
--
-- A day with no measurements produces NO ROW, and the chart leaves a gap there. It
-- does not draw a zero. This table can distinguish "nothing was measured" from
-- "the measurement was zero", and every reader of it is required to keep them apart.
