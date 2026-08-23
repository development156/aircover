-- ─────────────────────────────────────────────────────────────────────────────
-- Radar · the subscribe path, opened to signed-in members
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT WAS WRONG. `app.radar_subscribe` is granted to `service_role` ONLY, and
-- `app` is not an exposed schema, so nothing a customer's session can reach could
-- call it. `supabaseRadarStore.add()` therefore threw "Radar is not collecting
-- yet". Ingestion works — the cheap check measured 8/8, the cost cap was proven to
-- refuse before spending, SSRF is closed for every encoding including via redirect
-- — and all five tables are EMPTY because nobody can put anything in them. The
-- feature was complete and unreachable.
--
-- ⚠ WHY THE INNER FUNCTION IS NOT SIMPLY GRANTED TO `authenticated`. ⚠
-- Because it would be a cross-tenant WRITE. `app.radar_subscribe` takes
-- `p_workspace_id` AND `p_created_by` and trusts both completely: it checks no
-- membership, because until now its only caller was the service role. Granted
-- as-is, any signed-in user could subscribe a competitor on behalf of ANY
-- workspace, and stamp anyone's user id on the row.
--
-- So the inner function is left exactly as it is — service-role only, still the
-- place the registry's dedupe and its no-existence-oracle discipline live — and a
-- wrapper in `public` becomes the door. The wrapper does what every other
-- client-reachable function in this schema does (see `public.upsert_connection`
-- and `public.resolve_brand_memory`): identity from the JWT, membership before
-- anything, and NO ACTOR ARGUMENT AT ALL.
--
-- `p_created_by` is absent from this signature on purpose. A parameter that names
-- the actor is a parameter that can lie about the actor.
--
-- ── WHAT THIS DOES NOT CHANGE, AND MUST NOT ─────────────────────────────────
-- No INSERT policy is added to `competitor_subscriptions`. The header of
-- 20260822060000 explains why at length and it is still true: subscribing needs a
-- competitor's id, a customer cannot be given a way to go looking for one, and the
-- difference between "row created" and "duplicate key" on `competitor_sources`
-- would itself answer "is this rival already being watched by someone?". The
-- SECURITY DEFINER wrapper needs no INSERT policy, which is exactly why it is the
-- right shape.
--
-- The two disclosure rules are untouched:
--   (a) a workspace sees only competitors IT subscribes to;
--   (b) a workspace can never see another workspace's subscriptions, and cannot
--       learn how many others watch the same rival.
-- Both are enforced by the SELECT policies already on the three tables. This file
-- adds a write door and nothing else.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.radar_subscribe(
  p_workspace_id uuid,
  p_display_name text,
  p_sources      jsonb,   -- [{"kind":"website","locator":"rival.com"}, …]
  p_label        text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user  text;
  v_ws_id uuid;
  v_role  text;
begin
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- 2) membership + role allowlist. A non-member gets NOT_A_MEMBER whether or not
  --    the workspace exists — no existence oracle. From here on: v_ws_id only, so
  --    nothing below can read the argument again.
  --
  --    'viewer' is deliberately excluded. Subscribing is not a read: every source
  --    added here is fetched every night, on our card, for ever. That is a
  --    spending decision, and it belongs with the roles that make spending
  --    decisions — the same allowlist `upsert_connection` uses.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- 3) delegate. The inner function keeps the registry rules — normalise every
  --    locator before writing anything, attach to an existing competitor rather
  --    than creating a second one, and never report whether it already existed.
  --
  --    `v_user` is passed as the actor. It came from the JWT four statements ago
  --    and there is no argument that could have supplied it.
  return app.radar_subscribe(v_ws_id, p_display_name, p_sources, v_user, p_label);
end;
$$;

comment on function public.radar_subscribe(uuid, text, jsonb, text) is
  'The client-reachable door to the competitor registry. Identity from auth.jwt(), '
  'membership checked before anything is written, and no actor argument — the '
  'inner app.radar_subscribe trusts its arguments and must stay service-role only.';

-- Client-reachable by design, but only for signed-in members. The signature must
-- be spelled in full or the revoke/grant silently targets nothing.
--
-- The service_role grant is inert today: with no JWT, `auth.jwt()` is null and the
-- first guard raises AUTH_REQUIRED. It mirrors upsert_connection and
-- resolve_brand_memory, and must NOT be "fixed" with an actor argument.
revoke all on function public.radar_subscribe(uuid, text, jsonb, text) from public, anon;
grant execute on function public.radar_subscribe(uuid, text, jsonb, text)
  to authenticated, service_role;
