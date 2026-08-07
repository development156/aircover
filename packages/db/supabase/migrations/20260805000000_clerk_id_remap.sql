-- ─────────────────────────────────────────────────────────────────────────────
-- Clerk dev → production: the remap machinery, and its rehearsal
--
-- Design: docs/audit/2026-08-05-clerk-production-migration.md
--
-- Clerk cannot import a user with a chosen id — `POST /v1/users` accepts
-- `external_id` but never `id`. So a production instance mints new subjects, and
-- every row we hold keyed on the OLD subject has to move with them. 14 columns
-- across 14 tables, 128 rows on production at time of writing.
--
-- If they do not move, nothing errors. `app.member_workspace_ids()` simply returns
-- empty, every workspace-scoped policy denies, and all 17 users sign in
-- successfully to an app with no workspaces, no posts and no connections —
-- indistinguishable from having been wiped. `ops_admins` fails identically, so
-- /admin locks out at the same moment and the tool you would reach for to
-- investigate is gone too.
--
-- ── THIS MIGRATION PROVES ITSELF ─────────────────────────────────────────────
-- The bottom of this file is a rehearsal that runs INSIDE the migration's own
-- transaction: it seeds a synthetic user, remaps it, asserts the verification
-- function returns clean, then deliberately performs an INCOMPLETE remap and
-- asserts the verification CATCHES it. Every synthetic row is removed before
-- commit.
--
-- If any assertion fails the migration fails and nothing is applied. So a
-- successful apply is the rehearsal passing, not a claim that it would.
--
-- Applying this to production is harmless and does nothing on its own: an empty
-- map means `remap_clerk_user_ids()` changes zero rows.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists clerk_id_map (
  -- The dev-instance subject, exactly as it appears in our rows today.
  old_user_id text primary key,
  -- The production-instance subject Clerk minted. UNIQUE in its own right: two
  -- old ids collapsing onto one new id would silently merge two people's data,
  -- and that must be unstorable rather than merely unlikely.
  new_user_id text not null unique,
  -- Cheap insurance against pointing the map at itself.
  constraint clerk_id_map_distinct check (old_user_id <> new_user_id),
  created_at timestamptz not null default now()
);

comment on table clerk_id_map is
  'old Clerk subject → new Clerk subject, for the dev→production instance move. '
  'Populated from the import step, where each new user carries external_id = the '
  'old id, so this map is reconstructible from Clerk alone if the local copy is '
  'lost. Empty on production until cutover; an empty map makes the remap a no-op.';

alter table clerk_id_map enable row level security;
-- No policies at all. This is operator machinery: service_role bypasses RLS, and
-- there is no reason for a signed-in member to read the identity map of everyone
-- else in the product.

-- ─────────────────────────────────────────────────────────────────────────────
-- public.remap_clerk_user_ids — move every Clerk subject we store.
--
-- Returns the number of rows changed, so the cutover can be checked against the
-- expected total rather than trusting that it ran.
--
-- Every column that stores a Clerk subject is listed explicitly. A loop over
-- information_schema would be shorter and would also silently pick up any future
-- column merely NAMED like a user id — including one holding something else
-- entirely. The list is the point: adding a column here is a decision.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.remap_clerk_user_ids()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_n     int;
begin
  -- users_profile first: its user_id is the PRIMARY KEY, so a collision would
  -- abort the whole transaction, and it is better to learn that before 100 other
  -- rows have been rewritten.
  update users_profile p set user_id = m.new_user_id
    from clerk_id_map m where p.user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update workspace_members t set user_id = m.new_user_id
    from clerk_id_map m where t.user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update workspaces t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update posts t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update connections t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update brand_memory t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update sites t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update workspace_themes t set created_by = m.new_user_id
    from clerk_id_map m where t.created_by = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update tour_progress t set user_id = m.new_user_id
    from clerk_id_map m where t.user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update ops_admins t set user_id = m.new_user_id
    from clerk_id_map m where t.user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update ops_beta_applications t set clerk_user_id = m.new_user_id
    from clerk_id_map m where t.clerk_user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update ops_copy_watermarks t set user_id = m.new_user_id
    from clerk_id_map m where t.user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update inbox_threads t set assigned_to = m.new_user_id
    from clerk_id_map m where t.assigned_to = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  update inbox_messages t set author_user_id = m.new_user_id
    from clerk_id_map m where t.author_user_id = m.old_user_id;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;

revoke all on function public.remap_clerk_user_ids() from public, anon, authenticated;
grant execute on function public.remap_clerk_user_ids() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.verify_clerk_remap — how many rows STILL carry a dev-era subject.
--
-- Zero means complete. Anything else means the remap ran partially, and the
-- cutover must roll back rather than swap the keys: a half-remapped database
-- locks out exactly the users whose rows were missed, silently.
--
-- Deliberately counts rather than returning a boolean. "47 rows left" tells you
-- which stage failed; `false` tells you only that something did.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.verify_clerk_remap()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select
      (select count(*) from users_profile          t join clerk_id_map m on t.user_id       = m.old_user_id)
    + (select count(*) from workspace_members      t join clerk_id_map m on t.user_id       = m.old_user_id)
    + (select count(*) from workspaces             t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from posts                  t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from connections            t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from brand_memory           t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from sites                  t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from workspace_themes       t join clerk_id_map m on t.created_by    = m.old_user_id)
    + (select count(*) from tour_progress          t join clerk_id_map m on t.user_id       = m.old_user_id)
    + (select count(*) from ops_admins             t join clerk_id_map m on t.user_id       = m.old_user_id)
    + (select count(*) from ops_beta_applications  t join clerk_id_map m on t.clerk_user_id = m.old_user_id)
    + (select count(*) from ops_copy_watermarks    t join clerk_id_map m on t.user_id       = m.old_user_id)
    + (select count(*) from inbox_threads          t join clerk_id_map m on t.assigned_to   = m.old_user_id)
    + (select count(*) from inbox_messages         t join clerk_id_map m on t.author_user_id= m.old_user_id)
$$;

revoke all on function public.verify_clerk_remap() from public, anon, authenticated;
grant execute on function public.verify_clerk_remap() to service_role;

comment on function public.verify_clerk_remap() is
  'Rows still carrying a dev-era Clerk subject. The cutover commits only on 0. A '
  'half-remapped database locks out exactly the users whose rows were missed, and '
  'does it silently — no error, just an empty app.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE REHEARSAL. Runs inside this migration's transaction; every synthetic row
-- is removed before commit. A failed assertion fails the migration.
-- ─────────────────────────────────────────────────────────────────────────────

do $rehearsal$
declare
  v_ws       uuid;
  v_post     uuid;
  v_old      text := 'user_REHEARSAL_old_000000000';
  v_new      text := 'user_REHEARSAL_new_000000000';
  v_changed  int;
  v_left     int;
begin
  -- ── seed: one workspace, one member, one post, one profile ────────────────
  insert into workspaces (name, slug, created_by)
    values ('clerk-remap rehearsal', 'clerk-remap-rehearsal-' || substr(md5(random()::text),1,8), v_old)
    returning id into v_ws;
  insert into workspace_members (workspace_id, user_id, role) values (v_ws, v_old, 'owner');
  insert into users_profile (user_id, email) values (v_old, 'rehearsal@example.invalid');
  insert into posts (workspace_id, title, status, created_by)
    values (v_ws, 'rehearsal', 'draft', v_old) returning id into v_post;

  insert into clerk_id_map (old_user_id, new_user_id) values (v_old, v_new);

  -- ── ASSERTION 1: before the remap, verification must SEE the work ─────────
  v_left := public.verify_clerk_remap();
  if v_left <> 4 then
    raise exception 'rehearsal: expected 4 rows awaiting remap, found %', v_left;
  end if;

  -- ── ASSERTION 2: an INCOMPLETE remap must be caught ───────────────────────
  -- Move only ONE table by hand, exactly as a cutover that died partway would.
  update workspace_members set user_id = v_new where user_id = v_old;
  v_left := public.verify_clerk_remap();
  if v_left = 0 then
    raise exception
      'rehearsal: verification reported CLEAN after a partial remap — it cannot '
      'detect an incomplete run, which is the one thing it exists to do';
  end if;
  if v_left <> 3 then
    raise exception 'rehearsal: expected 3 rows still stale after a partial remap, found %', v_left;
  end if;

  -- ── ASSERTION 3: the full remap finishes the job ──────────────────────────
  v_changed := public.remap_clerk_user_ids();
  if v_changed <> 3 then
    raise exception 'rehearsal: expected the remap to move the remaining 3 rows, moved %', v_changed;
  end if;
  v_left := public.verify_clerk_remap();
  if v_left <> 0 then
    raise exception 'rehearsal: % rows still carry the old subject after a full remap', v_left;
  end if;

  -- ── ASSERTION 4: identity actually followed the user ──────────────────────
  -- The whole point. The membership must now answer to the NEW subject, which is
  -- what `app.member_workspace_ids()` will ask about after the key swap.
  if not exists (
    select 1 from workspace_members where workspace_id = v_ws and user_id = v_new
  ) then
    raise exception 'rehearsal: the membership did not follow the user to the new subject';
  end if;
  if exists (select 1 from workspace_members where workspace_id = v_ws and user_id = v_old) then
    raise exception 'rehearsal: a membership still answers to the old subject';
  end if;

  -- ── ASSERTION 5: re-running is a no-op, not a second rewrite ──────────────
  v_changed := public.remap_clerk_user_ids();
  if v_changed <> 0 then
    raise exception 'rehearsal: a second remap moved % rows; it must be idempotent', v_changed;
  end if;

  -- ── cleanup: leave nothing behind ─────────────────────────────────────────
  delete from posts where id = v_post;
  delete from workspace_members where workspace_id = v_ws;
  delete from workspaces where id = v_ws;
  delete from users_profile where user_id in (v_old, v_new);
  delete from clerk_id_map where old_user_id = v_old;

  raise notice 'clerk remap rehearsal: 5 assertions passed, synthetic rows removed';
end
$rehearsal$;
