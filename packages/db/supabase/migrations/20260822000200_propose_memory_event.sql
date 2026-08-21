-- ─────────────────────────────────────────────────────────────────────────────
-- K2 · propose_memory_event — a learning the WEB app can offer
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT IS MISSING TODAY.
-- `memory_events` is the Brand Brain's proposal queue and it has exactly one
-- writer: `apps/jobs`, through `lib/loop/store.ts`, with a direct Postgres pool.
-- `public.resolve_memory_event` can ACCEPT or REJECT a proposal and nothing
-- client-reachable can MAKE one.
--
-- That was fine while the only thing that proposed learnings was a background
-- job. The knowledge library changes it: a person presses "Read my library" and
-- the resolve happens inside a request, in `apps/web`, which has no service-role
-- client at all (`lib/ops/service-rpc.ts` confines that key to the ops console
-- and a test asserts its client is never exported).
--
-- WHAT THIS FILE DOES. One function, in the same shape as the four beside it:
-- `security definer`, membership checked inside, execute granted to
-- `authenticated` and revoked from `anon`.
--
-- ── WHAT IT CANNOT DO, AND WHY THAT IS THE POINT ────────────────────────────
-- It writes a PROPOSAL. `status` is pinned to `'pending'` — the parameter does
-- not exist — so nothing reachable from a browser can create an already-accepted
-- learning, and this function names `brand_memory` nowhere. The only path from a
-- proposal to the brain is `public.resolve_memory_event`, which a person's click
-- reaches and this does not. That is the same contract `proposeLearning` states
-- in `apps/web/src/lib/loop/store.ts`, now enforced by the database rather than
-- by the caller remembering it.
--
-- `source` is constrained to the four the table already allows. A library-backed
-- resolve is an `'insight'`: something Sahoda noticed, which a person decides on.
--
-- IF THIS FILE IS WRONG: the library cannot offer what it read. Nothing existing
-- breaks — the Loop keeps writing through its own pool and the accept path is
-- untouched.
--
-- REVERSIBLE: `drop function public.propose_memory_event(uuid, jsonb, jsonb, text);`
--
-- APPLY ORDER: after 20260718000003_brand.sql. Independent of the library tables.


create or replace function public.propose_memory_event(
  p_workspace_id  uuid,
  p_diff          jsonb,
  p_evidence_refs jsonb default null,
  p_source        text default 'insight'
) returns memory_events
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user text;
  v_row  memory_events%rowtype;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;
  if not exists (
    select 1 from workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = v_user
  ) then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;

  if p_source is null or p_source not in ('insight', 'user', 'calibration', 'system') then
    raise exception 'INVALID_SOURCE' using errcode = 'raise_exception';
  end if;

  -- ── THE ENVELOPE `resolve_memory_event` WILL LATER REQUIRE ────────────────
  -- That function reads `diff -> 'patch'` and raises INVALID_DIFF if it is not a
  -- non-empty object. Checking it HERE means a malformed proposal is refused at
  -- the moment it is made, rather than sitting in the queue as a row that looks
  -- decidable and raises the instant somebody presses Accept.
  if jsonb_typeof(p_diff -> 'patch') is distinct from 'object'
     or (p_diff -> 'patch') = '{}'::jsonb then
    raise exception 'INVALID_DIFF' using errcode = 'raise_exception';
  end if;

  -- A ceiling, for the same reason `resolve_brand_memory` caps its payload at
  -- 32 KB: a patch is a narrow change to one brain, and anything larger is a
  -- caller sending the wrong thing.
  if octet_length(p_diff::text) > 32768 then
    raise exception 'INVALID_DIFF' using errcode = 'raise_exception';
  end if;

  insert into memory_events (workspace_id, source, diff, status, evidence_refs)
  values (p_workspace_id, p_source, p_diff, 'pending', p_evidence_refs)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.propose_memory_event(uuid, jsonb, jsonb, text) from public;
revoke execute on function public.propose_memory_event(uuid, jsonb, jsonb, text) from anon;
grant execute on function public.propose_memory_event(uuid, jsonb, jsonb, text) to authenticated;

-- The same assertion `20260822000100` makes, and for the same measured reason:
-- `revoke ... from public` removes the PUBLIC pseudo-role's grant and leaves the
-- one Supabase's default privileges hand directly to `anon`. A revoke that
-- targets nothing succeeds silently.
do $$
begin
  if has_function_privilege('anon', 'public.propose_memory_event(uuid, jsonb, jsonb, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.propose_memory_event(uuid, jsonb, jsonb, text)', 'EXECUTE')
  then
    raise exception 'propose_memory_event has the wrong grants';
  end if;
end;
$$;

comment on function public.propose_memory_event(uuid, jsonb, jsonb, text) is
  'Offers a Brand Brain change as a PENDING proposal. Names brand_memory '
  'nowhere and cannot write an accepted one — status is pinned, not a parameter. '
  'The only path from here to the brain is public.resolve_memory_event, which a '
  'person''s click reaches and this does not.';
