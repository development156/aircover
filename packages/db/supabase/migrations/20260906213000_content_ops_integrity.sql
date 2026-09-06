-- ─────────────────────────────────────────────────────────────────────────────
-- content · approval is a recorded gate, comments, and the integrity the
-- publisher's evidence was missing
--
-- ── WHAT THIS CLOSES ─────────────────────────────────────────────────────────
-- 20260906190000 made approval a fact on the row (approved_by / approved_at)
-- and role-gated every lifecycle write. It left four things open, and
-- apps/web/src/app/actions/posts-review.ts already calls two of them:
--
--   1. The HISTORY of the gate. A row says who approved it last; nothing says
--      who sent it for review, who sent it back, or why. `post_approvals` is
--      that record, written only by the three RPCs below, never directly.
--   2. A place to leave a NOTE on a post while it is being written.
--      `post_comments`: any member reads, a member writes as themselves, and
--      may only hide their own note (deleted_at), never edit or remove another's.
--   3. The two RPCs the app contract names: `send_post_for_review` and
--      `return_post_to_draft`. Same identity, same no-existence-oracle rule and
--      the same role allowlist as approve_posts.
--   4. The publisher's evidence. `post_publish_logs` cascaded from `posts`, so
--      deleting a published post silently destroyed the only record that it
--      went out. The foreign key is now RESTRICT and a BEFORE DELETE trigger
--      refuses to delete a post that has evidence, unless the DPDP erasure is
--      running (the one lawful reason a record leaves).
--
-- Plus the small integrity facts that were only ever true by convention: a
-- scheduled post has a time (CHECK), `posts.channels` is a set drawn from the
-- channel allowlist (CHECK, after an idempotent repair), the dispatcher's due
-- scan and the reconciler's per-variant scan have indexes, `reschedule_post`
-- carries its in-flight predicate INSIDE the UPDATE, three definer functions
-- are not executable by anon, the media bucket has a size and type limit, and
-- trashing a logo clears the workspace's pointer to it.
--
-- ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
-- It does not remove the wt-web compatibility path in the lifecycle guard; that
-- is still gated on wt-core's promotion (20260906190000 header). It does not
-- give `post_approvals` an `app.block_mutations` trigger: the table has no
-- write policy and its GRANTs are revoked, so a PostgREST role cannot reach it,
-- and the erasure loop deletes it like any other tenant table.
--
-- ── THE PROOF ────────────────────────────────────────────────────────────────
-- packages/db/tests/content_ops_integrity.pglite.test.ts, one section per
-- part below, each with the mutation that makes it go red. Also re-run:
--   posts_lifecycle_role_guard.pglite.test.ts (approve_posts stays 44/44)
--   schedule_guard_parity.test.ts             (reschedule_post's status list)
--   erasure.pglite.test.ts                    (logs go before posts, under the GUC)
--   rls_tenant_isolation.pglite.test.ts       (both tables seeded and isolated)
--   export_manifest.pglite.test.ts            (both tables in the DPDP export)
--   data_handling_doc.pglite.test.ts          (docs/38 names both, count 61)
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · post_approvals — the record of the gate
-- ═════════════════════════════════════════════════════════════════════════════
-- One row per decision: `submitted` (sent for review), `approved` (cleared by
-- approve_posts, with a hash of the body that was cleared so a later edit can
-- be seen), `returned` (sent back, with the reason). Members READ it; every
-- write goes through a SECURITY DEFINER RPC, so there is no insert/update/
-- delete policy AND the table privileges are revoked from the PostgREST roles.
--
-- THE PROOF · content_ops_integrity §1: an approver's direct insert is refused;
-- approve / send / return each leave exactly one row. Mutation: add
-- `select app.apply_tenant_policies('post_approvals')` in place of the read
-- policy and the direct insert is accepted.

create table if not exists public.post_approvals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  post_id      uuid not null,
  actor        text not null,
  decision     text not null check (decision in ('submitted', 'approved', 'returned')),
  reason       text check (reason is null or char_length(reason) between 1 and 500),
  body_hash    text,
  created_at   timestamptz not null default now(),
  foreign key (post_id, workspace_id) references public.posts (id, workspace_id) on delete cascade
);

create index if not exists post_approvals_workspace_idx
  on public.post_approvals (workspace_id);
create index if not exists post_approvals_post_created_idx
  on public.post_approvals (post_id, created_at desc);

comment on table public.post_approvals is
  'Every decision at the approval gate: submitted (sent for review), approved '
  '(cleared; body_hash = md5 of the body that was cleared), returned (sent back, '
  'with the reason). Written only by send_post_for_review, approve_posts and '
  'return_post_to_draft. Members read their workspace''s rows and cannot write.';

select app.apply_tenant_read_policy('post_approvals');
revoke insert, update, delete on public.post_approvals from anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · post_comments — notes on a post, written as yourself
-- ═════════════════════════════════════════════════════════════════════════════
-- Members of the workspace read every comment. A member inserts only as
-- themselves (`author = auth.jwt() ->> 'sub'`), and may update or delete only
-- their own rows. An update may set `deleted_at` and nothing else: the trigger
-- refuses any other column changing, for every role, because a note whose
-- words can be rewritten after somebody read them is not a record of anything.
--
-- THE PROOF · content_ops_integrity §2: own author accepted, another author
-- refused, workspace B reads none of A's, delete of another's row matches
-- nothing, editing the body is refused. Mutation: drop the `author =` term
-- from `t_insert` and the forged author is accepted.

create table if not exists public.post_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  post_id      uuid not null,
  author       text not null,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (post_id, workspace_id) references public.posts (id, workspace_id) on delete cascade
);

create index if not exists post_comments_workspace_idx
  on public.post_comments (workspace_id);
create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

comment on table public.post_comments is
  'Notes members leave on a post while it is being written. Read by every '
  'member of the workspace; written as yourself only; hidden (deleted_at) or '
  'removed only by the author. The body never changes after it is written.';

alter table public.post_comments enable row level security;

create policy t_select on public.post_comments for select to authenticated
  using (workspace_id in (select app.member_workspace_ids()));

create policy t_insert on public.post_comments for insert to authenticated
  with check (
    workspace_id in (select app.member_workspace_ids())
    and author = (auth.jwt() ->> 'sub')
  );

create policy t_update on public.post_comments for update to authenticated
  using (
    workspace_id in (select app.member_workspace_ids())
    and author = (auth.jwt() ->> 'sub')
  )
  with check (
    workspace_id in (select app.member_workspace_ids())
    and author = (auth.jwt() ->> 'sub')
  );

create policy t_delete on public.post_comments for delete to authenticated
  using (
    workspace_id in (select app.member_workspace_ids())
    and author = (auth.jwt() ->> 'sub')
  );

-- Only `deleted_at` may change. Every other column is compared, so a new
-- column added later without a decision here is immutable by default.
create or replace function app.post_comments_only_deleted_at() returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.post_id is distinct from old.post_id
     or new.author is distinct from old.author
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at
  then
    raise exception 'COMMENT_IMMUTABLE' using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

comment on function app.post_comments_only_deleted_at() is
  'BEFORE UPDATE on post_comments: deleted_at is the only column an UPDATE may '
  'change. Applies to every role; the erasure deletes rows, it never edits them.';

drop trigger if exists post_comments_only_deleted_at on public.post_comments;
create trigger post_comments_only_deleted_at
  before update on public.post_comments
  for each row execute function app.post_comments_only_deleted_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · send_post_for_review — idea / draft → review, recorded
-- ═════════════════════════════════════════════════════════════════════════════
-- Identity from the JWT. The role allowlist is approve_posts's (owner, editor,
-- approver). NO EXISTENCE ORACLE: a missing post, a post in a workspace the
-- caller does not belong to, and a post already past draft all read
-- POST_NOT_SUBMITTABLE, so a stranger cannot tell a real id from a missing one.
-- Only a MEMBER outside the allowlist (viewer) is told FORBIDDEN_ROLE.
--
-- The status test is INSIDE the UPDATE's WHERE, so a post that moved between
-- the read and the write is refused rather than moved twice.
--
-- Errors (SQLSTATE P0001): NOT_SIGNED_IN · FORBIDDEN_ROLE · POST_NOT_SUBMITTABLE
--
-- THE PROOF · content_ops_integrity §3: editor on a draft → review + a
-- `submitted` row; on a scheduled post → POST_NOT_SUBMITTABLE; viewer →
-- FORBIDDEN_ROLE; non-member → POST_NOT_SUBMITTABLE (same as a missing id);
-- anon → permission denied. Mutation: widen the WHERE to
-- `status in ('idea','draft','scheduled')` and the scheduled refusal goes red.

create or replace function public.send_post_for_review(p_post_id uuid)
returns public.posts
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_user   text;
  v_ws     uuid;
  v_status text;
  v_role   text;
  v_row    public.posts;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'NOT_SIGNED_IN' using errcode = 'raise_exception';
  end if;
  if p_post_id is null then
    raise exception 'POST_NOT_SUBMITTABLE' using errcode = 'raise_exception';
  end if;

  select p.workspace_id, p.status into v_ws, v_status
    from posts p where p.id = p_post_id;
  if not found then
    raise exception 'POST_NOT_SUBMITTABLE' using errcode = 'raise_exception';
  end if;

  select m.role into v_role
    from workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_user;
  if v_role is null then
    -- Non-member: the same sentence as a missing id. See the header.
    raise exception 'POST_NOT_SUBMITTABLE' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  update posts
     set status = 'review'
   where id = p_post_id
     and workspace_id = v_ws
     and status in ('idea', 'draft')
  returning * into v_row;
  if not found then
    raise exception 'POST_NOT_SUBMITTABLE' using errcode = 'raise_exception';
  end if;

  insert into post_approvals (workspace_id, post_id, actor, decision)
  values (v_ws, p_post_id, v_user, 'submitted');

  return v_row;
end;
$$;

comment on function public.send_post_for_review(uuid) is
  'Move an idea or draft into review as owner, editor or approver, and record a '
  'submitted row in post_approvals. A missing post, a post outside the caller''s '
  'workspaces and a post already past draft all read POST_NOT_SUBMITTABLE (no '
  'existence oracle); a member outside the allowlist reads FORBIDDEN_ROLE.';

revoke all on function public.send_post_for_review(uuid) from public, anon;
grant execute on function public.send_post_for_review(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · return_post_to_draft — review / approved / scheduled → draft, with a reason
-- ═════════════════════════════════════════════════════════════════════════════
-- The time is KEPT (the plan survives the round trip); the record of approval
-- is cleared (the post is no longer cleared, so the row must not say it is).
-- Variants sitting `scheduled` walk back to `pending`, as cancel_scheduled_post
-- does, so no variant claims a schedule its post no longer has.
--
-- A post with any variant publishing or published is refused, and the
-- predicate is IN THE UPDATE as a NOT EXISTS (the 20260804000001 rule): the
-- publisher can claim a variant between a read and a write, and a check that
-- ran before the UPDATE would have said "safe" about a row that no longer is.
--
-- Errors (SQLSTATE P0001): REASON_REQUIRED · NOT_SIGNED_IN · FORBIDDEN_ROLE ·
--   POST_NOT_RETURNABLE · POST_ALREADY_GOING_OUT
--
-- THE PROOF · content_ops_integrity §4: from review, approved and scheduled →
-- draft with scheduled_at kept and approved_by/approved_at null, plus a
-- `returned` row carrying the reason; blank reason → REASON_REQUIRED; a
-- publishing variant → POST_ALREADY_GOING_OUT and the row untouched; from
-- draft → POST_NOT_RETURNABLE. Mutation: delete the `and not exists (…)` from
-- the UPDATE and the publishing refusal goes red.

create or replace function public.return_post_to_draft(p_post_id uuid, p_reason text)
returns public.posts
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_user   text;
  v_reason text;
  v_ws     uuid;
  v_status text;
  v_role   text;
  v_row    public.posts;
begin
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 1 or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode = 'raise_exception';
  end if;

  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'NOT_SIGNED_IN' using errcode = 'raise_exception';
  end if;
  if p_post_id is null then
    raise exception 'POST_NOT_RETURNABLE' using errcode = 'raise_exception';
  end if;

  select p.workspace_id, p.status into v_ws, v_status
    from posts p where p.id = p_post_id;
  if not found then
    raise exception 'POST_NOT_RETURNABLE' using errcode = 'raise_exception';
  end if;

  select m.role into v_role
    from workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_user;
  if v_role is null then
    raise exception 'POST_NOT_RETURNABLE' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  if v_status not in ('review', 'approved', 'scheduled') then
    raise exception 'POST_NOT_RETURNABLE' using errcode = 'raise_exception';
  end if;

  update posts p
     set status      = 'draft',
         approved_by = null,
         approved_at = null
   where p.id = p_post_id
     and p.workspace_id = v_ws
     and p.status in ('review', 'approved', 'scheduled')
     and not exists (
       select 1 from post_variants v
        where v.post_id = p.id
          and v.workspace_id = p.workspace_id
          and v.publish_status in ('publishing', 'published')
     )
  returning p.* into v_row;
  if not found then
    -- The status was checked above, so zero rows means a variant is going out.
    raise exception 'POST_ALREADY_GOING_OUT' using errcode = 'raise_exception';
  end if;

  update post_variants
     set publish_status = 'pending', publish_claimed_at = null
   where post_id = p_post_id
     and workspace_id = v_ws
     and publish_status = 'scheduled';

  insert into post_approvals (workspace_id, post_id, actor, decision, reason)
  values (v_ws, p_post_id, v_user, 'returned', v_reason);

  return v_row;
end;
$$;

comment on function public.return_post_to_draft(uuid, text) is
  'Send a post in review, approved or scheduled back to draft as owner, editor or '
  'approver, keeping scheduled_at, clearing approved_by/approved_at, walking '
  'scheduled variants back to pending, and recording a returned row with the '
  'reason (1..500 chars after trimming). Refuses POST_ALREADY_GOING_OUT once any '
  'variant is publishing or published; the predicate sits inside the UPDATE.';

revoke all on function public.return_post_to_draft(uuid, text) from public, anon;
grant execute on function public.return_post_to_draft(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5 · approve_posts — REPLACED to record each approval
-- ═════════════════════════════════════════════════════════════════════════════
-- Every line except the final statement is byte-identical to 20260906190000 §4.
-- The UPDATE now runs in a data-modifying CTE whose rows feed one INSERT into
-- post_approvals per moved post (`approved`, actor, md5 of the body that was
-- cleared), and the function still returns exactly the moved rows. A CTE that
-- modifies data runs exactly once whether or not the outer query reads it.
--
-- THE PROOF · posts_lifecycle_role_guard.pglite.test.ts stays 44/44, and
-- content_ops_integrity §5 reads the `approved` row with its body_hash.

create or replace function public.approve_posts(p_post_ids uuid[])
returns setof public.posts
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_user text;
  v_ws   uuid;
  v_n    integer;
  v_role text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'NOT_SIGNED_IN' using errcode = 'raise_exception';
  end if;

  if p_post_ids is null or cardinality(p_post_ids) = 0 then
    return;
  end if;

  -- One workspace per call. A batch that straddles two would need two role
  -- checks and could half-succeed; refusing is the only honest answer.
  -- (array_agg(distinct …))[1] because Postgres has no min() over uuid.
  select count(distinct p.workspace_id), (array_agg(distinct p.workspace_id))[1]
    into v_n, v_ws
    from posts p
   where p.id = any(p_post_ids);
  if v_n > 1 then
    raise exception 'POSTS_SPAN_WORKSPACES' using errcode = 'raise_exception';
  end if;
  if v_n = 0 then
    -- Nothing by those ids at all: every one of them has moved on (or never was).
    return;
  end if;

  select m.role into v_role
    from workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_user;
  if v_role is null then
    -- No existence oracle, the same reasoning as release_post_for_publish's
    -- INVALID_POST: a non-member gets exactly what a nonexistent id gets (an
    -- empty set), so a stranger cannot tell a real post from a missing one by
    -- reading which sentence comes back.
    return;
  end if;
  if v_role not in ('owner', 'editor', 'approver') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  return query
    with moved as (
      update posts
         set status      = case when scheduled_at is not null then 'scheduled' else 'approved' end,
             approved_by = v_user,
             approved_at = now()
       where id = any(p_post_ids)
         and workspace_id = v_ws
         and status in ('idea', 'draft', 'review')
      returning *
    ),
    recorded as (
      insert into post_approvals (workspace_id, post_id, actor, decision, body_hash)
      select m.workspace_id, m.id, v_user, 'approved', md5(coalesce(m.body, ''))
        from moved m
    )
    select * from moved;
end;
$$;

comment on function public.approve_posts(uuid[]) is
  'Clear one or more posts of ONE workspace as owner, editor or approver. A dated '
  'post becomes scheduled, an undated one approved, approved_by/approved_at record '
  'who and when, and one approved row per moved post lands in post_approvals with '
  'the md5 of the body that was cleared. Rows already past the draft set are not '
  'returned and not an error. A non-member gets the same empty set as a missing '
  'id (no existence oracle); a member outside the allowlist gets FORBIDDEN_ROLE.';

revoke all on function public.approve_posts(uuid[]) from public, anon;
grant execute on function public.approve_posts(uuid[]) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6 · post_publish_logs — evidence outlives the row it is about
-- ═════════════════════════════════════════════════════════════════════════════
-- 6a · The foreign key was ON DELETE CASCADE, so deleting a post took every
--      record that it had gone out. RESTRICT: a post with logs cannot be
--      deleted at all, by anyone, until its logs are gone; and the only writer
--      allowed to remove logs is the DPDP erasure (app.block_mutations' one
--      exception). The constraint is found by its columns rather than by the
--      name Postgres minted, so this cannot silently drop nothing.
--
-- 6b · A BEFORE DELETE trigger on posts refuses POST_HAS_PUBLISH_EVIDENCE when
--      the post's status is published, partial or publishing, unless the
--      erasure announced itself: `erase_workspace` sets
--      `app.erasing_workspace` to the workspace id, transaction-locally, and
--      that exact value is what this trigger accepts. `<> ''` is what
--      block_mutations checks; equality to the row's own workspace is stricter
--      and passes the same erasure. The FK above would refuse most such posts
--      first; the trigger covers a published post whose logs were never
--      written (a fixture, or a publisher that died before its log row).
--
-- 6c · `idempotency_key`: the `${postId}:${channel}:${scheduledAt}` term the
--      publisher already mints (docs in apps/jobs) gets a column, and a partial
--      unique index says two SUCCEEDED rows cannot carry the same key. Failed
--      attempts may repeat a key freely; that is what a retry is.
--
-- The erasure loop needs no change: `delete from posts` fails its first pass
-- on the RESTRICT, `post_publish_logs` is deleted at depth 1 under the GUC in
-- the same pass, and posts go on the next. erasure.pglite.test.ts proves it.
--
-- THE PROOF · content_ops_integrity §6: delete of a published post →
-- POST_HAS_PUBLISH_EVIDENCE; the same delete under the GUC succeeds; delete of
-- a draft with a log row → the FK refuses; two succeeded rows with one key →
-- unique violation. Mutation: change `old.status in (…)` to `in ('nothing')`
-- and the trigger refusal goes red.

do $$
declare
  v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.post_publish_logs'::regclass
     and c.contype = 'f'
     and c.confrelid = 'public.posts'::regclass;
  if v_name is not null then
    execute format('alter table public.post_publish_logs drop constraint %I', v_name);
  end if;
end;
$$;

alter table public.post_publish_logs
  add constraint post_publish_logs_post_id_workspace_id_fkey
  foreign key (post_id, workspace_id) references public.posts (id, workspace_id)
  on delete restrict;

create or replace function app.posts_publish_evidence_guard() returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if old.status in ('published', 'partial', 'publishing')
     and coalesce(current_setting('app.erasing_workspace', true), '') <> old.workspace_id::text
  then
    raise exception 'POST_HAS_PUBLISH_EVIDENCE' using errcode = 'raise_exception';
  end if;
  return old;
end;
$$;

comment on function app.posts_publish_evidence_guard() is
  'BEFORE DELETE on posts: a post that is published, partial or publishing is '
  'not deleted, by any role, unless app.erasing_workspace names its workspace '
  '(set transaction-locally by erase_workspace and nothing else).';

drop trigger if exists posts_publish_evidence_guard on public.posts;
create trigger posts_publish_evidence_guard
  before delete on public.posts
  for each row execute function app.posts_publish_evidence_guard();

alter table public.post_publish_logs
  add column if not exists idempotency_key text;

comment on column public.post_publish_logs.idempotency_key is
  'The publish idempotency key this attempt carried (post:channel:scheduled_at). '
  'Null on rows written before the column existed. Two SUCCEEDED rows never '
  'share one: post_publish_logs_idempotency_succeeded_idx.';

create unique index if not exists post_publish_logs_idempotency_succeeded_idx
  on public.post_publish_logs (idempotency_key)
  where status = 'succeeded' and idempotency_key is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7 · the two scans that had no index
-- ═════════════════════════════════════════════════════════════════════════════
-- The dispatcher asks "what is due": approved or scheduled, with a time. The
-- reconciler and classify.ts ask "this variant's most recent log row". Both
-- were sequential scans.
--
-- THE PROOF · content_ops_integrity §7 reads both names out of pg_indexes.

create index if not exists posts_due_idx
  on public.posts (scheduled_at)
  where status in ('approved', 'scheduled') and scheduled_at is not null;

create index if not exists post_publish_logs_variant_created_idx
  on public.post_publish_logs (variant_id, created_at desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- 8 · a scheduled post has a time
-- ═════════════════════════════════════════════════════════════════════════════
-- Every writer of `scheduled` already sets a time (release, reschedule,
-- approve_posts on a dated post). The CHECK makes that a fact the database
-- holds rather than a convention four functions share. The repair first: a
-- scheduled row with no time is a draft that nothing can dispatch, and it is
-- named so rather than left to fail the constraint. Idempotent: a second run
-- matches nothing. Runs as the owner, so the lifecycle guard does not see it.
--
-- THE PROOF · content_ops_integrity §8: a seeded bad row is converted by the
-- exact repair statement, and the CHECK refuses a new one.

update public.posts
   set status = 'draft'
 where status = 'scheduled'
   and scheduled_at is null;

alter table public.posts drop constraint if exists posts_scheduled_needs_time;
alter table public.posts
  add constraint posts_scheduled_needs_time
  check (status <> 'scheduled' or scheduled_at is not null);

-- ═════════════════════════════════════════════════════════════════════════════
-- 9 · posts.channels is a SET from the channel allowlist
-- ═════════════════════════════════════════════════════════════════════════════
-- `channels` is a bare text[] that every consumer reads as a set, and three
-- shipped duplicate-channel defects (2026-08-09/10) came from that gap.
-- `@sahoda/shared`'s ChannelSetSchema dedupes on parse; this is the same rule
-- held by the database. `app.is_channel_set` (20260826120001) is exactly that
-- predicate: not null, every element passes app.is_channel, no duplicates. An
-- empty array is a set. The repair first, only where a duplicate exists, so
-- updated_at moves on repaired rows and no others. Then a named refusal if any
-- row still fails, so a migration that cannot apply says which value stopped
-- it instead of "check constraint violated".
--
-- THE PROOF · content_ops_integrity §9: a seeded duplicate is collapsed by the
-- exact repair statement, and the CHECK refuses `{instagram,instagram}` and
-- `{tiktok}` afterwards.

update public.posts
   set channels = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(channels) as c)
 where cardinality(channels) <> (select count(distinct c) from unnest(channels) as c);

do $$
declare
  v_bad text[];
begin
  select array_agg(distinct c order by c) into v_bad
    from public.posts p, unnest(p.channels) as c
   where not app.is_channel(c);
  if v_bad is not null then
    raise exception 'posts.channels holds values outside app.is_channel: %', v_bad;
  end if;
end;
$$;

alter table public.posts drop constraint if exists posts_channels_is_set;
alter table public.posts
  add constraint posts_channels_is_set
  check (app.is_channel_set(channels));

-- ═════════════════════════════════════════════════════════════════════════════
-- 10 · reschedule_post — the in-flight predicate moves INTO the UPDATE
-- ═════════════════════════════════════════════════════════════════════════════
-- Every refusal before the UPDATE (AUTH_REQUIRED, INVALID_POST, FORBIDDEN_ROLE,
-- the `v_status in (…)` list and POST_NOT_RESCHEDULABLE) is byte-identical to
-- 20260906190000 §5b; schedule_guard_parity.test.ts reads that list out of
-- this file. The `if exists (…)` that used to precede the UPDATE is gone and
-- its predicate is the UPDATE's own NOT EXISTS, so a variant the publisher
-- claims between the read and the write is refused rather than re-keyed.
-- Zero rows after the status checks can only mean that, so it raises
-- POST_ALREADY_GOING_OUT. The approved_by / approved_at coalesce stays.
--
-- THE PROOF · content_ops_integrity §10 reads the last definition's body the
-- way schedule_guard_parity does and asserts the NOT EXISTS sits between
-- `update posts` and `returning`, with no `if exists` before it; and calls it
-- against a post whose variant is publishing.

create or replace function public.reschedule_post(
  p_post_id uuid,
  p_when    timestamptz
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user   text;
  v_ws_id  uuid;
  v_role   text;
  v_status text;
  v_moved  integer;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_post_id is null or p_when is null then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select p.workspace_id, p.status into v_ws_id, v_status
  from posts p where p.id = p_post_id;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;

  select m.role into v_role
  from workspace_members m
  where m.workspace_id = v_ws_id and m.user_id = v_user;
  if not found then
    raise exception 'INVALID_POST' using errcode = 'raise_exception';
  end if;
  if v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  if v_status in ('published', 'failed', 'expired', 'publishing') then
    raise exception 'POST_NOT_RESCHEDULABLE' using errcode = 'raise_exception';
  end if;

  -- A variant mid-publish holds a claim and has already sent a request carrying
  -- the old key. Moving the time under it would mint a second key for work that
  -- is still in flight. The predicate is IN the statement: the publisher can
  -- claim between a read and a write.
  update posts p
     set status = 'scheduled', scheduled_at = p_when,
         approved_by = coalesce(p.approved_by, v_user),
         approved_at = coalesce(p.approved_at, now())
   where p.id = p_post_id
     and not exists (
       select 1 from post_variants v
        where v.post_id = p.id
          and v.publish_status in ('publishing', 'published')
     );
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'POST_ALREADY_GOING_OUT' using errcode = 'raise_exception';
  end if;

  return jsonb_build_object('post_id', p_post_id, 'scheduled_at', p_when);
end;
$$;

comment on function public.reschedule_post(uuid, timestamptz) is
  'Move a scheduled post to a new time. Refuses once any variant is publishing or '
  'published, with the predicate inside the UPDATE so a claim taken between the '
  'read and the write is refused too: the publish idempotency key is derived '
  'from scheduled_at, and moving it under an in-flight request would mint a '
  'second key for the same work. Records the caller as approver unless somebody '
  'already was.';

revoke all on function public.reschedule_post(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_post(uuid, timestamptz) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11 · three definer functions anon must not be able to call
-- ═════════════════════════════════════════════════════════════════════════════
-- Each was `revoke all … from public; grant … to authenticated`. On Supabase
-- `anon` holds no direct grant either, so this is belt and braces stated where
-- an auditor reads grants: named, explicit, and asserted by §11 of the proof
-- through has_function_privilege.

revoke execute on function public.delete_asset(uuid, boolean) from anon;
revoke execute on function public.erase_workspace(uuid, text) from anon;
revoke execute on function public.workspace_erasure_preview(uuid) from anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- 12 · the media bucket has a ceiling and a type list
-- ═════════════════════════════════════════════════════════════════════════════
-- 4 000 000 bytes and the four raster types the crop pipeline (sharp) and the
-- adapters accept. `brand-assets` is left alone: logos are also SVG and the
-- Brand Skin extractor reads them. INFERRED, not measured: the test harness
-- stubs `storage.buckets` (tests/helpers/supabase-prelude.sql says so), so
-- this statement applies there without any storage service reading it. The
-- proof of the limit itself is the bucket row on production after `db push`.

update storage.buckets
   set file_size_limit    = 4000000,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'media';

-- ═════════════════════════════════════════════════════════════════════════════
-- 13 · trashing a logo clears the workspace's pointer to it
-- ═════════════════════════════════════════════════════════════════════════════
-- `workspaces.logo_asset_id` / `logo_asset_id_dark` are ON DELETE SET NULL, so
-- a HARD delete never dangles. The trash (assets.deleted_at, 20260827090000)
-- is not a delete, and a workspace whose logo sits in the trash rendered a
-- picture the library said was gone. AFTER UPDATE OF deleted_at, on the move
-- INTO the trash only: restoring does not restore the choice.
--
-- SECURITY DEFINER because the trigger runs as the member who trashed the
-- file, and `ws_update` would let it through anyway (any member may update
-- their workspace); definer makes that not depend on the policy. It nulls only
-- pointers equal to the row the caller just updated under their own RLS.
--
-- THE PROOF · content_ops_integrity §13: set a workspace's logo, trash it as a
-- member, read null. Mutation: change `new.deleted_at is not null` to `is null`
-- and the pointer survives.

create or replace function app.assets_trashed_clears_logo() returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update workspaces
       set logo_asset_id = null
     where id = new.workspace_id
       and logo_asset_id = new.id;
    update workspaces
       set logo_asset_id_dark = null
     where id = new.workspace_id
       and logo_asset_id_dark = new.id;
  end if;
  return null;
end;
$$;

comment on function app.assets_trashed_clears_logo() is
  'AFTER UPDATE OF deleted_at on assets: when a file moves INTO the trash, the '
  'workspace''s logo_asset_id / logo_asset_id_dark stop pointing at it. Restore '
  'does not re-point; the person chooses again.';

drop trigger if exists assets_trashed_clears_logo on public.assets;
create trigger assets_trashed_clears_logo
  after update of deleted_at on public.assets
  for each row execute function app.assets_trashed_clears_logo();

-- ─────────────────────────────────────────────────────────────────────────────
-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- drop trigger if exists assets_trashed_clears_logo on public.assets;
-- drop function if exists app.assets_trashed_clears_logo();
-- update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'media';
-- -- §11: the three functions had no anon grant before either; nothing to restore.
-- -- §10: re-run the 20260906190000 §5b body of reschedule_post.
-- alter table public.posts drop constraint if exists posts_channels_is_set;
-- alter table public.posts drop constraint if exists posts_scheduled_needs_time;
-- -- The two repairs (§8 draft, §9 dedupe) are NOT reversed: a scheduled row with
-- -- no time and a duplicated channel were defects, not data.
-- drop index if exists public.post_publish_logs_variant_created_idx;
-- drop index if exists public.posts_due_idx;
-- drop index if exists public.post_publish_logs_idempotency_succeeded_idx;
-- alter table public.post_publish_logs drop column if exists idempotency_key;
-- drop trigger if exists posts_publish_evidence_guard on public.posts;
-- drop function if exists app.posts_publish_evidence_guard();
-- alter table public.post_publish_logs drop constraint if exists post_publish_logs_post_id_workspace_id_fkey;
-- alter table public.post_publish_logs add foreign key (post_id, workspace_id)
--   references public.posts (id, workspace_id) on delete cascade;
-- -- §5: re-run the 20260906190000 §4 body of approve_posts.
-- drop function if exists public.return_post_to_draft(uuid, text);
-- drop function if exists public.send_post_for_review(uuid);
-- drop trigger if exists post_comments_only_deleted_at on public.post_comments;
-- drop function if exists app.post_comments_only_deleted_at();
-- drop table if exists public.post_comments;
-- drop table if exists public.post_approvals;
-- ─────────────────────────────────────────────────────────────────────────────
