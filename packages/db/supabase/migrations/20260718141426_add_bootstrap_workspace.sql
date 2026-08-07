-- ─────────────────────────────────────────────────────────────────────────────
-- public.bootstrap_workspace — the signup path (requested by wt-web).
--
-- The identity tables (workspaces / workspace_members / users_profile) have NO
-- INSERT policies by design: this SECURITY DEFINER function is the one
-- client-reachable write into them. It atomically creates the workspace, the
-- owner membership, the profile row, and applies the free-plan signup grant
-- through app.apply_ledger_entry — all in a single transaction, so a failure
-- at any step leaves nothing behind.
--
-- RLS notes (no new tables, no new policies):
--   · identity comes from auth.jwt()->>'sub' only — never from arguments;
--   · owned by the migration role, so it bypasses RLS exactly like the other
--     app.* definer helpers (the sanctioned server-side write path);
--   · lives in `public` so PostgREST exposes it, but EXECUTE is revoked from
--     public/anon and granted to authenticated only;
--   · inputs are validated here because every signed-in user can call it
--     directly with arbitrary arguments.
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

  -- 2) boundary validation (trim the full whitespace set incl. NBSP — a
  --    tab-only or NBSP-only name must not slip past as "blank but present")
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

  -- 6) signup grant = the free plan's credits (plans mirrors PLAN_CATALOG;
  --    100 today). Key mirrors signupGrantKey() in @sahoda/shared, so the
  --    grant is idempotent per workspace even beyond the replay guard above.
  select monthly_credits into v_credits from plans where id = 'free';
  if v_credits is null or v_credits <= 0 then
    raise exception 'FREE_PLAN_MISSING' using errcode = 'raise_exception';
  end if;

  perform app.apply_ledger_entry(
    p_workspace_id    => v_ws.id,
    p_entry_type      => 'GRANT',
    p_amount          => v_credits,
    p_idempotency_key => 'grant:signup:' || v_ws.id,
    p_action_type     => 'signup_grant',
    p_actor           => v_user
  );

  return jsonb_build_object('workspace', to_jsonb(v_ws), 'replayed', false);
end;
$$;

-- Client-reachable by design — but only for signed-in users.
revoke all on function public.bootstrap_workspace(text, text, text, text, text)
  from public, anon;
grant execute on function public.bootstrap_workspace(text, text, text, text, text)
  to authenticated, service_role;
