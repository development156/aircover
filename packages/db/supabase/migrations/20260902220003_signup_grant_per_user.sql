-- ─────────────────────────────────────────────────────────────────────────────
-- public.bootstrap_workspace — the signup grant is minted once per PERSON.
--
-- ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────
-- The workspace dedupe in bootstrap_workspace is the advisory lock (step 3) plus
-- the owner replay guard (step 4), and both key off `workspace_members`. The
-- grant's idempotency key is per WORKSPACE. `public.erase_workspace` deletes the
-- caller's membership row and tombstones the workspace, so the sequence
--
--     bootstrap → erase → bootstrap
--
-- created a second workspace and wrote a second 100-credit GRANT, and the loop
-- could be repeated without limit from one Clerk account. MEASURED on PGlite
-- with every migration applied: three cycles, three distinct
-- `grant:signup:<ws>` keys, 100 credits on each. LEARNINGS 2026-08-23 had
-- declared "unlimited free workspaces x 100 credits" closed on the strength of
-- the replay guard; erasure removes exactly the row that reasoning relied on.
--
-- ── WHY THE LEDGER IS THE RIGHT PLACE TO REMEMBER ────────────────────────────
-- Erasure deletes every workspace-owned table EXCEPT the four the law says to
-- keep, and `credit_ledger` is one of them. Its `actor` column carries the
-- Clerk sub that bootstrap_workspace wrote. So "has this person ever been
-- granted signup credits" survives the erasure of every identity-table signal,
-- and is answerable with one indexed read before the grant is applied.
-- `ledger_actor_redactions` is inert today (its own header says so); should it
-- ever be armed, a redacted actor would make this guard let a repeat grant
-- through, which is the safe direction to be wrong in and is noted here so the
-- day it is armed this line gets read.
--
-- ── WHAT DOES NOT CHANGE ─────────────────────────────────────────────────────
-- The key stays `grant:signup:<workspace_id>`: `apps/web/src/lib/wallet/
-- grant-origin.ts` classifies a signup grant by exactly that shape and
-- `signupGrantKey()` in @sahoda/shared builds it. Changing the key would make
-- every existing signup grant read as "manual" in the wallet. The guard is the
-- actor, the key is the workspace, and they answer different questions.
--
-- The whole function is restated (`create or replace`) rather than the applied
-- 20260718141426 file being edited: applied migrations are immutable.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bootstrap_workspace(
  p_name text,
  p_slug text,
  p_email text default null,
  p_display_name text default null,
  p_avatar_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    text;
  v_name    text;
  v_ws      workspaces%rowtype;
  v_credits int;
begin
  -- 1) identity from the JWT, never from arguments
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;

  -- 2) boundary validation (trim the full whitespace set incl. NBSP)
  v_name := nullif(regexp_replace(p_name, '^[\s\u00a0]+|[\s\u00a0]+$', '', 'g'), '');
  if v_name is null or length(v_name) > 120 then
    raise exception 'INVALID_NAME' using errcode = 'raise_exception';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'INVALID_SLUG' using errcode = 'raise_exception';
  end if;

  -- 3) serialize per user so a double-submit cannot create two workspaces
  perform pg_advisory_xact_lock(hashtextextended('bootstrap_workspace:' || v_user, 0));

  -- 4) replay guard: already an owner ⇒ return the existing workspace
  select w.* into v_ws
  from workspaces w
  join workspace_members m on m.workspace_id = w.id
  where m.user_id = v_user and m.role = 'owner'
  order by w.created_at, w.id
  limit 1;
  if found then
    return jsonb_build_object('workspace', to_jsonb(v_ws), 'replayed', true);
  end if;

  -- 5) workspace + owner membership + profile (profile upsert never nulls
  --    out fields a previous call already filled)
  begin
    insert into workspaces (name, slug, created_by)
    values (v_name, p_slug, v_user)
    returning * into v_ws;
  exception when unique_violation then
    raise exception 'SLUG_TAKEN' using errcode = 'raise_exception';
  end;

  insert into workspace_members (workspace_id, user_id, role)
  values (v_ws.id, v_user, 'owner');

  insert into users_profile (user_id, email, display_name, avatar_url)
  values (v_user, p_email, p_display_name, p_avatar_url)
  on conflict (user_id) do update set
    email        = coalesce(excluded.email, users_profile.email),
    display_name = coalesce(excluded.display_name, users_profile.display_name),
    avatar_url   = coalesce(excluded.avatar_url, users_profile.avatar_url);

  -- 6) signup grant = the free plan's credits, ONCE PER PERSON.
  --    The key mirrors signupGrantKey() in @sahoda/shared (per workspace, so
  --    the wallet can classify the row). The guard is the actor: a person whose
  --    earlier workspace was erased keeps the ledger row that says they were
  --    already granted, and gets a workspace with no credits rather than a
  --    second hundred.
  select monthly_credits into v_credits from plans where id = 'free';
  if v_credits is null or v_credits <= 0 then
    raise exception 'FREE_PLAN_MISSING' using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from credit_ledger l
     where l.entry_type = 'GRANT'
       and l.action_type = 'signup_grant'
       and l.actor = v_user
  ) then
    perform app.apply_ledger_entry(
      p_workspace_id    => v_ws.id,
      p_entry_type      => 'GRANT',
      p_amount          => v_credits,
      p_idempotency_key => 'grant:signup:' || v_ws.id,
      p_action_type     => 'signup_grant',
      p_actor           => v_user
    );
  end if;

  return jsonb_build_object('workspace', to_jsonb(v_ws), 'replayed', false);
end;
$$;

-- The guard's read: one actor, one action type, answered from an index rather
-- than a scan of the whole ledger on every signup.
create index if not exists credit_ledger_signup_grant_actor_idx
  on credit_ledger (actor)
  where entry_type = 'GRANT' and action_type = 'signup_grant';

-- `create or replace` keeps the existing grants; restated so the boundary is
-- visible in the file that now defines the function.
revoke all on function public.bootstrap_workspace(text, text, text, text, text)
  from public, anon;
grant execute on function public.bootstrap_workspace(text, text, text, text, text)
  to authenticated, service_role;
