-- ─────────────────────────────────────────────────────────────────────────────
-- public.resolve_brand_memory — shape guard extended for Brand Brain v2.
--
-- v2 (doc 18 §3) replaces the single `customer_persona` with `audiences[]`,
-- moves `core_promise` onto the audience (a school promises parents a safe
-- rigorous place and promises students somewhere they are known), splits
-- `red_lines` into `mandated` (regime pack, not owner-editable) and `owner`
-- (ASKED, never guessed), and carries `meta` — kind + confirmed + source — on
-- every section so an extracted sentence stays distinguishable from one a
-- founder typed.
--
-- DUAL-ACCEPT, AND THAT IS THE POINT OF THIS MIGRATION'S SHAPE.
-- Seven active brains are v1 today. A guard that only admitted v2 would make
-- every one of them unsaveable the moment it applied — a Refine-then-Finish on
-- an existing workspace would fail with INVALID_PAYLOAD and the owner would
-- have no way to tell why. The version is read from `payload->>'version'`; a
-- payload without it is v1, which is exactly what every existing row looks like.
-- Drop the v1 branch only after the brains are migrated AND nothing writes v1.
--
-- ARRAY-LENGTH DISCIPLINE, KEPT WHERE IT STILL APPLIES.
-- v1 pins signature_phrases / core_values / sample_hooks at EXACTLY 3 and that
-- branch is untouched. v2 does not: `@sahoda/shared`'s v2 schema declares them
-- as plain arrays, and a SQL guard stricter than the zod contract it mirrors
-- would reject payloads the application considers valid — the failure would
-- read as a database bug from every angle except the one that explains it. What
-- v2 keeps is the ABUSE CEILING: brand_memory feeds the mesh brand-context
-- prefix prepended to every model call, so an oversized brain bills provider
-- tokens forever against a fixed credit price.
--
-- EVERYTHING ELSE IS UNCHANGED and must stay that way: identity from
-- auth.jwt() only, guards before the advisory lock, membership resolving
-- p_workspace_id into v_ws_id with nothing below reading the argument again,
-- role ALLOWLIST, supersede-before-insert, max(version) across ALL statuses,
-- content-based replay, VOLATILE under READ COMMITTED. See
-- 20260719094548_resolve_brand_memory.sql for why each one is load-bearing.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_brand_memory(
  p_workspace_id     uuid,
  p_payload          jsonb,
  p_source           text default 'resolved',  -- resolved | manual | system
  p_expected_version int default null           -- optimistic check; null = skip
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_max_bytes     constant int := 32768;
  c_max_list      constant int := 40;
  c_max_audiences constant int := 10;
  v_user      text;
  v_source    text;
  v_key       text;
  v_ws_id     uuid;
  v_role      text;
  v_cur       brand_memory%rowtype;
  v_row       brand_memory%rowtype;
  v_found     boolean;
  v_version   int;
  v_schema    int;
  v_primaries int;
  v_bad       int;
begin
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- 2) boundary validation. Every guard stays NULL-total: PostgREST forwards an
  --    explicit JSON null verbatim and comparisons against NULL are NULL, never
  --    true, so a bare `jsonb_typeof(x) <> 'object'` waves a null payload
  --    straight through to a raw 23502. Hence coalesce / is distinct from.
  v_source := coalesce(p_source, 'resolved');
  if v_source not in ('resolved', 'manual', 'system') then
    raise exception 'INVALID_SOURCE' using errcode = 'raise_exception';
  end if;

  if p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > c_max_bytes then
    raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
  end if;

  -- A payload with no `version` is v1 — which is what every existing row is.
  v_schema := coalesce((p_payload ->> 'version')::int, 1);
  if v_schema not in (1, 2) then
    raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
  end if;

  if v_schema = 1 then
    -- ── v1: unchanged from 20260719094548 ──────────────────────────────────
    foreach v_key in array array[
      'voice', 'brand_persona', 'customer_persona', 'hook', 'taboo', 'alignment'
    ] loop
      if jsonb_typeof(p_payload -> v_key) is distinct from 'object' then
        raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
      end if;
    end loop;

    if jsonb_typeof(p_payload #> '{voice,signature_phrases}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{voice,signature_phrases}') <> 3
       or jsonb_typeof(p_payload #> '{brand_persona,core_values}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{brand_persona,core_values}') <> 3
       or jsonb_typeof(p_payload #> '{hook,sample_hooks}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{hook,sample_hooks}') <> 3
       or jsonb_typeof(p_payload #> '{voice,banned_phrases}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{voice,banned_phrases}') > c_max_list
       or jsonb_typeof(p_payload #> '{taboo,red_lines}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{taboo,red_lines}') > c_max_list
       or coalesce(p_payload #>> '{alignment,signal_lock}', '') not in ('strong', 'moderate', 'weak')
    then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

  else
    -- ── v2 ─────────────────────────────────────────────────────────────────
    foreach v_key in array array['voice', 'brand_persona', 'hook', 'red_lines', 'alignment'] loop
      if jsonb_typeof(p_payload -> v_key) is distinct from 'object' then
        raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
      end if;
    end loop;

    if jsonb_typeof(p_payload -> 'audiences') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'audiences') < 1
       or jsonb_array_length(p_payload -> 'audiences') > c_max_audiences then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

    -- THE INVARIANT, ENFORCED HERE RATHER THAN IN TYPESCRIPT.
    --
    -- Exactly one primary audience. Zero leaves every consumer picking one
    -- arbitrarily — and "arbitrarily" means a different answer per query plan,
    -- so the brand would speak to a different person depending on row order.
    -- Two is the same bug twice over. The zod schema says this as well, but zod
    -- only runs where our code runs: this function is client-reachable by any
    -- signed-in member with arbitrary arguments, so the guards here ARE the
    -- trust boundary. A rule that lives only in the application layer
    -- disappears the first time something else writes the row.
    --
    -- `-> 'primary' = 'true'::jsonb` rather than a ::boolean cast: an audience
    -- whose `primary` is a string, a number or absent must simply not count,
    -- not raise 22P02 and surface to a browser as a 500.
    select count(*) into v_primaries
    from jsonb_array_elements(p_payload -> 'audiences') a
    where a -> 'primary' = 'true'::jsonb;

    if v_primaries <> 1 then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

    -- Every audience carries the fields v2 exists to add. core_promise lives on
    -- the AUDIENCE, not on hook, because the promise varies by audience — that
    -- move is the whole reason for the array.
    select count(*) into v_bad
    from jsonb_array_elements(p_payload -> 'audiences') a
    where coalesce(a ->> 'id', '') = ''
       or jsonb_typeof(a -> 'one_liner') is distinct from 'string'
       or jsonb_typeof(a -> 'core_promise') is distinct from 'string'
       or jsonb_typeof(a -> 'pains') is distinct from 'array'
       or jsonb_array_length(a -> 'pains') > c_max_list
       or jsonb_typeof(a -> 'meta') is distinct from 'object'
       or coalesce(a #>> '{meta,kind}', '') not in ('mandated', 'asked', 'negotiated', 'derived')
       or jsonb_typeof(a #> '{meta,confirmed}') is distinct from 'boolean'
       or coalesce(a #>> '{meta,source}', '') = '';

    if v_bad > 0 then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

    -- FieldMeta on every remaining section. `confirmed` must be a real boolean:
    -- the whole point of the field is that a crawled sentence and a founder's
    -- sentence stay distinguishable, and a truthy string would quietly confirm
    -- something nobody agreed to.
    foreach v_key in array array['voice', 'brand_persona', 'hook', 'alignment'] loop
      if jsonb_typeof(p_payload -> v_key -> 'meta') is distinct from 'object'
         or coalesce(p_payload #>> array[v_key, 'meta', 'kind'], '')
              not in ('mandated', 'asked', 'negotiated', 'derived')
         or jsonb_typeof(p_payload #> array[v_key, 'meta', 'confirmed']) is distinct from 'boolean'
         or coalesce(p_payload #>> array[v_key, 'meta', 'source'], '') = '' then
        raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
      end if;
    end loop;

    -- red_lines: BOTH tiers present, both arrays, both capped. `mandated` is
    -- the regime pack's and the owner may not edit it; `owner` is ASKED and
    -- never guessed. Each mandated entry must name its rule and where it came
    -- from — a rule the owner cannot change and cannot trace is not auditable.
    if jsonb_typeof(p_payload #> '{red_lines,mandated}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{red_lines,mandated}') > c_max_list
       or jsonb_typeof(p_payload #> '{red_lines,owner}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{red_lines,owner}') > c_max_list then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

    select count(*) into v_bad
    from jsonb_array_elements(p_payload #> '{red_lines,mandated}') m
    where coalesce(m ->> 'rule', '') = ''
       or coalesce(m ->> 'source', '') = ''
       or coalesce(m ->> 'ruleset_version', '') = '';

    if v_bad > 0 then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;

    -- Abuse ceilings only. NOT exactly-3: v2's zod contract declares these as
    -- plain arrays, and a guard stricter than the contract it mirrors rejects
    -- payloads the application considers valid.
    if jsonb_typeof(p_payload #> '{voice,signature_phrases}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{voice,signature_phrases}') > c_max_list
       or jsonb_typeof(p_payload #> '{voice,banned_phrases}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{voice,banned_phrases}') > c_max_list
       or jsonb_typeof(p_payload #> '{brand_persona,core_values}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{brand_persona,core_values}') > c_max_list
       or jsonb_typeof(p_payload #> '{hook,sample_hooks}') is distinct from 'array'
       or jsonb_array_length(p_payload #> '{hook,sample_hooks}') > c_max_list
       or coalesce(p_payload #>> '{alignment,signal_lock}', '') not in ('strong', 'moderate', 'weak')
    then
      raise exception 'INVALID_PAYLOAD' using errcode = 'raise_exception';
    end if;
  end if;

  -- 3) membership + role allowlist. A non-member gets NOT_A_MEMBER whether or
  --    not the workspace exists — no existence oracle. From here on: v_ws_id.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 4) serialize resolves for this workspace
  perform pg_advisory_xact_lock(hashtextextended('resolve_brand:' || v_ws_id::text, 0));

  select * into v_cur from brand_memory
  where workspace_id = v_ws_id and status = 'active';
  v_found := found;

  -- 5) optimistic concurrency
  if p_expected_version is not null
     and coalesce(v_cur.version, 0) <> p_expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'raise_exception';
  end if;

  -- 6) content idempotency
  if v_found
     and v_cur.payload = p_payload
     and not (v_cur.source = 'system' and v_source <> 'system') then
    return jsonb_build_object(
      'brand_memory', to_jsonb(v_cur),
      'version', v_cur.version,
      'replayed', true
    );
  end if;

  -- 7) next version across ALL statuses, supersede, then insert
  select coalesce(max(version), 0) + 1 into v_version
  from brand_memory where workspace_id = v_ws_id;

  update brand_memory set status = 'superseded'
  where workspace_id = v_ws_id and status = 'active';

  begin
    insert into brand_memory (workspace_id, version, status, payload, source, created_by)
    values (v_ws_id, v_version, 'active', p_payload, v_source, v_user)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'VERSION_CONFLICT' using errcode = 'raise_exception';
  end;

  return jsonb_build_object(
    'brand_memory', to_jsonb(v_row),
    'version', v_row.version,
    'replayed', false
  );
end;
$$;

-- Re-stated rather than assumed. CREATE OR REPLACE preserves grants, but the
-- signature must be spelled in full or a revoke silently targets nothing.
revoke all on function public.resolve_brand_memory(uuid, jsonb, text, int)
  from public, anon;
grant execute on function public.resolve_brand_memory(uuid, jsonb, text, int)
  to authenticated, service_role;
