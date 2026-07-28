-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 14 · the HUMAN write path (doc 13 §10, §15)
--
-- Until now every ops_* mutation came from one agent function (public.ops_ingest,
-- token-authed, service_role only). This adds the other half: a person moving a
-- card, editing it, archiving it, and marking how far they have copied the
-- changelog. The tables still carry NO write policies — every mutation below is
-- a SECURITY DEFINER function that re-checks the caller.
--
-- ══ THE CREDITS BOUNDARY ══════════════════════════════════════════════════════
-- NOTHING IN THIS FILE READS OR WRITES ops_credit_requests, credit_ledger,
-- credit_balances, OR CALLS app.apply_ledger_entry.
--
-- That is not a promise in a comment — it is checked. Every function added here
-- is registered in app.ops_human_write_functions(), and the RLS suite reads
-- pg_get_functiondef() for each one and fails if any of those identifiers
-- appears. A future edit that reaches for the ledger from a board function
-- breaks the build rather than shipping. Credits stay where doc 13 §6 put them:
-- human-initiated, two-admin OTP, through app.apply_ledger_entry, and the
-- functions for that path are not in this migration.
--
-- ══ WHO MAY WRITE ═════════════════════════════════════════════════════════════
-- app.is_ops_admin() is the READ gate and admits `viewer`, which doc 13 §2
-- defines as read-only. Writes therefore go through app.ops_writer(), which
-- additionally requires role in ('owner','admin') and RAISES rather than
-- returning false — a write that silently no-ops is worse than one that fails,
-- because the UI would report success over an unchanged row.
--
-- ══ WHY THE STAMPS ARE CLEARED, NOT COALESCED ═════════════════════════════════
-- ops_ingest only ever coalesces started_at/review_at/done_at, so a card moved
-- BACKWARD kept a done_at it no longer deserved (SL-036, proven on 2026-07-26
-- when the commit hook wrongly closed two cards and the reverted rows still
-- read as done). The board now renders "age in column" from exactly those
-- columns, so the bug became visible rather than latent. Both the human path
-- below AND ops_ingest are fixed here: a stamp survives only if the column the
-- card is now in justifies it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Per-admin changelog copy watermark (doc 13 §8) ───────────────────────────
-- "Copy since last copy" needs to remember how far THIS admin has copied.
-- Keyed by the Clerk subject rather than by ops_admins.id so that revoking and
-- re-granting a seat does not silently rewind someone's watermark.
create table ops_copy_watermarks (
  user_id text primary key,
  last_copied_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ops_copy_watermarks enable row level security;

-- Read your OWN row only. A watermark is a private reading position, not shared
-- state, and the select policy says so rather than relying on the UI to filter.
create policy ops_select on ops_copy_watermarks
  for select to authenticated
  using (app.is_ops_admin() and user_id = (select auth.jwt() ->> 'sub'));

create trigger set_updated_at before update on ops_copy_watermarks
  for each row execute function app.set_updated_at();

-- ── The write gate ───────────────────────────────────────────────────────────
-- Returns the acting admin's email for the audit trail, or raises. In schema
-- `app`, which PostgREST does not expose, so it is not callable as an RPC.
create or replace function app.ops_writer() returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor text;
begin
  select email into actor
  from ops_admins
  where user_id = (select auth.jwt() ->> 'sub')
    and status = 'active'
    and role in ('owner', 'admin');

  if actor is null then
    -- Deliberately does not distinguish "not an admin" from "viewer" from
    -- "revoked". The caller learns only that it may not write.
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return actor;
end;
$$;
revoke all on function app.ops_writer() from public, anon;
grant execute on function app.ops_writer() to authenticated;

-- Which lifecycle stamps a column justifies. Anything the column does not
-- justify is NULLED, which is what makes a backward move honest.
create or replace function app.ops_stamp_for(
  p_column text,
  p_started timestamptz,
  p_review timestamptz,
  p_done timestamptz,
  p_now timestamptz
) returns timestamptz[]
language sql
immutable
as $$
  select case p_column
    when 'todo' then array[null, null, null]::timestamptz[]
    when 'in_progress' then array[coalesce(p_started, p_now), null, null]
    when 'review' then array[coalesce(p_started, p_now), coalesce(p_review, p_now), null]
    when 'done' then array[
      coalesce(p_started, p_now), coalesce(p_review, p_now), coalesce(p_done, p_now)
    ]
  end;
$$;

-- ── Move a card ──────────────────────────────────────────────────────────────
create or replace function public.ops_task_move(
  p_code text,
  p_column text,
  p_note text default null
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor text := app.ops_writer();
  before ops_tasks%rowtype;
  stamps timestamptz[];
begin
  if p_column not in ('todo', 'in_progress', 'review', 'done') then
    raise exception 'unknown column %', p_column using errcode = '22023';
  end if;

  select * into before from ops_tasks where code = p_code;
  if not found then
    raise exception 'no such card %', p_code using errcode = 'P0002';
  end if;

  stamps := app.ops_stamp_for(
    p_column, before.started_at, before.review_at, before.done_at, now()
  );

  update ops_tasks
  set board_column = p_column,
      moved_by = 'human',
      started_at = stamps[1],
      review_at = stamps[2],
      done_at = stamps[3]
  where code = p_code;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (
    actor, 'task.move', 'ops_tasks', p_code,
    jsonb_build_object('from', before.board_column, 'to', p_column, 'note', p_note)
  );
end;
$$;

-- ── Edit a card ──────────────────────────────────────────────────────────────
-- Every parameter defaults to null and null means "leave alone", so a caller
-- that wants to change one field cannot accidentally blank the other six.
-- Clearing a field explicitly is done with the empty string, which is
-- normalised back to null — an affordance the UI needs and a bare null cannot
-- express without a second flag per column.
create or replace function public.ops_task_edit(
  p_code text,
  p_title text default null,
  p_detail text default null,
  p_assignee text default null,
  p_roadmap_code text default null,
  p_blocked boolean default null,
  p_blocked_reason text default null,
  p_sort int default null
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor text := app.ops_writer();
  nullify constant text := '';
begin
  if p_assignee is not null and p_assignee not in ('claude', 'divas', 'girija', 'both') then
    raise exception 'unknown assignee %', p_assignee using errcode = '22023';
  end if;

  -- A card cannot be blocked without a reason. The board renders "Blocked, with
  -- no reason recorded" for rows the agent path already created that way; the
  -- human path is not allowed to add more of them.
  if p_blocked is true and coalesce(nullif(p_blocked_reason, nullify), '') = '' then
    raise exception 'a blocked card needs a reason' using errcode = '22023';
  end if;

  update ops_tasks
  set title = coalesce(nullif(p_title, nullify), title),
      detail = case when p_detail is null then detail
                    when p_detail = nullify then null else p_detail end,
      assignee = coalesce(p_assignee, assignee),
      roadmap_code = case when p_roadmap_code is null then roadmap_code
                          when p_roadmap_code = nullify then null else p_roadmap_code end,
      blocked = coalesce(p_blocked, blocked),
      blocked_reason = case
        when p_blocked is false then null
        when p_blocked_reason is null then blocked_reason
        when p_blocked_reason = nullify then null
        else p_blocked_reason end,
      sort = coalesce(p_sort, sort),
      moved_by = 'human'
  where code = p_code;

  if not found then
    raise exception 'no such card %', p_code using errcode = 'P0002';
  end if;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (actor, 'task.edit', 'ops_tasks', p_code, jsonb_build_object(
    'title', p_title, 'assignee', p_assignee, 'roadmap_code', p_roadmap_code,
    'blocked', p_blocked, 'sort', p_sort
  ));
end;
$$;

-- ── Create a card ────────────────────────────────────────────────────────────
-- The code is assigned HERE, not by the caller. Codes are positional in the
-- seed array and two sessions picking "the next one" concurrently would collide;
-- max()+1 inside the function is decided by the database under its own locks.
create or replace function public.ops_task_create(
  p_title text,
  p_detail text default null,
  p_roadmap_code text default null,
  p_assignee text default 'claude'
) returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor text := app.ops_writer();
  next_num int;
  new_code text;
begin
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'a card needs a title' using errcode = '22023';
  end if;
  if p_assignee not in ('claude', 'divas', 'girija', 'both') then
    raise exception 'unknown assignee %', p_assignee using errcode = '22023';
  end if;

  select coalesce(max((substring(code from 'SL-([0-9]+)$'))::int), 0) + 1
  into next_num
  from ops_tasks
  where code ~ '^SL-[0-9]+$';

  new_code := 'SL-' || lpad(next_num::text, 3, '0');

  insert into ops_tasks (code, title, detail, roadmap_code, assignee, moved_by, sort)
  values (
    new_code, btrim(p_title), nullif(btrim(coalesce(p_detail, '')), ''),
    nullif(btrim(coalesce(p_roadmap_code, '')), ''), p_assignee, 'human', next_num * 10
  );

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (actor, 'task.create', 'ops_tasks', new_code,
          jsonb_build_object('title', btrim(p_title), 'roadmap_code', p_roadmap_code));

  return new_code;
end;
$$;

-- ── Archive / restore a card ─────────────────────────────────────────────────
-- Archive, never delete (doc 13 §9.7). A deleted card takes its history with it,
-- including the QA runs and commits that referenced its code.
create or replace function public.ops_task_archive(
  p_code text,
  p_archived boolean default true
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor text := app.ops_writer();
begin
  update ops_tasks
  set archived = p_archived, moved_by = 'human'
  where code = p_code;

  if not found then
    raise exception 'no such card %', p_code using errcode = 'P0002';
  end if;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (actor, case when p_archived then 'task.archive' else 'task.restore' end,
          'ops_tasks', p_code, '{}'::jsonb);
end;
$$;

-- ── Changelog copy watermark (doc 13 §8) ─────────────────────────────────────
-- Monotonic: greatest() means an accidental re-copy of an older day cannot
-- rewind the mark and resurface entries the reader has already sent on.
create or replace function public.ops_changelog_mark_copied(p_seq bigint)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  actor text := app.ops_writer();
  subject text := (select auth.jwt() ->> 'sub');
  result bigint;
begin
  insert into ops_copy_watermarks (user_id, last_copied_seq)
  values (subject, greatest(p_seq, 0))
  on conflict (user_id) do update
    set last_copied_seq = greatest(ops_copy_watermarks.last_copied_seq, excluded.last_copied_seq)
  returning last_copied_seq into result;

  return result;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- anon is revoked explicitly on every one. These are `authenticated`-only, and
-- each re-checks app.ops_writer() regardless — the grant is the outer fence,
-- not the decision.
do $$
declare
  f text;
  fns text[] := array[
    'public.ops_task_move(text, text, text)',
    'public.ops_task_edit(text, text, text, text, text, boolean, text, int)',
    'public.ops_task_create(text, text, text, text)',
    'public.ops_task_archive(text, boolean)',
    'public.ops_changelog_mark_copied(bigint)'
  ];
begin
  foreach f in array fns loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ── The credits boundary, as a queryable fact ────────────────────────────────
-- The RLS suite calls this, reads pg_get_functiondef() for each name, and fails
-- if a forbidden identifier appears in any body. Listing the functions here
-- rather than in the test means a new write function added later is covered the
-- moment it is registered — and forgetting to register it is itself visible,
-- because the suite also asserts every public.ops_* function is on this list.
create or replace function app.ops_human_write_functions() returns text[]
language sql
immutable
as $$
  select array[
    'ops_task_move', 'ops_task_edit', 'ops_task_create',
    'ops_task_archive', 'ops_changelog_mark_copied'
  ];
$$;

-- ── SL-036 is NOT fixed here, and this says so rather than implying it ───────
-- public.ops_ingest still coalesces started_at/review_at/done_at, so the AGENT
-- path can still leave a done_at on a card that moved backward. The human path
-- above does not, because it uses app.ops_stamp_for().
--
-- Recreating ops_ingest is a 200-line rewrite of a function this migration does
-- not otherwise touch, and bundling it here would make one reviewable change
-- into two. SL-036 keeps its own card and reuses app.ops_stamp_for(), which is
-- why that helper is deliberately generic rather than inlined into ops_task_move
-- — so the two paths converge on one definition instead of drifting.
