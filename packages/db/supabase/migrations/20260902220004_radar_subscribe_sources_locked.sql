-- ─────────────────────────────────────────────────────────────────────────────
-- radar · a subscriber may not add sources to a competitor it did not create
--
-- ── THE HOLE ─────────────────────────────────────────────────────────────────
-- `app.radar_subscribe` (20260822060000) resolves the competitor from the FIRST
-- entry of `p_sources` that already exists in the registry, then attaches EVERY
-- entry of `p_sources` to that competitor (`on conflict (kind, locator) do
-- nothing`). The public door (20260823030000) checks identity, membership and
-- role, and passes `p_sources` through untouched. So workspace B, calling
-- `radar_subscribe(ws_B, 'x', [{website rival.com}, {instagram bakery_a_owner}])`
-- when workspace A already watches rival.com, permanently attaches an Instagram
-- handle A never entered to the competitor A reads. A's card can start showing
-- B's locator (the app takes `sources[0]` with no ORDER BY), A's change feed
-- carries diffs of pages B chose, and every source parked this way is fetched
-- nightly outside B's own per-workspace spend cap, which only engages when a
-- competitor has exactly one subscriber.
--
-- MEASURED 2026-09-02 in PGlite with the full migration set: A subscribed
-- [{website rival.com}]; B then subscribed [{website rival.com},
-- {instagram bakery_a_owner}, {website other.com}]; B got the SAME competitor_id
-- and `competitor_sources` for it held all three rows, all readable by A.
--
-- ── THE GUARD ────────────────────────────────────────────────────────────────
-- Sources are attached ONLY in the call that creates the competitor. When the
-- competitor already exists, every entry of `p_sources` must already belong to
-- it; the first one that does not raises RADAR_SOURCES_LOCKED and the whole call
-- rolls back (no subscription row, no stray competitor for the extra source).
--
-- Nothing the product does is narrowed by this. `apps/web/src/lib/radar/store.ts`
-- sends exactly ONE source per call, and a one-source call can never be locked:
-- if that source matched an existing competitor it belongs to it by definition,
-- and if it did not, the competitor is new and the attach loop runs as before.
-- The dedupe the registry exists for ("two workspaces naming one rival share
-- one row") is untouched. The "sole subscriber may extend" case is deliberately
-- NOT carved out: the app has no flow that extends an existing competitor, and a
-- rule that depends on how many OTHER workspaces subscribe answers, through its
-- success or refusal, a question the registry has refused to answer since its
-- first line.
--
-- What this refusal DOES disclose, stated so nobody rediscovers it: a caller who
-- hand-crafts a two-source call learns whether the first source already existed
-- in the registry, because the call is refused only then. Today the same caller
-- learns nothing from a two-source call and silently rewrites another tenant's
-- watch list; a refusal that names a locked row is the smaller of the two leaks
-- and the only one that does not corrupt anybody's data. An owner ruling could
-- later swap the raise for a silent skip of the extra sources (same test, one
-- assertion retargeted); the write boundary is the same either way.
--
-- The whole function is restated (`create or replace`) rather than the applied
-- 20260822060000 file being edited: applied migrations are immutable. Grants are
-- preserved by `create or replace`; the function stays service-role only and
-- reachable through `public.radar_subscribe` alone.
--
-- ── THE PROOF ────────────────────────────────────────────────────────────────
-- packages/db/tests/radar_subscribe_sources_locked.pglite.test.ts. Mutation:
-- delete the `raise exception 'RADAR_SOURCES_LOCKED'` branch below (or change
-- the `if v_existing is not null` guard around the attach loop to `if true`);
-- B's extra source attaches, A reads it, and the suite goes red.
-- ─────────────────────────────────────────────────────────────────────────────

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

    -- THE LOCK. An existing competitor's source list belongs to every workspace
    -- that already reads it. A new subscriber joins it; it does not extend it.
    -- Every entry must already be one of this competitor's sources, and the
    -- ids are collected from the rows that exist rather than written.
    for v_src in select * from jsonb_array_elements(p_sources) loop
      v_kind := v_src ->> 'kind';
      v_locator := app.radar_normalize_locator(v_kind, v_src ->> 'locator');

      select cs.id into v_source_id
        from competitor_sources cs
       where cs.competitor_id = v_competitor
         and cs.kind = v_kind
         and cs.locator = v_locator;
      if v_source_id is null then
        raise exception 'RADAR_SOURCES_LOCKED' using errcode = 'raise_exception';
      end if;
      v_source_ids := v_source_ids || v_source_id;
    end loop;
  else
    insert into competitors (display_name)
    values (coalesce(nullif(btrim(p_display_name), ''), 'Competitor'))
    returning id into v_competitor;

    -- Attach every source. This branch only runs for a competitor created in
    -- THIS call, so nobody else reads these rows yet. `on conflict do nothing`
    -- is kept for the one remaining collision: two entries of p_sources that
    -- normalise to the same (kind, locator).
    for v_src in select * from jsonb_array_elements(p_sources) loop
      v_kind := v_src ->> 'kind';
      v_locator := app.radar_normalize_locator(v_kind, v_src ->> 'locator');

      insert into competitor_sources (competitor_id, kind, locator, cadence)
      values (
        v_competitor,
        v_kind,
        v_locator,
        -- Social daily, because that is where the value is. Web weekly, with cheap
        -- checks in between — see radar_snapshots.
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
  end if;

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
  'not be able to read. Never reports whether the competitor already existed. '
  'Sources are attached only in the call that creates the competitor: joining an '
  'existing one with a source it does not have raises RADAR_SOURCES_LOCKED.';

-- Restated so the boundary is visible in the file that now defines the body:
-- service-role only, reached by members through public.radar_subscribe.
revoke all on function app.radar_subscribe(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function app.radar_subscribe(uuid, text, jsonb, text, text)
  to service_role;
