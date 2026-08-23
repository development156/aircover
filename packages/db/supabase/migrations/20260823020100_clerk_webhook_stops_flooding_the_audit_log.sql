-- ─────────────────────────────────────────────────────────────────────────────
-- 95% OF THE AUDIT LOG IS ONE ROW SHAPE THAT NAMES NOTHING.
--
-- MEASURED IN PRODUCTION, 2026-08-23:
--
--     ops_audit_log                                          12,839 rows
--     action='user.created', actor='clerk:webhook'           12,196 rows  (95%)
--     distinct target_id among them                          1  — the empty string
--     newest meta   {"linked_application": false, "linked_admin_seat": false}
--     first 2026-07-28, still arriving
--
-- `ops_application_link_user` runs on every Clerk `user.created`. It tries to
-- mark a beta application joined, tries to link a seeded admin seat, and then
-- writes an audit row UNCONDITIONALLY — including when neither update matched
-- anything. `coalesce(app_id::text, '')` is the tell: the row is recording that
-- it has nothing to record.
--
-- Almost every sign-up matches neither, because almost every sign-up is an
-- ordinary customer rather than a seeded admin or an invited beta applicant. And
-- the E2E suite mints Clerk users against this production instance on every gate
-- run, so the rate is thousands per hour on a busy day.
--
-- ── WHY THIS IS A SECURITY DEFECT AND NOT HOUSEKEEPING ──────────────────────
-- An audit trail that is 95% content-free is an audit trail nobody reads, and
-- the eleven kinds of row that DO matter — `admin.role`, `admin.revoke`,
-- `admin.upsert`, `credit.*` — are the ones being buried. That is the ordinary
-- shape of anti-forensics: you do not delete the entry, you make the log
-- unusable. Nobody needs to be attacking for the outcome to be the same, and
-- anyone who could trigger sign-ups could bury their own `admin.role` row on
-- purpose.
--
-- ── WHAT IS RECORDED NOW ────────────────────────────────────────────────────
-- The row when something was LINKED, which is the actual ops event and is what
-- `target_id` was always for. A `user.created` that links nothing is a customer
-- signing up, and `users_profile` already records that.
--
-- NOT DELETED: the 12,196 rows already in the table stay. `ops_audit_log` is
-- append-only by design, deleting audit rows is exactly the thing an audit log
-- exists to prevent, and this migration is not the place to decide it. The
-- predicate an owner would need is
--     delete from ops_audit_log
--      where action = 'user.created' and actor = 'clerk:webhook' and target_id = '';
-- and it is written here so the decision is one command rather than an
-- investigation.
--
-- ROLLBACK is the previous body: the same function with the INSERT unguarded,
-- as it stands in 20260727072107_ops_admin_half.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ops_application_link_user(
  p_email text,
  p_clerk_user_id text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  app_id uuid;
  seat_id uuid;
begin
  update ops_beta_applications
    set status = 'joined', clerk_user_id = p_clerk_user_id, updated_at = now()
    where lower(email) = lower(p_email)
      and status in ('new', 'contacted', 'invited')
    returning id into app_id;

  -- The same webhook activates a seeded admin seat. An owner added by email
  -- before they ever signed in has user_id NULL; this is where it gets linked,
  -- and it is the only place, because Clerk is the only party that can prove
  -- the address belongs to the account.
  update ops_admins
    set user_id = p_clerk_user_id, updated_at = now()
    where lower(email) = lower(p_email)
      and user_id is null
      and status = 'active'
    returning id into seat_id;

  -- THE WHOLE CHANGE. A row only when there is something to name.
  if app_id is not null or seat_id is not null then
    insert into ops_audit_log (actor, action, target_table, target_id, meta)
    values ('clerk:webhook', 'user.created', 'ops_beta_applications',
            coalesce(app_id::text, seat_id::text),
            jsonb_build_object('linked_application', app_id is not null,
                               'linked_admin_seat', seat_id is not null));
  end if;

  return jsonb_build_object('application', app_id, 'admin_seat', seat_id);
end;
$$;
