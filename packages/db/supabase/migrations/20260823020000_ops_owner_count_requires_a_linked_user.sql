-- ─────────────────────────────────────────────────────────────────────────────
-- THE LAST-OWNER GUARD COUNTED SEATS THAT GRANT NOBODY ANYTHING.
--
-- `app.ops_active_owner_count()` is the only thing standing between the team
-- screen and a console nobody can open. `ops_admin_revoke` and
-- `ops_admin_set_role` both refuse when it reports 1 or fewer, and the comment
-- above them says why: "A console with no owner has no way back in short of SQL."
--
-- It counted `status = 'active' and role = 'owner'` and nothing else. But
-- `user_id` is nullable BY DESIGN — a seat is seeded from ADMIN_BOOTSTRAP_EMAILS
-- before that person has ever signed in, and stays unlinked until Clerk's
-- `user.created` webhook binds it. And `app.is_ops_admin()` authorises on
-- `user_id = auth.jwt() ->> 'sub'`, where NULL equals nothing, ever. So an
-- unlinked seat is counted as an owner by the guard and is an owner to nobody.
--
-- MEASURED IN PRODUCTION, 2026-08-23:
--
--     app.ops_active_owner_count()                          → 5
--     active owners that can actually sign in (user_id set)  → 4
--
-- Two active seats carry `user_id is null`: one 'owner', one 'admin'. Today the
-- margin hides it. Drive it to the boundary and it is a lockout: with one real
-- owner and one unlinked owner the function reports 2, the guard permits
-- revoking the real one, and the console is unreachable by every human — the
-- exact outcome the guard exists to prevent, produced BY the guard.
--
-- ── WHY THIS AND NOT A DATA CHANGE ──────────────────────────────────────────
-- The obvious alternative is to revoke or delete the two unlinked rows. That is
-- the wrong move and it is worth writing down: those rows are how a colleague is
-- invited before their first sign-in. Deleting them de-provisions two real
-- people, and this repository has already shipped that mistake once, from the
-- other direction, by emptying a seed list. The rows are correct; the arithmetic
-- over them was not. NOT ONE ROW IS TOUCHED HERE.
--
-- ── DIRECTION OF FAILURE ────────────────────────────────────────────────────
-- Strictly narrowing. The new count is always <= the old one, so every refusal
-- the guard used to make it still makes, plus the ones it should have been
-- making. It cannot open anything.
--
-- ROLLBACK is the previous body, exactly:
--   create or replace function app.ops_active_owner_count() returns int
--   language sql stable security definer set search_path = public as $$
--     select count(*)::int from ops_admins where status = 'active' and role = 'owner';
--   $$;
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app.ops_active_owner_count() returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from ops_admins
   where status = 'active'
     and role = 'owner'
     -- The whole change. An unlinked seat cannot answer `is_ops_admin()`, so it
     -- cannot be the owner this count is protecting.
     and user_id is not null;
$$;

comment on function app.ops_active_owner_count() is
  'Active owners WHO CAN SIGN IN. user_id null means the seat was seeded before '
  'that person first signed in; app.is_ops_admin() matches on user_id, and NULL '
  'matches nothing, so an unlinked seat must not hold the last-owner guard open.';


-- ─────────────────────────────────────────────────────────────────────────────
-- AND THE SECOND HALF, WHICH THE FIRST HALF CREATED.
--
-- Narrowing the count changed what the two RPCs refuse, in one way that is right
-- and one that is not, and the test found the second within a minute:
--
--   `ops_admin_revoke(<the unlinked owner>)` now RAISES OPS_ADMIN_LAST_OWNER.
--
-- Walk it: the seat's role is 'owner' and its status is 'active', so the guard
-- engages; the count is 1 because the OTHER owner is the only linked one; and
-- the guard refuses. An unlinked seat therefore became impossible to tidy up
-- while exactly one real owner existed — a refusal, so nothing unsafe, but a
-- refusal with no reason behind it.
--
-- The guard's actual rule was never "an owner row may not be removed". It is
-- "the last owner WHO CAN SIGN IN may not be removed". A seat that does not
-- count toward that number cannot reduce it by leaving, so it must not be
-- measured against it. Both functions gain `seat.user_id is not null`.
--
-- This does not widen anything a caller could exploit: the only rows it newly
-- permits removing are rows that grant nobody access, and reaching either RPC
-- still requires `app.ops_owner()`, which is owner-only and unchanged.
--
-- ROLLBACK for both is the same body with the `seat.user_id is not null` clause
-- deleted, which is the form in 20260727072107_ops_admin_half.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ops_admin_set_role(p_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_owner();
  seat ops_admins%rowtype;
begin
  if p_role not in ('owner', 'admin', 'viewer') then
    raise exception 'OPS_ADMIN_BAD_ROLE' using errcode = 'raise_exception';
  end if;

  select * into seat from ops_admins where id = p_id for update;
  if not found then
    raise exception 'OPS_ADMIN_UNKNOWN' using errcode = 'raise_exception';
  end if;

  if seat.role = 'owner' and p_role <> 'owner' and seat.status = 'active'
     and seat.user_id is not null
     and app.ops_active_owner_count() <= 1 then
    raise exception 'OPS_ADMIN_LAST_OWNER' using errcode = 'raise_exception';
  end if;

  update ops_admins set role = p_role, updated_at = now() where id = p_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'admin.role', 'ops_admins', p_id::text,
          jsonb_build_object('from', seat.role, 'to', p_role));
end;
$$;

create or replace function public.ops_admin_revoke(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_owner();
  seat ops_admins%rowtype;
begin
  select * into seat from ops_admins where id = p_id for update;
  if not found then
    raise exception 'OPS_ADMIN_UNKNOWN' using errcode = 'raise_exception';
  end if;

  if seat.role = 'owner' and seat.status = 'active'
     and seat.user_id is not null
     and app.ops_active_owner_count() <= 1 then
    raise exception 'OPS_ADMIN_LAST_OWNER' using errcode = 'raise_exception';
  end if;

  update ops_admins set status = 'revoked', updated_at = now() where id = p_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'admin.revoke', 'ops_admins', p_id::text,
          jsonb_build_object('email', seat.email));
end;
$$;
