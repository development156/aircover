-- ─────────────────────────────────────────────────────────────────────────────
-- Slice B · 04 · LAYER 3 — the cross-tenant re-derivation, in SQL
--
-- Doc 13 §3, read twice as instructed:
--   "Zernio validates accountId against your whole TEAM, not against the profile
--    in the request. There is no server-side tenant boundary on publish. A wrong
--    accountId does not error. It publishes successfully to another customer's
--    account, returns HTTP 200, and hands back a platformPostUrl."
--
-- So there is no error to catch and no status code to check. The only defence is
-- to never send a wrong accountId, and the only way to be sure is to derive the
-- account FROM the caller rather than validate one the caller supplied.
--
-- WHY THIS SHIPS BEFORE THE BRANDED TYPE.
-- The TypeScript nominal type (layer 1) stops a developer who FORGETS. It cannot
-- stop `as unknown as ScopedAccountId`, because TypeScript has no soundness
-- guarantee against a double assertion — that hole is closed by lint, which is a
-- convention. This function is outside TypeScript entirely: a caller who defeats
-- layers 1 and 2 still cannot get an account id out of here that belongs to
-- another tenant, because the workspace comes from auth.jwt() and the profile is
-- looked up from it. Ordering the layers this way means the weakest link is never
-- the only link.
--
-- WHY IT RETURNS THE ID RATHER THAN A BOOLEAN.
-- A boolean invites `if (ok) publish(accountId)` — two statements, and the second
-- can drift from the first. Returning the VERIFIED id makes the only ergonomic
-- call shape the safe one: you publish what this function handed you, or you have
-- no id to publish with. It is the SQL half of the same idea as the branded type.
--
-- ⚠️ KNOWN GAP — apps/jobs CANNOT USE THIS FUNCTION.
-- Identity here is auth.jwt()->>'sub'. The Trigger.dev dispatcher runs with the
-- service role and has NO JWT, so every call from apps/jobs raises AUTH_REQUIRED.
-- That is deliberate — a jwt-derived guard is exactly what was asked for and it
-- covers the whole apps/web path — but it means the scheduled publish path is NOT
-- yet covered by layer 3. Closing it needs a separate answer (a signed job claim,
-- or a service-role variant that takes the workspace from a row it re-reads rather
-- than an argument). Flagged rather than papered over: a guard that silently does
-- not run on the publish path that matters most is worse than no guard.
--
-- Errors (SQLSTATE P0001): AUTH_REQUIRED · INVALID_WORKSPACE · INVALID_ACCOUNT ·
-- NOT_A_MEMBER · NO_PROFILE_MAPPING · CROSS_TENANT_ACCOUNT
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.assert_account_in_workspace_profile(
  p_workspace_id uuid,
  p_account_id   text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user     text;
  v_ws_id    uuid;
  v_mapped   text;
  v_verified text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;
  if p_account_id is null or p_account_id !~ '^[0-9a-f]{24}$' then
    raise exception 'INVALID_ACCOUNT' using errcode = 'raise_exception';
  end if;

  -- Membership from the JWT. No existence oracle, and from here on the ARGUMENT
  -- p_workspace_id is never read again — only v_ws_id.
  select m.workspace_id into v_ws_id
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;

  -- The profile is DERIVED from the workspace. It is never supplied.
  select profile_id into v_mapped from zernio_profiles where workspace_id = v_ws_id;
  if not found then
    raise exception 'NO_PROFILE_MAPPING' using errcode = 'raise_exception';
  end if;

  -- Both terms must hold, and both are re-read from the row rather than trusted:
  --   · the connection belongs to THIS workspace, and
  --   · the account it names sits under the profile mapped to THIS workspace.
  -- The second is not redundant. A row could carry a foreign profileId if it were
  -- ever written by a path other than upsert_zernio_connection — which is exactly
  -- the scenario a guard is for, since a guard that assumes its own writer is the
  -- only writer is an assumption, not a guard.
  select c.external_account ->> 'id' into v_verified
  from connections c
  where c.workspace_id                    = v_ws_id
    and c.platform                        = 'instagram'
    and c.external_account ->> 'id'       = p_account_id
    and c.external_account ->> 'profileId' = v_mapped
    and c.status                          = 'active';

  if v_verified is null then
    -- Deliberately one error for every failure mode below this line: wrong
    -- workspace, wrong profile, revoked, or absent. Distinguishing them would tell
    -- a caller which of another tenant's ids exist.
    raise exception 'CROSS_TENANT_ACCOUNT' using errcode = 'raise_exception';
  end if;

  return v_verified;
end;
$$;

comment on function public.assert_account_in_workspace_profile(uuid, text) is
  'Layer 3 of the cross-tenant guard (doc 13 §3). Returns the account id ONLY when '
  'it belongs to a connection in the caller''s workspace AND under the Zernio '
  'profile mapped to that workspace, with identity taken from auth.jwt(). Raises '
  'CROSS_TENANT_ACCOUNT for every other case. NOT usable from apps/jobs, which has '
  'no JWT — see the migration header.';

revoke all on function public.assert_account_in_workspace_profile(uuid, text)
  from public, anon;
grant execute on function public.assert_account_in_workspace_profile(uuid, text)
  to authenticated;
