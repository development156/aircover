-- ─────────────────────────────────────────────────────────────────────────────
-- RADAR · 1 of 2 — the shared competitor registry
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT RADAR IS. Every day, Radar checks what a customer's competitors posted,
-- what changed on their website, and what they are charging. This file creates
-- the list of who is being watched. The next file creates what was seen.
--
-- WHY THE REGISTRY IS SHARED, AND WHY THAT IS THE WHOLE DESIGN.
-- Ten bakeries in one city will track overlapping competitors — the same three
-- rivals appear on many customers' lists. If every customer got their own private
-- copy of a competitor, Radar would fetch the same Instagram profile ten times
-- every morning and pay ten times for one answer. Cost would grow with
-- customers × competitors, which is the shape that makes a feature unaffordable
-- at exactly the moment it becomes popular.
--
-- So a competitor is a GLOBAL row, and a workspace SUBSCRIBES to it. One fetch
-- serves every subscriber. Cost grows with the number of DISTINCT competitors,
-- which grows far more slowly than the customer list.
--
-- ⚠ AND THAT SHARING IS THE MOST DANGEROUS THING IN THIS FILE. ⚠
-- Because the rows are global, the ordinary rule this database is built on —
-- "every table carries workspace_id, filter on it, done" — CANNOT BE USED HERE.
-- `competitors` has no workspace_id to filter by. If the security rules are got
-- wrong, a customer can read the registry and work out WHO IS WATCHING WHOM.
--
-- That is not an ordinary data leak. A bakery discovering that the bakery across
-- the road is tracking it is a fact about our own paying customers, disclosed to
-- each other, and no apology repairs it. The rules in section 5 are written to
-- prevent exactly two things, and they are DIFFERENT things that must each be
-- prevented separately:
--
--   (a) reading a competitor you do not subscribe to; and
--   (b) seeing anything at all about another workspace's subscriptions.
--
-- Preventing (a) does not prevent (b). A policy that let you read every
-- subscription row for competitors you happen to share would satisfy (a)
-- perfectly and hand you (b) on a plate. They are proved separately in
-- packages/db/tests/radar_rls.test.ts, against the real database, from an
-- anon-key client carrying real member tokens.
--
-- IF THIS FILE IS WRONG: Radar cannot be used. Nothing already working breaks —
-- no existing table is altered, and no existing code reads any of these tables.
--
-- REVERSIBLE: yes, by dropping the three tables and the two functions. No data
-- outside Radar depends on them.


-- ── 1 of 6 ───────────────────────────────────────────────────────────────────
-- Turning what a customer typed into the key we deduplicate on.
--
-- Two customers adding the same rival will not type the same characters.
-- "https://www.Rival.com/", "rival.com" and "http://rival.com" are one website;
-- "@rival", "Rival" and "instagram.com/rival/" are one Instagram account. If those
-- land on different rows, the dedupe that pays for this feature quietly stops
-- working — and it stops working SILENTLY, showing correct results at double the
-- price, which is the worst way for a cost optimisation to fail.
--
-- So the key is computed, once, here — never in application code, where a second
-- implementation could drift from this one.
--
-- IMMUTABLE because a CHECK constraint below calls it: Postgres will only allow
-- that for a function whose answer depends on nothing but its arguments.
create or replace function app.radar_normalize_locator(p_kind text, p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(btrim(coalesce(p_raw, '')));
begin
  if v = '' then
    raise exception 'RADAR_EMPTY_LOCATOR' using errcode = 'raise_exception';
  end if;

  if p_kind = 'website' then
    -- Reduce to a bare host. The scheme, the "www.", any path, query or fragment,
    -- and a trailing dot are all removed: they are ways of writing the same site,
    -- not different sites.
    v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');   -- scheme
    v := split_part(v, '/', 1);                            -- path
    v := split_part(v, '?', 1);
    v := split_part(v, '#', 1);
    v := split_part(v, '@', 2 - (case when position('@' in v) = 0 then 1 else 0 end));
    v := regexp_replace(v, ':\d+$', '');                   -- port
    v := regexp_replace(v, '^www\.', '');
    v := regexp_replace(v, '\.$', '');
    if v !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
      raise exception 'RADAR_BAD_DOMAIN: %', p_raw using errcode = 'raise_exception';
    end if;
    return v;
  end if;

  -- Every other kind is a handle on a platform. Accept the handle, the @handle,
  -- or the profile URL someone copied out of their browser.
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := regexp_replace(v, '^(www\.)?(instagram|x|twitter|linkedin|facebook)\.com/', '');
  v := regexp_replace(v, '^(company|in|school)/', '');     -- linkedin.com/company/<slug>
  v := split_part(v, '/', 1);
  v := split_part(v, '?', 1);
  v := regexp_replace(v, '^@', '');
  if v !~ '^[a-z0-9._-]{1,100}$' then
    raise exception 'RADAR_BAD_HANDLE: %', p_raw using errcode = 'raise_exception';
  end if;
  return v;
end;
$$;

comment on function app.radar_normalize_locator(text, text) is
  'The dedupe key for a Radar source. One rival typed three different ways must '
  'reduce to one row, or the shared registry silently pays twice for one answer.';


-- ── 2 of 6 ───────────────────────────────────────────────────────────────────
-- WHO a competitor is. Global: no workspace_id, deliberately.
--
-- Almost nothing lives here, and that is on purpose. The only thing every
-- subscriber agrees about a competitor is its identity; what to CALL it is a
-- matter of opinion and lives on each workspace's own subscription row, so one
-- customer renaming a rival cannot change what another customer sees.
create table competitors (
  id uuid primary key default gen_random_uuid(),

  -- A neutral display name, used only when a workspace has not supplied its own.
  -- Written by whoever subscribed first and never rewritten afterwards, because a
  -- later subscriber overwriting it would be one customer editing another
  -- customer's screen.
  display_name text not null check (length(btrim(display_name)) between 1 and 200),

  created_at timestamptz not null default now()
);


-- ── 3 of 6 ───────────────────────────────────────────────────────────────────
-- WHAT WE ACTUALLY FETCH. One row per place a competitor can be watched.
--
-- A competitor is not one thing to fetch — it is a website AND an Instagram
-- account AND perhaps an X account, each on its own schedule, each with its own
-- history and its own price. Keeping them apart is what lets social be checked
-- daily (which is where the value is) while a website is checked weekly, and it
-- is what makes the uniqueness rule below the real dedupe key: two workspaces may
-- name a competitor differently but they will point at the same Instagram handle.
create table competitor_sources (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors (id) on delete cascade,

  -- 'website' is fetched by us. The rest are fetched through a scraping provider,
  -- because no platform offers an API for reading an account you do not own.
  kind text not null check (kind in ('website', 'instagram', 'x', 'linkedin', 'facebook')),

  -- The normalised key from section 1. The CHECK is what makes the uniqueness
  -- rule below trustworthy: without it a row could be inserted in un-normalised
  -- form, sit beside its own duplicate, and pass every constraint.
  locator text not null check (locator = app.radar_normalize_locator(kind, locator)),

  -- How often this is worth checking. Social moves daily and that is the point of
  -- Radar; a pricing page moves perhaps monthly, so checking it daily would pay
  -- full price for "nothing happened" thirty times a month.
  cadence text not null check (cadence in ('daily', 'weekly')),

  -- ── the cheap-check's memory ────────────────────────────────────────────────
  -- These four columns are what let tomorrow's check cost nothing. `etag` and
  -- `last_modified` are handed back to the server so it can answer "304 Not
  -- Modified" without sending the page at all; `content_hash` is the fallback for
  -- the servers that offer neither.
  --
  -- MUTABLE, unlike everything in the next file. This is the checker's scratchpad,
  -- not a record of what was true — the record is competitor_snapshots.
  etag text,
  last_modified text,
  content_hash text,

  -- When Radar last successfully SAW this source. Kept separate from "when Radar
  -- last tried", which lives in the fetch log, because this codebase has a
  -- standing rule that a sync stamp proves a sync ran and never that anything was
  -- seen. A source that has failed for three days must not look fresh.
  last_seen_at timestamptz,

  created_at timestamptz not null default now(),

  -- THE DEDUPE KEY. One row per real-world place, globally. This single line is
  -- what makes a hundred customers cost what a hundred competitors cost.
  unique (kind, locator)
);

create index on competitor_sources (competitor_id);
-- The runner's own query: "what is due today?", cheapest first.
create index on competitor_sources (cadence, last_seen_at nulls first);


-- ── 4 of 6 ───────────────────────────────────────────────────────────────────
-- WHO IS WATCHING WHOM. This is the sensitive table in the product.
create table competitor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  competitor_id uuid not null references competitors (id) on delete cascade,

  -- This workspace's own name for the rival. Private to them: one customer's
  -- label is never shown to another, which is why it is here and not on
  -- `competitors`.
  label text check (label is null or length(btrim(label)) between 1 and 200),

  created_by text not null,
  created_at timestamptz not null default now(),

  -- Subscribing twice is the same as subscribing once.
  unique (workspace_id, competitor_id)
);

create index on competitor_subscriptions (workspace_id);
-- Serves the security rules in section 5, which ask "does anyone in my
-- workspaces subscribe to this competitor?" on every single read of the global
-- tables. Without this index that question is a full scan, on every read.
create index on competitor_subscriptions (competitor_id);


-- ── 5 of 6 ───────────────────────────────────────────────────────────────────
-- THE SECURITY RULES. Read the header of this file before changing anything here.
--
-- `competitor_subscriptions` carries workspace_id, so it gets the ordinary house
-- policy — members see their own workspaces' rows and nobody else's. That single
-- line is what prevents leak (b): there is no path from "we both watch the same
-- rival" to "and here is their row", because the filter is on workspace_id and
-- never on competitor_id.
alter table competitor_subscriptions enable row level security;

create policy t_select on competitor_subscriptions for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- Unsubscribing and renaming are safe to do directly: both act on a row the
-- caller can already see, and neither reveals anything about the registry.
create policy t_update on competitor_subscriptions for update to authenticated
  using (workspace_id in (select app.member_workspace_ids()))
  with check (workspace_id in (select app.member_workspace_ids()));

create policy t_delete on competitor_subscriptions for delete to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

-- ⚠ THERE IS DELIBERATELY NO INSERT POLICY. ⚠
-- Subscribing needs the competitor's id, and a customer cannot be given a way to
-- go looking for one. Worse, `competitor_sources` has a uniqueness rule on
-- (kind, locator): if a customer could attempt an insert, the DIFFERENCE between
-- "row created" and "duplicate key" would tell them whether that rival is already
-- in the registry — which is leak (a) through the writing door instead of the
-- reading one. Subscribing goes through the function in section 6, which never
-- reports whether anything already existed.

-- The two global tables. Neither has a workspace_id, so neither can use the house
-- helper; each gets a rule written out by hand. The rule is the same sentence in
-- both cases — "only if one of my workspaces subscribes to this competitor" —
-- and it is written twice because there are two tables and no way to share it.
alter table competitors enable row level security;

create policy t_select on competitors for select to authenticated
  using (
    exists (
      select 1 from competitor_subscriptions s
       where s.competitor_id = competitors.id
         and s.workspace_id in (select app.member_workspace_ids())
    )
  );

alter table competitor_sources enable row level security;

create policy t_select on competitor_sources for select to authenticated
  using (
    exists (
      select 1 from competitor_subscriptions s
       where s.competitor_id = competitor_sources.competitor_id
         and s.workspace_id in (select app.member_workspace_ids())
    )
  );

-- No INSERT, UPDATE or DELETE policy on either global table, for anyone. The
-- registry is written by the function below and by the nightly runner's service
-- account, and by nothing else. A customer editing a shared row would be editing
-- every other subscriber's data.


-- ── 6 of 6 ───────────────────────────────────────────────────────────────────
-- SUBSCRIBING. The only way a workspace joins the registry.
--
-- It resolves-or-creates the competitor and its sources, then subscribes the
-- workspace. It is SECURITY DEFINER because resolving requires reading rows the
-- caller must not be able to read — which is the entire reason this is a function
-- and not an insert.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: whether anything already existed. A
-- `created: true/false` flag, or returning a competitor's `created_at`, would
-- answer "is my rival already being watched by someone?" — the question this
-- whole file exists to refuse. It returns the subscription, and the ids of rows
-- the caller is now entitled to see.
create or replace function app.radar_subscribe(
  p_workspace_id uuid,
  p_display_name text,
  p_sources jsonb,          -- [{"kind":"website","locator":"rival.com"}, …]
  p_created_by text,
  p_label text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src          jsonb;
  v_kind         text;
  v_locator      text;
  v_competitor   uuid;
  v_existing     uuid;
  v_sub          competitor_subscriptions%rowtype;
  v_source_ids   uuid[] := '{}';
  v_source_id    uuid;
begin
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    raise exception 'RADAR_NO_SOURCES' using errcode = 'raise_exception';
  end if;

  -- Normalise everything FIRST, so a competitor is never half-created and then
  -- abandoned by a bad locator in the third entry.
  for v_src in select * from jsonb_array_elements(p_sources) loop
    v_kind := v_src ->> 'kind';
    if v_kind is null or v_kind not in ('website', 'instagram', 'x', 'linkedin', 'facebook') then
      raise exception 'RADAR_BAD_KIND: %', coalesce(v_kind, 'null') using errcode = 'raise_exception';
    end if;
    -- Raises on anything unusable. Deliberately before any write.
    perform app.radar_normalize_locator(v_kind, v_src ->> 'locator');
  end loop;

  -- Does any of these sources already name a competitor we hold? If so this is
  -- the SAME rival someone else is already watching, and the whole point is to
  -- attach to that row rather than create a second one.
  for v_src in select * from jsonb_array_elements(p_sources) loop
    v_kind := v_src ->> 'kind';
    v_locator := app.radar_normalize_locator(v_kind, v_src ->> 'locator');
    select cs.competitor_id into v_existing
      from competitor_sources cs
     where cs.kind = v_kind and cs.locator = v_locator
     limit 1;
    exit when v_existing is not null;
  end loop;

  if v_existing is not null then
    v_competitor := v_existing;
  else
    insert into competitors (display_name)
    values (coalesce(nullif(btrim(p_display_name), ''), 'Competitor'))
    returning id into v_competitor;
  end if;

  -- Attach any source this competitor does not have yet. `on conflict do nothing`
  -- rather than an update: a source already in the registry belongs to every
  -- subscriber, and a new subscriber must not be able to move it or re-time it.
  for v_src in select * from jsonb_array_elements(p_sources) loop
    v_kind := v_src ->> 'kind';
    v_locator := app.radar_normalize_locator(v_kind, v_src ->> 'locator');

    insert into competitor_sources (competitor_id, kind, locator, cadence)
    values (
      v_competitor,
      v_kind,
      v_locator,
      -- Social daily, because that is where the value is. Web weekly, with cheap
      -- checks in between — see the next file.
      case when v_kind = 'website' then 'weekly' else 'daily' end
    )
    on conflict (kind, locator) do nothing
    returning id into v_source_id;

    if v_source_id is null then
      select id into v_source_id from competitor_sources
       where kind = v_kind and locator = v_locator;
    end if;
    v_source_ids := v_source_ids || v_source_id;
  end loop;

  insert into competitor_subscriptions (workspace_id, competitor_id, label, created_by)
  values (p_workspace_id, v_competitor, nullif(btrim(p_label), ''), p_created_by)
  on conflict (workspace_id, competitor_id) do update
    set label = coalesce(excluded.label, competitor_subscriptions.label)
  returning * into v_sub;

  return jsonb_build_object(
    'subscription', to_jsonb(v_sub),
    'competitor_id', v_competitor,
    'source_ids', to_jsonb(v_source_ids)
  );
end;
$$;

comment on function app.radar_subscribe(uuid, text, jsonb, text, text) is
  'The only way a workspace joins the shared competitor registry. SECURITY '
  'DEFINER because resolving a competitor requires reading rows the caller must '
  'not be able to read. Never reports whether the competitor already existed.';

-- The function is reachable through the data API only via the wrapper the app
-- calls; `app` is not an exposed schema, so this is server-side only, exactly
-- like upsert_connection beside it.
revoke all on function app.radar_subscribe(uuid, text, jsonb, text, text) from public;
grant execute on function app.radar_subscribe(uuid, text, jsonb, text, text) to service_role;
