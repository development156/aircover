-- ─────────────────────────────────────────────────────────────────────────────
-- RADAR · 2 of 2 — what was seen, what changed, and what it cost
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The previous file created the list of who is watched. This one creates the
-- three records that make Radar trustworthy and affordable:
--
--   competitor_snapshots — what a competitor looked like on a given day.
--   competitor_changes   — what moved between two snapshots. DERIVED, never told.
--   radar_fetch_log      — every check we attempted, what it cost, and whether it
--                          worked. This is the only place the real per-customer
--                          price of Radar can be read from, and it is also what
--                          the spending cap counts.
--
-- THE RULE THAT GOVERNS ALL THREE, and the reason the shapes below look fussy:
--
--   "WE COULD NOT CHECK" AND "NOTHING HAPPENED" ARE DIFFERENT FACTS.
--
-- A day Radar failed to fetch must never be shown as a quiet day. A follower
-- count a platform declined to give us must never be stored as zero. Those two
-- confusions are the only ways a competitor-tracking feature can lie to a founder
-- while every individual number in it is real, and this product has already spent
-- several sessions learning to keep such pairs apart. So:
--
--   · a metric the source did not expose is ABSENT from the payload, not zero;
--   · a failed check writes a row in the fetch log and NO snapshot, so the gap is
--     visible as a gap;
--   · a change carries the number of days it spans, worked out by the database
--     from the two snapshots — so a fetch resumed after a three-day outage is
--     reported as "changed at some point over three days", never as "changed
--     today". That single column is what stops an outage from manufacturing a
--     burst of fake activity on the day service returns.
--
-- IF THIS FILE IS WRONG: Radar collects nothing, or reports it dishonestly.
-- Nothing outside Radar reads these tables.
--
-- REVERSIBLE in structure; NOT in data. Dropping competitor_snapshots discards
-- collected history, and history cannot be re-fetched — a website serves today's
-- page and no platform will tell you what a profile looked like last Tuesday.


-- ── 1 of 7 ───────────────────────────────────────────────────────────────────
-- WHAT A COMPETITOR LOOKED LIKE ON A DAY.
--
-- A snapshot is written only when Radar actually obtained content. Most days, for
-- a website, nothing is written at all — the cheap check found the page had not
-- moved and there was nothing new to record. That sparseness is the cost design
-- working, and it is why "no snapshot" must be read as "no change or no check"
-- and never as "the page was empty".
create table competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references competitor_sources (id) on delete cascade,

  -- Everything the source told us, in its own shape: follower counts and recent
  -- posts for a social account, title and readable text for a website.
  --
  -- ⚠ A KEY THAT IS ABSENT MEANS THE SOURCE DID NOT SAY. It never means zero.
  -- Every reader of this column is required to tell those apart, and the
  -- extraction code is written to omit rather than to default.
  payload jsonb not null,

  -- The fingerprint the next cheap check compares against. Taken over the page's
  -- readable WORDS, not its raw bytes: a cache-busting `?v=1755820000` on a
  -- stylesheet changes the bytes on every deploy while the page a customer reads
  -- is identical, and a byte hash would bill us for a render every single day.
  content_hash text not null,

  -- When the content was true, as best the source tells us. For a website that is
  -- when we fetched it; for a social account it is the platform's own timestamp
  -- where one is given.
  captured_at timestamptz not null,

  -- The UTC day, worked out by the database rather than supplied, so it can never
  -- disagree with the timestamp beside it. This is what makes one snapshot a day
  -- and what the uniqueness rule below is written against.
  captured_on date generated always as ((captured_at at time zone 'UTC')::date) stored,

  created_at timestamptz not null default now(),

  -- ONE SNAPSHOT PER SOURCE PER DAY, and this is what makes the nightly runner
  -- safe to run twice. A retry, an overlapping run or a manual re-run writes
  -- nothing the second time instead of doubling the history.
  unique (source_id, captured_on)
);

create index on competitor_snapshots (source_id, captured_on desc);


-- ── 2 of 7 ───────────────────────────────────────────────────────────────────
-- Nothing may edit or delete a snapshot once written — not a member, not the
-- runner, not the service account. A history anyone can rewrite is a history
-- nobody can use to settle an argument. Deleting the SOURCE still removes its
-- snapshots: the guard lets a deletion through when it arrives as a knock-on
-- effect of deleting the parent.
--
-- CONSEQUENCE THE RUNNER MUST RESPECT: because this blocks updates outright, the
-- runner writes with "create it, or do nothing" — never "create or update". A
-- runner written the other way would fail every day after the first.
create trigger block_mutations before update or delete on competitor_snapshots
  for each row execute function app.block_mutations();


-- ── 3 of 7 ───────────────────────────────────────────────────────────────────
-- WHAT MOVED. Always between two named snapshots, never asserted on its own.
--
-- The point of storing both snapshot ids is that every claim Radar makes on the
-- screen can be traced back to the two things it was computed from. A founder who
-- doubts "they raised their price" can be shown the before and the after.
create table competitor_changes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references competitor_sources (id) on delete cascade,

  from_snapshot_id uuid not null references competitor_snapshots (id) on delete cascade,
  to_snapshot_id   uuid not null references competitor_snapshots (id) on delete cascade,

  change_kind text not null check (change_kind in ('new_posts', 'audience_moved', 'page_content')),

  -- HOW MANY DAYS THIS CHANGE COVERS. Filled in by the trigger in section 4 from
  -- the two snapshots' own dates — it cannot be supplied, and it cannot be wrong.
  --
  -- 1 means "between yesterday and today". Anything larger means Radar did not
  -- see this source on the days in between, and the screen must say so: over a
  -- longer span, "they posted four times" is four posts across four days, not a
  -- sudden burst today. Without this column, service resuming after an outage
  -- would manufacture a spike that never happened.
  day_span int not null check (day_span >= 1),

  -- A plain-language sentence for the screen. Written by the deriving code from
  -- the two payloads; see section 7 for the one rule that governs it.
  summary text not null check (length(btrim(summary)) between 1 and 500),

  -- The machine-readable difference: which posts are new, which number moved and
  -- by how much.
  detail jsonb not null default '{}'::jsonb,

  detected_at timestamptz not null default now(),

  -- Deriving the same pair twice produces the same row, so a re-run of the
  -- differ writes nothing rather than duplicating the customer's feed.
  unique (from_snapshot_id, to_snapshot_id, change_kind),

  -- A diff between two different competitors is not a change, it is a bug. The
  -- trigger below enforces the half a constraint cannot express.
  check (from_snapshot_id <> to_snapshot_id)
);

create index on competitor_changes (source_id, detected_at desc);

create trigger block_mutations before update or delete on competitor_changes
  for each row execute function app.block_mutations();


-- ── 4 of 7 ───────────────────────────────────────────────────────────────────
-- THE TRIGGER THAT MAKES "DERIVED, NEVER ASSERTED" TRUE RATHER THAN INTENDED.
--
-- Both facts a change row makes about time — which source it concerns and how
-- many days it spans — are recomputed here from the snapshots themselves and
-- overwrite whatever the caller supplied. A deriver with a bug, or a future
-- caller that forgets, cannot record a three-day span as a one-day one.
create or replace function app.radar_seal_change() returns trigger
language plpgsql as $$
declare
  v_from competitor_snapshots%rowtype;
  v_to   competitor_snapshots%rowtype;
begin
  select * into v_from from competitor_snapshots where id = new.from_snapshot_id;
  select * into v_to   from competitor_snapshots where id = new.to_snapshot_id;

  if v_from.source_id <> v_to.source_id then
    raise exception 'RADAR_CROSS_SOURCE_DIFF' using errcode = 'restrict_violation';
  end if;
  if v_to.captured_on <= v_from.captured_on then
    -- "to" must be the later one. A backwards diff would report a price CUT when
    -- there was a rise.
    raise exception 'RADAR_BACKWARDS_DIFF' using errcode = 'restrict_violation';
  end if;

  new.source_id := v_from.source_id;
  new.day_span  := (v_to.captured_on - v_from.captured_on);
  return new;
end;
$$;

create trigger seal_change before insert on competitor_changes
  for each row execute function app.radar_seal_change();


-- ── 5 of 7 ───────────────────────────────────────────────────────────────────
-- EVERY CHECK WE ATTEMPTED, AND WHAT IT COST.
--
-- This table answers two questions nothing else can. The founder's question is
-- "what does Radar actually cost me per customer?" — and the honest answer comes
-- from adding up real charges here, not from multiplying a price list. The
-- system's question is "have I spent too much today?", asked before every single
-- fetch by the cap in section 6.
--
-- WHY THIS ONE IS NOT APPEND-ONLY, unlike the two tables above.
-- A cap that refuses AFTER the money is spent is not a cap. So the row is written
-- in two steps: a reservation before the request leaves, carrying the ESTIMATED
-- price, and a settlement afterwards carrying what it really cost. A table that
-- can only be written once cannot do both. The immutability guarantee that
-- matters — the customer-facing history — lives on competitor_snapshots, where a
-- rewrite would change what Radar claims happened. This table is our own
-- accounting, and the trigger below still forbids deleting a row or altering
-- what it was a reservation FOR.
create table radar_fetch_log (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references competitor_sources (id) on delete cascade,

  -- 'cheap'  — a conditional GET from our own server. Costs nothing but bandwidth.
  -- 'render' — a paid fetch through a scraping provider, for a page our own
  --            request cannot read or for a social account with no public API.
  mode text not null check (mode in ('cheap', 'render')),

  provider text not null check (provider in ('direct', 'zyte', 'apify')),

  -- 'pending' only exists between the reservation and the settlement. A row left
  -- pending means the runner died mid-request — which is itself worth seeing, and
  -- is why the cap counts pending rows as spent rather than optimistically not.
  outcome text not null default 'pending'
    check (outcome in ('pending', 'unchanged', 'changed', 'could_not_check')),

  -- Millionths of a US dollar. An integer because money compared with `=` must
  -- never be a float, and micros because a single cheap check can cost less than
  -- a hundredth of a cent and rounding it to zero would hide the bill entirely.
  cost_micros bigint not null default 0 check (cost_micros >= 0),

  -- ⚠ WHERE THAT NUMBER CAME FROM, because the two providers differ and pretending
  -- otherwise would put an estimate in the founder's cost report wearing the name
  -- of a measurement.
  --
  -- MEASURED 2026-08-22, by asking both:
  --   'measured'  — Apify returns `usageTotalUsd` on the run itself, so the number
  --                 below is what Apify says it charged for that exact request.
  --   'estimated' — Zyte returns NO cost anywhere. Its response carries only
  --                 url/statusCode/httpResponseBody, no cost header, and
  --                 /v1/stats, /v1/usage and the app usage path all answer 404.
  --                 Zyte also assigns a price TIER per target website
  --                 automatically, so the real figure is a property of that
  --                 competitor's site and is unknowable from any price list. A
  --                 Zyte row carries the tier's list price and must be reconciled
  --                 against the Zyte dashboard before it is quoted to anyone.
  --   'free'      — a conditional GET from our own server. No provider, no bill.
  --
  -- Any total shown to the founder must state the split. A report that adds
  -- measured and estimated micros into one figure and calls it "what Radar cost"
  -- is the kind of number this codebase has learned not to print.
  cost_basis text not null default 'free' check (cost_basis in ('measured', 'estimated', 'free')),

  -- HOW MANY WORKSPACES THIS ONE FETCH SERVED, recorded at the moment it was made.
  -- This is what makes a real per-customer number possible: a fetch shared by six
  -- subscribers cost each of them a sixth. It is stored rather than counted later
  -- because the subscriber list changes, and last month's bill must not move when
  -- someone unsubscribes today.
  subscriber_count int not null check (subscriber_count >= 0),

  -- Why a check could not be made, in the checker's own words: 'http 403',
  -- 'challenge: cloudflare interstitial', 'transport: TimeoutError'. Never
  -- flattened into a single "failed" — the difference between a bot wall and a
  -- timeout decides whether escalating to a paid fetch would even help.
  detail jsonb not null default '{}'::jsonb,

  fetched_at timestamptz not null default now(),
  fetched_on date generated always as ((fetched_at at time zone 'UTC')::date) stored,
  settled_at timestamptz
);

-- NO uniqueness on (source_id, fetched_on), deliberately, and this is the one
-- place Radar differs from post_metric_snapshots. A source may honestly be
-- checked more than once in a day: a cheap check that came back "could not
-- check" should be retried, and each attempt costs something and must appear.
-- The de-duplication that protects the customer's history is on the SNAPSHOT.
create index on radar_fetch_log (fetched_on);
create index on radar_fetch_log (source_id, fetched_at desc);
create index on radar_fetch_log (outcome) where outcome = 'pending';

-- A reservation may be settled — that is the whole point — but it may not be
-- deleted, back-dated, or re-pointed at a different source once it exists.
create or replace function app.radar_seal_fetch_log() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);      -- a cascaded delete of the parent is allowed
  end if;
  if tg_op = 'DELETE' then
    raise exception 'radar_fetch_log is not deletable' using errcode = 'restrict_violation';
  end if;
  if new.source_id <> old.source_id
     or new.fetched_at <> old.fetched_at
     or new.mode <> old.mode
     or new.provider <> old.provider then
    raise exception 'radar_fetch_log: a reservation may be settled, not rewritten'
      using errcode = 'restrict_violation';
  end if;
  if old.outcome <> 'pending' then
    raise exception 'radar_fetch_log: already settled' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger seal_fetch_log before update or delete on radar_fetch_log
  for each row execute function app.radar_seal_fetch_log();


-- ── 6 of 7 ───────────────────────────────────────────────────────────────────
-- THE SPENDING CAP.
--
-- Radar is the first thing in this product that spends real money in a loop with
-- no human in it. A bug that fetches in a circle does not fail loudly — it
-- succeeds, repeatedly, on someone's card. So no fetch happens until the database
-- has agreed to it, and the agreement is recorded BEFORE the request goes out.
--
-- ⚠ HONEST LIMIT OF THIS DESIGN. ⚠ The check adds up today's spending and then
-- writes a reservation. Between two SIMULTANEOUS runners, each could read the
-- same total and both be allowed. What actually prevents that is not this SQL: it
-- is that the nightly workflow declares `concurrency: group: radar-nightly`, so
-- GitHub runs one at a time. The advisory lock below makes two callers inside one
-- database serialise, which closes the window to the length of a transaction, but
-- it cannot span the HTTP request that follows. Do not read this function as a
-- guarantee against parallel runners; read the workflow for that.

create table radar_limits (
  -- One row, forever. The check on the primary key is what enforces that.
  id boolean primary key default true check (id),

  -- Total across all customers, per UTC day. Set to roughly a hundred times the
  -- measured daily cost so an ordinary day never touches it and a runaway loop
  -- hits it within minutes.
  daily_cap_micros bigint not null default 2000000 check (daily_cap_micros >= 0),

  -- Per workspace, per UTC day, on the share of spending that workspace actually
  -- causes. See the note in the function below on why "causes" is not the same as
  -- "benefits from".
  workspace_daily_cap_micros bigint not null default 50000 check (workspace_daily_cap_micros >= 0),

  updated_at timestamptz not null default now()
);

insert into radar_limits (id) values (true) on conflict do nothing;

alter table radar_limits enable row level security;
alter table radar_fetch_log enable row level security;
-- No policies on either: both are ours, not the customer's. The fetch log in
-- particular would leak the registry — a workspace that could read it would learn
-- how many OTHER workspaces subscribe to each competitor, straight out of
-- `subscriber_count`. That is the "who is watching whom" disclosure the first
-- file exists to prevent, arriving through the billing door.

/**
 * What a workspace has caused to be spent today, amortised.
 *
 * A fetch shared by six subscribers cost each of them a sixth of it. Dividing by
 * the count recorded AT FETCH TIME rather than by today's subscriber list is what
 * keeps a past day's number from moving when someone unsubscribes.
 */
create or replace function app.radar_workspace_spend_today(p_workspace_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(l.cost_micros::numeric / greatest(l.subscriber_count, 1)), 0)::bigint
    from radar_fetch_log l
    join competitor_sources cs on cs.id = l.source_id
    join competitor_subscriptions s
      on s.competitor_id = cs.competitor_id and s.workspace_id = p_workspace_id
   where l.fetched_on = (now() at time zone 'UTC')::date;
$$;

/**
 * Ask permission, and reserve. Returns the reservation's id when allowed, and a
 * refusal with the numbers behind it when not.
 *
 * WHY A REFUSAL IS A RETURNED STATUS AND NOT AN EXCEPTION: reaching a spending
 * cap is a normal operating condition, like a schedule being empty. The runner
 * must record it, report it on the screen as "we stopped checking today", and
 * carry on with the sources it can still afford — not crash. This is the same
 * shape as the Loop's cost-preview halt.
 *
 * WHAT THE CALLER MUST DO: nothing may reach a provider without a reservation id
 * from this function. That is enforced in TypeScript, where the transport is only
 * reachable from a value this function produced — see packages/publishing or
 * apps/jobs/src/radar/spend.ts. A cap the caller can forget to consult is not a
 * cap, and a cap that raises AFTER the request has gone out has already paid.
 */
create or replace function app.radar_begin_fetch(
  p_source_id uuid,
  p_mode text,
  p_provider text,
  p_estimate_micros bigint,
  p_cost_basis text default 'free'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lim            radar_limits%rowtype;
  v_spent_today    bigint;
  v_subscribers    int;
  v_sole_workspace uuid;
  v_ws_spent       bigint;
  v_log            radar_fetch_log%rowtype;
begin
  if p_estimate_micros is null or p_estimate_micros < 0 then
    raise exception 'RADAR_BAD_ESTIMATE' using errcode = 'raise_exception';
  end if;

  -- Serialise callers inside this database. See the honest limit above: this
  -- closes the window to a transaction, not to the whole HTTP request.
  perform pg_advisory_xact_lock(hashtext('radar_spend'));

  select * into v_lim from radar_limits where id;

  -- Pending rows count as spent. A runner that died mid-request has very likely
  -- already been charged, and a cap that assumes otherwise is a cap that
  -- under-counts precisely when something is going wrong.
  select coalesce(sum(cost_micros), 0) into v_spent_today
    from radar_fetch_log
   where fetched_on = (now() at time zone 'UTC')::date;

  if v_spent_today + p_estimate_micros > v_lim.daily_cap_micros then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'DAILY_CAP',
      'spent_micros', v_spent_today,
      'estimate_micros', p_estimate_micros,
      'cap_micros', v_lim.daily_cap_micros
    );
  end if;

  select count(distinct s.workspace_id) into v_subscribers
    from competitor_sources cs
    join competitor_subscriptions s on s.competitor_id = cs.competitor_id
   where cs.id = p_source_id;

  if v_subscribers = 0 then
    -- Nobody is watching this any more. Fetching it would be spending money on
    -- an answer with no reader.
    return jsonb_build_object('allowed', false, 'reason', 'NO_SUBSCRIBERS');
  end if;

  -- ── the per-workspace cap, and why it only bites on sole subscriptions ──────
  -- The cost a workspace CAUSES is the cost that would go away if it
  -- unsubscribed. For a competitor six customers watch, that is nothing: the
  -- fetch happens for the other five regardless, and refusing it would punish
  -- them for a neighbour's spending. So the per-workspace cap applies exactly
  -- where the workspace is the only reason the request is being made.
  if v_subscribers = 1 then
    select s.workspace_id into v_sole_workspace
      from competitor_sources cs
      join competitor_subscriptions s on s.competitor_id = cs.competitor_id
     where cs.id = p_source_id
     limit 1;

    v_ws_spent := app.radar_workspace_spend_today(v_sole_workspace);
    if v_ws_spent + p_estimate_micros > v_lim.workspace_daily_cap_micros then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'WORKSPACE_CAP',
        'workspace_id', v_sole_workspace,
        'spent_micros', v_ws_spent,
        'estimate_micros', p_estimate_micros,
        'cap_micros', v_lim.workspace_daily_cap_micros
      );
    end if;
  end if;

  insert into radar_fetch_log (source_id, mode, provider, cost_micros, subscriber_count, cost_basis)
  values (p_source_id, p_mode, p_provider, p_estimate_micros, v_subscribers, p_cost_basis)
  returning * into v_log;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', v_log.id,
    'subscriber_count', v_subscribers,
    'spent_micros', v_spent_today,
    'cap_micros', v_lim.daily_cap_micros
  );
end;
$$;

/** Settle a reservation with what the request really cost and what it found. */
create or replace function app.radar_finish_fetch(
  p_reservation_id uuid,
  p_outcome text,
  p_actual_micros bigint,
  p_detail jsonb default '{}'::jsonb,
  p_cost_basis text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log radar_fetch_log%rowtype;
begin
  if p_outcome not in ('unchanged', 'changed', 'could_not_check') then
    raise exception 'RADAR_BAD_OUTCOME: %', p_outcome using errcode = 'raise_exception';
  end if;

  update radar_fetch_log
     set outcome = p_outcome,
         cost_micros = greatest(coalesce(p_actual_micros, 0), 0),
         cost_basis = coalesce(p_cost_basis, radar_fetch_log.cost_basis),
         detail = coalesce(p_detail, '{}'::jsonb),
         settled_at = now()
   where id = p_reservation_id
   returning * into v_log;

  if not found then
    raise exception 'RADAR_NO_SUCH_RESERVATION' using errcode = 'raise_exception';
  end if;
  return to_jsonb(v_log);
end;
$$;

revoke all on function app.radar_begin_fetch(uuid, text, text, bigint, text) from public;
revoke all on function app.radar_finish_fetch(uuid, text, bigint, jsonb, text) from public;
revoke all on function app.radar_workspace_spend_today(uuid) from public;
grant execute on function app.radar_begin_fetch(uuid, text, text, bigint, text) to service_role;
grant execute on function app.radar_finish_fetch(uuid, text, bigint, jsonb, text) to service_role;
grant execute on function app.radar_workspace_spend_today(uuid) to service_role;


-- ── 7 of 7 ───────────────────────────────────────────────────────────────────
-- THE SECURITY RULES for the two customer-facing tables here.
--
-- Neither carries a workspace_id — they hang off a source, which hangs off a
-- competitor, which is global. So each gets the same hand-written rule as the
-- registry: visible only if one of my workspaces subscribes to the competitor
-- this belongs to. Read the header of 20260822000000_radar_registry.sql before
-- changing either.
create policy t_select on competitor_snapshots for select to authenticated
  using (
    exists (
      select 1
        from competitor_sources cs
        join competitor_subscriptions s on s.competitor_id = cs.competitor_id
       where cs.id = competitor_snapshots.source_id
         and s.workspace_id in (select app.member_workspace_ids())
    )
  );

create policy t_select on competitor_changes for select to authenticated
  using (
    exists (
      select 1
        from competitor_sources cs
        join competitor_subscriptions s on s.competitor_id = cs.competitor_id
       where cs.id = competitor_changes.source_id
         and s.workspace_id in (select app.member_workspace_ids())
    )
  );

-- No write policies for anyone. Both tables are written by the nightly runner's
-- service account, and a customer able to write either could put words into
-- another subscriber's feed.
--
-- ── THE ONE RULE THAT GOVERNS `summary` ──────────────────────────────────────
-- Text on a competitor's page is UNTRUSTED INPUT. A rival's website can contain a
-- sentence addressed to whatever machine is reading it, and this codebase has met
-- a real one: a live crawl during onboarding hit an embedded instruction on a
-- public page. So the model that helps phrase a summary is given the page inside
-- @sahoda/research's quarantine wrapper, has no tools, and returns a fixed shape.
-- It cannot cause a row to be written here. The DECISION that something changed is
-- made by a deterministic comparison of two payloads, in code, before any model is
-- involved — the model only puts the already-decided difference into a sentence.
comment on column competitor_changes.summary is
  'Phrasing only. Whether a change occurred is decided by comparing two payloads '
  'in code; scraped text never decides that a row is written.';
