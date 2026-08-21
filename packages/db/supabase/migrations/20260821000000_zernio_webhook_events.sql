-- ─────────────────────────────────────────────────────────────────────────────
-- zernio_webhook_events — stop learning about the world by asking for it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS ONE MATTERS.
-- Every inbox surface asks Zernio, live, on every page load. That is why the inbox
-- is slow, why it cannot be searched, and why it shows nothing on a day Zernio is
-- unwell. Meanwhile `posts.status` is stale by design: a scheduled post moves
-- through publishing entirely server-side and the only thing that notices is a
-- five-minute cron, which is why scheduled posts are recorded landing 73-199
-- seconds late.
--
-- Zernio pushes 49 event types describing exactly these things and this product
-- consumes none of them. This table is where they land.
--
-- WHAT THIS FILE DOES.
-- Creates ONE append-only table holding the raw delivered payload, keyed by
-- Zernio's own stable event id. Nothing else. The projection into `inbox_threads`,
-- `inbox_messages` and `posts` is done by the receiver in application code, in the
-- same transaction as the insert here — there is no new Postgres function for a
-- founder to review.
--
-- It also adds ONE index to `connections`, explained in section 6, which is the
-- only thing here that touches an existing object. It is an index and nothing else:
-- no column, no constraint, no policy change.
--
-- IF THIS FILE IS WRONG: no events are stored. Nothing already working breaks —
-- the receiver route refuses to boot without this table and answers 503, Zernio
-- retries, and every existing surface keeps reading Zernio live exactly as it does
-- today. Nothing reads this table to decide anything about publishing, credits or
-- accounts.
--
-- REVERSIBLE: yes, by `drop table public.zernio_webhook_events` and
-- `drop index connections_zernio_account_idx`. Dropping the table discards stored
-- events. Those are NOT re-fetchable after 30 days (Zernio's delivery logs are
-- retained that long and there is no replay endpoint in the API at all — see
-- docs/29 §0), so it is reversible in structure and only partly in data.
--
-- APPLY ORDER: independent.
--
-- THE CONTRACT THIS IS SHAPED BY is written down, parsed rather than summarised,
-- in `docs/29_Zernio_Webhooks_Contract.md`. Every claim below cites a section of it.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- The table.
--
-- One row = one webhook event, as delivered. The payload is kept whole and
-- unedited; the columns beside it are lifted out of it only so they can be
-- indexed and filtered.
create table zernio_webhook_events (
  id uuid primary key default gen_random_uuid(),

  -- Zernio's `payload.id` — "Stable webhook event ID". THE idempotency key, and
  -- the reason this table exists in this shape (docs/29 §2).
  --
  -- `text`, NOT `uuid`, and the difference is load-bearing. The OpenAPI document
  -- types it `string` and describes it only as a stable id; the prose guide calls
  -- it a UUID. The two sources disagree about how precise it is. A `uuid` column
  -- would turn that disagreement into a rejected delivery — Postgres would raise
  -- on the insert, the receiver would answer 5xx, and Zernio would retry the same
  -- unstorable payload seven times and dead-letter it. `text` cannot fail that way.
  event_id text not null,

  -- 'post.published', 'comment.received', … 49 of them today.
  --
  -- NO CHECK CONSTRAINT, DELIBERATELY, and this is the opposite of the house style
  -- three columns down. The event list is Zernio's and it grows — the document
  -- gained events between v1.0.4 as read by an earlier session (375 endpoints) and
  -- this one (399 paths, 49 webhooks). A CHECK here would mean the first event type
  -- Zernio adds is rejected at the database, retried seven times, and dead-lettered
  -- — we would lose real events to punish Zernio for shipping a feature. An
  -- unrecognised event is stored and ignored, which is section 5's rule.
  event text not null,

  -- Which customer this belongs to. NULLABLE, which is a deliberate exception to
  -- the standing "every table carries workspace_id not null" rule, because there
  -- are two events that are NOT ATTRIBUTABLE and both are legitimate:
  --
  --   · `webhook.test` carries neither an accountId nor a profileId — it is
  --     un-routable by construction (docs/29 §5). It is the delivery Zernio sends
  --     to prove the endpoint works, so refusing it would break the one tool we
  --     have for verifying the wiring.
  --   · an `accountId` with no matching `connections` row — a disconnected
  --     account, or another tenant sharing the team API key.
  --
  -- NOT NULL would force the receiver to REJECT those, and rejecting means a
  -- non-2xx, and a non-2xx means Zernio retries something that can never succeed,
  -- seven times, forever. A nullable column is what lets the receiver tell the
  -- truth: received, recorded, not attributable.
  --
  -- Section 4's read policy filters on `workspace_id in (…)`. NULL is not `in`
  -- anything, so unattributed rows are invisible to every member of every
  -- workspace. That is correct — they are operator data, not customer data.
  workspace_id uuid references workspaces (id) on delete cascade,

  -- HOW the row above was decided, so that a NULL can never be mistaken for a
  -- routing bug. This codebase has a standing rule that a missing signal and a
  -- measured absence are different facts; this column is that rule applied to
  -- routing.
  --
  --   routed          exactly one workspace owns the account(s) on this event
  --   no_account_id   the payload carries no accountId at all (webhook.test)
  --   unknown_account it carries one, and no connection in this database has it
  --   ambiguous       it carries several, owned by DIFFERENT workspaces
  --
  -- `ambiguous` is not hypothetical. A post event's `platforms[]` is an array and
  -- its documentation says "A post can span multiple accounts", so one delivery can
  -- name several. Within Sahoda those accounts belong to one workspace, but that is
  -- our invariant and not Zernio's — the team API key can carry other tenants. When
  -- the invariant does not hold this records that it did not, rather than picking
  -- `platforms[0]` and silently filing one customer's event under another's name.
  routing text not null check (routing in ('routed', 'no_account_id', 'unknown_account', 'ambiguous')),

  -- Every Zernio account id named anywhere in this payload, deduplicated. An array
  -- because of the same `platforms[]` fan-out. Empty for `webhook.test`.
  --
  -- This codebase has shipped three separate duplicate-channel defects from reading
  -- a text[] as if it were a set, so this one is deduplicated ONCE, at the boundary
  -- that writes it, and every reader may assume it.
  zernio_account_ids text[] not null default '{}',

  -- The payload, whole and unedited. This is what makes a missed projection
  -- recoverable: the reconciliation sweep re-reads THIS rather than asking Zernio
  -- for something its logs only keep for 30 days.
  payload jsonb not null,

  -- Zernio's `payload.timestamp` — when Zernio BUILT the event.
  --
  -- READ THE NEXT SENTENCE BEFORE USING THIS COLUMN FOR ANYTHING. It is not
  -- delivery time and it is not arrival time. Its own documentation says "Retries
  -- and redeliveries keep the original value, so it reflects the event, not the
  -- delivery attempt", and retries run to roughly 51 hours (docs/29 §3, §4). A
  -- freshness window built on this column would reject attempts 2 through 7 of
  -- precisely the events we failed to receive the first time.
  event_at timestamptz,

  -- When it reached US. Kept apart from `event_at` for the same reason
  -- `post_metric_snapshots` keeps `created_at` apart from `measured_at`: one is
  -- the platform's claim and one is our observation, and collapsing them loses the
  -- only pair of facts that can tell you a delivery was late.
  received_at timestamptz not null default now(),

  -- THE LINE THAT MAKES A REPLAY WRITE NOTHING.
  --
  -- Zernio's delivery is at-least-once by its own documentation, and the pattern it
  -- prescribes is "insert the event ID into a unique-indexed table before
  -- processing the payload, and skip processing when the insert conflicts". This is
  -- that unique index. The receiver inserts with `on conflict do nothing` and does
  -- no work at all when zero rows come back.
  --
  -- ON `event_id` ALONE, not a composite with `event` or `received_at`. A
  -- redelivery is byte-identical to the original except for time, so any composite
  -- including an arrival stamp would make every retry a fresh row and the whole
  -- table pointless. There is exactly one field a redelivery is guaranteed to
  -- repeat, and this is it.
  unique (event_id)
);


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- The indexes the reads and the security rule need.
--
-- The first is required by section 4's policy, which filters on `workspace_id` on
-- every read; without it every read scans the table and the inbox gets slower for
-- everyone as it grows. `received_at desc` is bundled in because every reader wants
-- newest-first — that is what an inbox IS.
--
-- The second serves the reconciliation sweep, which asks "did an event for this
-- post ever arrive". GIN over the payload rather than a lifted column, because the
-- post id sits at a different path per event family and lifting all of them would
-- be four more columns serving one query.
--
-- The third is the operator's view of what could not be filed. It is PARTIAL —
-- `routed` rows are the overwhelming majority and indexing them here would be a
-- second copy of the table to serve a query that never wants them.
--
-- IF THESE ARE WRONG: nothing is incorrect, reads are just slow.
create index on zernio_webhook_events (workspace_id, received_at desc);
create index on zernio_webhook_events using gin (payload jsonb_path_ops);
create index on zernio_webhook_events (received_at desc) where routing <> 'routed';


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- NO GENERATED COLUMN HERE, and this section exists because the template this file
-- was told to follow has one.
--
-- `post_metric_snapshots.measured_on` is generated because its uniqueness rule is
-- "one measurement per DAY" and a date has to be derived before it can be part of
-- that rule. This table's uniqueness rule is `event_id`, which arrives ready-made.
-- A `received_on` column here would be a derived value nothing groups by, nothing
-- filters on, and no constraint uses — carried on every row forever to resemble a
-- file it does not share a problem with.
--
-- Recorded rather than silently omitted, because the next reader will compare the
-- two files and should find the reason here instead of assuming an oversight.


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- Who may read it: members of the workspace, and nobody else. Read-only — there is
-- no insert, update or delete policy, so no member can write here whatever the
-- application does. The receiver writes with the service account.
--
-- This is `apply_tenant_read_policy`, not `apply_tenant_policies`, and the
-- difference is the whole point: a record of what a platform told us is only worth
-- keeping if the people it describes cannot edit it.
--
-- Rows with a NULL `workspace_id` (section 1) match no policy and are therefore
-- readable by nobody through the data API. Deliberate.
--
-- IF THIS IS WRONG in the strict direction: the inbox reads nothing and falls back
-- to asking Zernio live, which is today's behaviour.
-- IF THIS IS WRONG in the loose direction: one customer reads another customer's
-- private messages. That is the failure this line exists to prevent and it is worth
-- reading twice.
select app.apply_tenant_read_policy('zernio_webhook_events');


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- Nothing may change or delete a delivered event — not a member, not the receiver,
-- not the service account.
--
-- An event log that can be edited cannot answer the only question anyone asks of
-- it: what did Zernio actually tell us, and when. It is also what makes the
-- idempotency proof meaningful — "deliver it twice and nothing changes" is a
-- guarantee about a table where the second delivery COULD NOT have changed anything
-- even if the receiver had tried.
--
-- CONSEQUENCE THE RECEIVER MUST RESPECT, and it is the same one the metric job
-- inherited: this blocks updates outright, so the receiver writes with
-- `on conflict do nothing`, never `on conflict do update`. A receiver written the
-- other way would fail on the first redelivery — which is to say, in production,
-- on the first slow response.
--
-- Deleting a WORKSPACE still removes its events: `app.block_mutations` lets a
-- deletion through when it arrives as a knock-on effect of deleting a parent
-- (`pg_trigger_depth() > 1`), which is how the cascade from `workspaces` above
-- reaches these rows.
create trigger block_mutations before update or delete on zernio_webhook_events
  for each row execute function app.block_mutations();


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- The one change to an existing object: an index that makes routing possible.
--
-- Routing an arriving event means going from a Zernio account id to a workspace.
-- `connections` already has a unique index on
-- `(workspace_id, platform, (external_account ->> 'id'))` — but its FIRST column is
-- `workspace_id`, which is the answer, not the question. A btree cannot be probed
-- by its third column, so every delivery would sequentially scan `connections`.
--
-- That is not merely slow, it is a correctness risk at the 5-second delivery
-- timeout Zernio enforces: a scan that grows with total connections across all
-- tenants would eventually push the receiver past it, and Zernio counts a timeout
-- as a failure and RETRIES — so a slow router becomes a duplicate storm and then a
-- dead letter.
--
-- NOT UNIQUE. The same Zernio account genuinely can appear under two workspaces
-- (a shared team API key), and that is the `ambiguous` case section 1 records
-- rather than forbids. A unique index here would reject the connection instead,
-- which is a worse answer to a real situation.
create index connections_zernio_account_idx on connections ((external_account ->> 'id'));
