-- ─────────────────────────────────────────────────────────────────────────────
-- audience_snapshots — start keeping a history of WHO follows, not just how many
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS ONE IS URGENT, AND IT IS THE SAME REASON AS ITS SIBLING.
-- `post_metric_snapshots` exists because a platform reports only the CURRENT
-- number and no amount of asking later gets last Tuesday back. Audience is worse:
-- Instagram reports the demographic split of your followers RIGHT NOW, with no
-- history at all and no date attached. The day this table does not exist is a day
-- of audience history that can never be recovered — and audience shape is the
-- slowest-moving, most valuable thing a small business can learn about itself.
--
-- WHAT THIS FILE DOES.
-- Creates one table that stores one number, once a day, per connected account,
-- per audience, per dimension, per bucket. A background job writes into it; the
-- /brain/audience screen reads it out.
--
-- IF THIS FILE IS WRONG: no audience history is collected. Nothing already
-- working breaks — the collector and the screen both check for this table at
-- runtime and both have a designed "not collecting yet" state. Nothing reads from
-- this table to decide anything about publishing, credits or accounts.
--
-- REVERSIBLE: yes, by `drop table public.audience_snapshots`. That discards every
-- measurement collected since it was applied, which cannot be re-fetched — so it
-- is reversible in structure and NOT in data.
--
-- APPLY ORDER: independent. Needs only `workspaces`, which has existed since the
-- first migration, and the two `app.*` helpers every other table already uses.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- The table.
--
-- One row = one number, for one connected account, for one audience, for one
-- dimension, for one bucket, on one day.
--
-- Example rows, so the shape below can be read against something concrete:
--
--   ('followers', 'age',            '25-34',   4500)   -- 4500 followers are 25-34
--   ('followers', 'gender',         'F',       4800)
--   ('followers', 'country',        'IN',      5000)
--   ('followers', 'city',           'Mumbai, Maharashtra', 800)
--   ('followers', 'follower_count', 'total',   5230)   -- the whole account
--   ('engaged',   'age',            '25-34',   310)    -- of those who engaged
--
-- IRREVERSIBLE ONCE DATA EXISTS, for the same reason as its sibling.
create table audience_snapshots (
  id uuid primary key default gen_random_uuid(),

  -- Which customer's data this is. Every table in this database carries it, and
  -- the security rules in section 4 are written against it.
  workspace_id uuid not null references workspaces (id) on delete cascade,

  -- ── THE ACCOUNT IS PLAIN TEXT AND CARRIES NO FOREIGN KEY, DELIBERATELY ─────
  -- The obvious shape is `references connections (id) on delete cascade`, and it
  -- is wrong here. A customer who disconnects Instagram and reconnects it gets a
  -- new `connections` row; the cascade would take every measurement with it, and
  -- those measurements CANNOT BE RE-FETCHED. The entire justification for this
  -- table is that a lost day is lost for good, so it must outlive the connection
  -- that produced it.
  --
  -- The cost of that choice, stated plainly: a row here can name an account the
  -- workspace no longer has. That is not a defect, it is history. The screen says
  -- "collected while @name was connected" rather than pretending it is current.
  -- Tenancy is still absolute — `workspace_id` above is the boundary, and the
  -- account id is only ever written alongside the workspace it was scoped for.
  --
  -- Zernio's SocialAccount id: 24 lowercase hex, never a uuid (doc 13 section 1).
  account_id text not null check (account_id ~ '^[0-9a-f]{24}$'),

  -- The same four the rest of the app uses, spelled out so a typo becomes an
  -- error. Only 'instagram' is collected TODAY: it is the one platform in our
  -- integration that reports audience demographics at all. The wider check is
  -- deliberate and costs nothing — it is byte-identical to the constraint on
  -- `post_metric_snapshots`, so the two tables cannot drift apart on channel
  -- spelling, which is the failure a narrower constraint here would invite.
  channel text not null check (channel in ('x', 'gbp', 'linkedin', 'instagram')),

  -- WHICH AUDIENCE. Instagram reports two different populations and they are not
  -- interchangeable: everyone who follows you, and the subset who engaged in the
  -- window. Storing them in one column without this would silently merge a stock
  -- with a sample.
  --   'followers' -> Instagram's `follower_demographics`
  --   'engaged'   -> Instagram's `engaged_audience_demographics`
  audience text not null check (audience in ('followers', 'engaged')),

  -- HOW IT IS BROKEN DOWN. The first four are Meta's own breakdown dimensions,
  -- named exactly as the API names them. `follower_count` is not a breakdown at
  -- all — it is the account total, and it lives here rather than in a second
  -- table because it is the same grain (one number, one account, one day) under
  -- the same append-only guarantee, and because the screen cannot honestly draw
  -- the other four without it (see section 6).
  dimension text not null check (dimension in ('age', 'gender', 'city', 'country', 'follower_count')),

  -- THE BUCKET WITHIN THE DIMENSION, exactly as the platform spelled it. Not
  -- normalised, not translated, not title-cased. Meta returns 'M'/'F'/'U' for
  -- gender, '25-34' for age, 'US' for country and 'New York, New York' for city,
  -- and the labels have changed before. Storing what was said and translating at
  -- render time means a relabelling upstream cannot corrupt collected history.
  --
  -- For `dimension = 'follower_count'` the bucket says WHICH number:
  --   'total'  the running follower count on that day  (a STOCK)
  --   'gained' followers added that day                (a FLOW)
  --   'lost'   followers lost that day                 (a FLOW)
  -- A stock and a flow must never be added together, and nothing does: every
  -- reader selects one bucket by name. The three are stored because Instagram
  -- returns all three in one response, so refusing two of them would throw away
  -- churn — which the stock alone cannot express — for no saving at all.
  bucket text not null check (length(bucket) between 1 and 120),

  -- The number itself. `bigint` for the same reason as the sibling table: a large
  -- account can exceed an ordinary integer, and the write must not fail at the
  -- moment the number gets interesting.
  --
  -- NON-NEGATIVE, because every value in this table is a COUNT OF ACCOUNTS —
  -- Meta's own words for it. There is no measurement here that can be negative;
  -- 'lost' is a count of accounts lost, stored positive. A negative arriving here
  -- would mean the collector had computed something rather than copied it, and
  -- this constraint is what stops that reaching storage.
  value bigint not null check (value >= 0),

  -- ── THE DAY THIS MEASUREMENT BELONGS TO, AND WHY IT IS NOT GENERATED ───────
  -- `post_metric_snapshots.measured_on` is GENERATED from `measured_at` so the
  -- two can never disagree. That is right there and wrong here, and the reason is
  -- a measured property of the two endpoints:
  --
  --   · the demographics endpoint returns NO TIMESTAMP OF ANY KIND. Verified
  --     live 2026-08-20: the 200 body is
  --     `{success, accountId, platform, metric, timeframe, demographics, note}`.
  --     There is nothing to generate a day from except the moment we asked.
  --   · the follower-history endpoint DOES date every point, and returns roughly
  --     thirty of them at once — so one call legitimately writes thirty different
  --     days, and generating the day from "now" would stack all thirty onto today
  --     and lose the history the call exists to provide.
  --
  -- So the day is SUPPLIED by the collector: the platform's own date where the
  -- platform gives one, and the UTC date we asked on where it does not. UTC for
  -- the same reason as the sibling — a per-workspace timezone would make the same
  -- measurement land on different days for different readers and make the
  -- uniqueness rule below unenforceable.
  measured_on date not null,

  -- WHEN SAHODA ASKED. Always known, never confused with the line above. The
  -- standing rule in this codebase is that a sync stamp proves a sync ran and
  -- never that anything was measured; keeping both columns is what preserves that
  -- distinction on a table where, for demographics, the ask time is all we have.
  observed_at timestamptz not null default now(),

  -- WHAT THE PLATFORM SAID THE FIGURE COVERS. Instagram's demographics are not a
  -- snapshot of an instant, they are a window: 'this_week' or 'this_month'. A row
  -- read without this is a number with no period attached, which is unusable and
  -- easy to misread as "today". 'day' is used for the dated follower-history
  -- points, which really are per-day.
  --
  -- Free text rather than an enum: Zernio's own OpenAPI declares the parameter as
  -- `this_week | this_month` and its own documented 200 example echoes
  -- `last_30_days`. A constraint pinned to the enum would refuse a body the vendor
  -- itself publishes. Recorded here rather than argued with.
  timeframe text not null check (length(timeframe) between 1 and 40),

  -- WHICH ENDPOINT PRODUCED THIS ROW. Two endpoints write into this table and
  -- they have different delays and different trustworthiness — the demographics
  -- figures come from Meta within 48 hours, the follower counts come from
  -- Zernio's own once-a-day snapshotter and are up to 24 hours old by their own
  -- admission. A reader that cannot tell them apart cannot state either honestly.
  source text not null check (length(source) between 1 and 80),

  created_at timestamptz not null default now(),

  -- ONE MEASUREMENT PER DAY, and this is what makes the collecting job safe to
  -- run twice. Without it a retry, an overlapping run, or the follower-history
  -- call's own thirty-day overlap with yesterday's thirty-day call would write
  -- duplicates, and every total drawn from this table would silently multiply.
  --
  -- `account_id` is in the key, not just `workspace_id`: a workspace may connect
  -- two Instagram accounts, and they have genuinely different audiences.
  unique (workspace_id, account_id, channel, audience, dimension, bucket, measured_on)
);


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- The indexes the reads and the security rules need.
--
-- The first is required by the security policy in section 4, which filters on
-- `workspace_id` on every read; without it every read scans the whole table.
--
-- The second is the screen's own query in index form — see section 6. The
-- uniqueness rule above already indexes the full key left-to-right, which serves
-- a single-bucket lookup; this one serves "the whole of one dimension on the
-- latest day", which is what every panel on the screen actually asks for.
--
-- IF THESE ARE WRONG: nothing is incorrect, the screen is just slow.
create index on audience_snapshots (workspace_id);
create index on audience_snapshots (workspace_id, dimension, measured_on desc);


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- Nothing may change or delete a measurement once it is written — not a member,
-- not the background job, not the service account. A record of what a platform
-- reported on a given day is only worth keeping if it cannot be edited afterwards.
--
-- The guard lets a deletion through when it arrives as a knock-on effect of
-- deleting the parent workspace, which is how the two tables beside it behave.
--
-- CONSEQUENCE THE JOB MUST RESPECT: because this blocks updates outright, the
-- collector writes with "create it, or do nothing" — never "create or update". A
-- job written the other way would fail every day after the first.
create trigger block_mutations before update or delete on audience_snapshots
  for each row execute function app.block_mutations();


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- Who may read it: members of the workspace, and nobody else.
--
-- READ-ONLY for members, and that is the point of the table: a history anyone can
-- edit is a history nobody can trust. Writing is done by the background job, which
-- connects with the service account and is not subject to this policy.
--
-- There is deliberately NO insert, update or delete policy. Not an omission: with
-- row-level security on and no policy for a command, that command is denied to
-- `authenticated` outright, which is the intent. Adding a permissive write policy
-- here would quietly undo section 3 for the one role that reaches this table
-- through the browser.
--
-- IF THIS IS WRONG in the strict direction: the audience screen shows nothing.
-- IF THIS IS WRONG in the loose direction: one customer could read another's
-- audience — which is the failure this line exists to prevent.
select app.apply_tenant_read_policy('audience_snapshots');


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- THE RULE THAT IS NOT EXPRESSIBLE AS A CONSTRAINT, WRITTEN DOWN ANYWAY.
--
-- A DIMENSION THE PLATFORM DID NOT REPORT PRODUCES NO ROW. Not a zero.
--
-- Postgres cannot enforce the absence of a row, so this lives in the collector and
-- in a test that mutates the collector to violate it and watches the test go red
-- (`apps/jobs/src/audience/capture.test.ts`). It is recorded here because this is
-- the file a reviewer reads first, and because the failure it prevents is
-- permanent: a fabricated zero written into an append-only table cannot be taken
-- out again.
--
-- The distinction that makes it subtle, and the reason a naive "reject zeroes"
-- guard would be wrong: Instagram DOES report genuine zeroes. `followers_gained`
-- is 0 on a quiet day and that is a measurement. So the rule is about the ABSENCE
-- of a key, not about the value 0 — an absent bucket writes nothing, a reported
-- zero writes 0.


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- THE QUESTIONS THIS TABLE EXISTS TO ANSWER, written out so the shape above can
-- be checked against them rather than taken on trust.
--
-- (a) "Who follows me?" — one dimension, on the freshest day that has one:
--
--       select bucket, value
--         from audience_snapshots
--        where workspace_id = $1 and account_id = $2
--          and audience = 'followers' and dimension = 'age'
--          and measured_on = (select max(measured_on) from audience_snapshots
--                              where workspace_id = $1 and account_id = $2
--                                and audience = 'followers' and dimension = 'age')
--        order by value desc;
--
--     Note what it does NOT do: it does not sum `value` across buckets to get a
--     follower total. Meta returns the TOP 45 buckets per dimension, so the parts
--     do not add up to the whole, and a percentage computed against their sum
--     would be a number no platform ever reported. Percentages on the screen are
--     computed against `dimension = 'follower_count', bucket = 'total'` — which is
--     why that number is in this table, and why a dimension is not drawn as a
--     share when it is missing.
--
-- (b) "Is it growing?" — the stock, over time:
--
--       select measured_on, value
--         from audience_snapshots
--        where workspace_id = $1 and account_id = $2
--          and dimension = 'follower_count' and bucket = 'total'
--        order by measured_on;
--
--     A day with no measurement produces NO ROW and the chart leaves a GAP. It
--     does not draw a zero and it does not join across the gap as though the days
--     were adjacent. This table can distinguish "nothing was collected" from "the
--     measurement was zero", and every reader of it is required to keep them apart.
--
-- (c) "Why is it empty?" — answered by (b), not by this table's emptiness.
--
--     THE SUPPRESSION RULE, MEASURED 2026-08-20 AGAINST THE LIVE API.
--     Meta does not return demographics for an account under 100 followers
--     ("Not returned if the IG User has less than 100 followers" — Instagram
--     Platform docs, Instagram User Insights). What Zernio passes on in that case
--     is HTTP 200, `success: true`, and every dimension an EMPTY ARRAY. It is NOT
--     the 400 `instagram_insufficient_followers` their own OpenAPI documents; that
--     error did not fire on an account with 1 follower.
--
--     So "suppressed by the platform" is not something the read reports — it is
--     something the screen INFERS, and it may only be claimed with the follower
--     count in hand. That is the single reason `follower_count` is in this table
--     rather than in a table of its own: without it, an empty demographics result
--     is indistinguishable from a failure, and the screen would have to guess
--     between "you are fine, you are just small" and "something is broken".
