-- ─────────────────────────────────────────────────────────────────────────────
-- DPDP · erasure — the right to have your data deleted, done in one transaction
-- ─────────────────────────────────────────────────────────────────────────────
--
-- India's DPDP Act gives a person the right to a copy of their data and the
-- right to have it erased. The copy has existed since 2026-08-19. Erasure has
-- not: `your-data-panel.tsx` renders it as a paragraph asking the customer to
-- send an email, and the paragraph is honest, because MEASURED from
-- `pg_policies` 26 of the 47 workspace-owned tables have no DELETE policy for a
-- member — including `brand_memory`, `inbox_threads`, `inbox_messages` and
-- `leads`, which hold the most personal data in the product.
--
-- This is the function that makes the button possible.
--
-- ── WHY THE `workspaces` ROW SURVIVES ───────────────────────────────────────
-- MEASURED from `pg_constraint`: all 47 foreign keys into `workspaces` are
-- `on delete cascade`. `credit_ledger`, `credit_balances` and `invoices` are
-- three of them. So deleting the workspace row erases the financial record —
-- the append-only account of what the customer paid and the statutory tax
-- documents Indian law requires be retained for years. The one thing erasure
-- must not do.
--
-- The row therefore stays, REDACTED, as the parent those retained rows need. It
-- carries `deleted_at`, which is what makes it a tombstone rather than a live
-- workspace: `app.member_workspace_ids()` stops returning it the moment its
-- memberships are gone, so nothing in the app can reach it again.
--
-- ── WHY THE TABLE LIST IS READ FROM THE CATALOG AND NOT TYPED OUT ───────────
-- A hand-written list cannot know about a table a later lane adds. That is not
-- speculation: the export manifest was hand-written, and on 2026-08-22 EIGHT
-- workspace-owned tables were found missing from it at once, each arriving from
-- a different lane, each branch's copy internally complete. An erasure that
-- misses a table is the same defect with worse consequences — the customer is
-- told their data is gone and it is not.
--
-- So the set is `information_schema`'s answer to "every base table carrying a
-- workspace_id", minus a RETAINED list that is short, legal, and asserted
-- against by a test. A table added next month is erased by default. A table
-- that should be kept has to be added to `v_retained` by a person, which is
-- where that decision belongs.
--
-- ── WHY IT LOOPS INSTEAD OF DELETING IN A FIXED ORDER ───────────────────────
-- Deletion order is constrained by things no single catalog query can see:
--
--   · `post_media → assets` and `post_media → asset_derivatives` are
--     ON DELETE RESTRICT, so the pictures cannot go before the attachments.
--   · `assets_refuse_delete_in_use` is a BEFORE DELETE TRIGGER that reads
--     `asset_usages join posts` and refuses a file a published post uses. That
--     is not a foreign key at all — no ordering derived from `pg_constraint`
--     would ever discover it, and an erasure ordered from the FK graph alone
--     would fail on the first workspace that had ever published a photo.
--
-- A hand-written order would encode both and then rot. Instead each delete runs
-- in its own savepoint and a table that refuses is retried on the next pass,
-- until a pass changes nothing. Whatever the constraint was — a foreign key, a
-- trigger, a rule written after this file — the table that has to go first goes
-- first, because the one that could not go simply waits.
--
-- If a pass makes no progress and tables remain, it RAISES, naming them and the
-- last refusal. Erasure is atomic: half of it is worse than none, because the
-- customer is told it is finished either way.
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
-- It does not remove objects from storage. Postgres cannot. The caller sweeps
-- the bucket BEFORE calling this, so a failure here leaves files already gone
-- and rows still present — a state the customer can retry into completeness.
-- The other order leaves personal FILES with nothing pointing at them, which is
-- the residue that cannot be cleaned up by retrying, and P2e of this lane's
-- brief is explicit that an orphaned image is still personal data.
--
-- It does not touch `credit_ledger`. Not one statement in this file writes to
-- it. The ledger never lies, and a deletion path that could edit financial
-- records would be a larger integrity problem than the one it solves.
--
-- IF THIS IS WRONG: the "Delete everything" button refuses and says so. Nothing
-- existing changes behaviour — every table, policy and trigger is untouched
-- except `app.block_mutations`, whose one widening is described where it is
-- made and is unreachable by any member (see the note there).
--
-- REVERSIBLE:
--   drop function public.erase_workspace(uuid, text);
--   drop function public.workspace_erasure_preview(uuid);
--   drop function app.redact_ledger_actor(uuid);
--   drop view public.credit_ledger_readable;
--   drop table public.ledger_actor_redactions;
--   alter table workspaces drop column deleted_at;
--   -- and restore app.block_mutations from 20260718000001_helpers.sql
--
-- APPLY ORDER: after every migration that creates a workspace-owned table.


-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · The tombstone
-- ═════════════════════════════════════════════════════════════════════════════

alter table workspaces add column if not exists deleted_at timestamptz;

comment on column workspaces.deleted_at is
  'Set by public.erase_workspace. The row survives its own erasure because every '
  'foreign key into it cascades, and three of those tables hold the financial '
  'record the law requires be kept. Name, slug and creator are redacted at the '
  'same moment; nothing else about the customer remains on the row.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · The append-only guard, and its one lawful exception
-- ═════════════════════════════════════════════════════════════════════════════
--
-- MEASURED from `pg_trigger`: twelve tables carry `app.block_mutations`. Nine of
-- them are workspace-owned — `ai_provider_logs`, `audience_snapshots`,
-- `audit_logs`, `credit_ledger`, `invoices`, `knowledge_chunks`,
-- `post_metric_snapshots`, `post_publish_logs`, `zernio_webhook_events`.
--
-- The guard already exempts `pg_trigger_depth() > 1`, so a CASCADE reaches them
-- freely: `knowledge_chunks` goes with its document, `post_metric_snapshots` and
-- `post_publish_logs` go with their post. FOUR have no parent inside the erased
-- set other than `workspaces` itself — `ai_provider_logs`, `audience_snapshots`,
-- `audit_logs`, `zernio_webhook_events` — so the only way to reach them is a
-- direct DELETE, at depth 1, which the guard refuses.
--
-- ── THE WIDENING, STATED PRECISELY ──────────────────────────────────────────
-- A DELETE is permitted at depth 1 while `app.erasing_workspace` is set, EXCEPT
-- on `credit_ledger` and `invoices`, which are refused by name and can never be
-- reached this way. An UPDATE is never permitted, at any depth, on any table:
-- the compensating-entry discipline is untouched.
--
-- ── WHY THIS DOES NOT HAND A MEMBER ANYTHING ────────────────────────────────
-- Any role can set a custom GUC, so the setting itself is not a privilege. What
-- stands between a member and these rows is RLS, which is unchanged — and
-- MEASURED from `pg_policies`, ALL NINE of those workspace-owned tables have no
-- DELETE policy for `authenticated`. A member who set this GUC by hand would
-- still be refused by the policy, one layer earlier. `erasure.pglite.test.ts`
-- asserts exactly that rather than leaving it as an argument.
--
-- ── WHY A GUC AND NOT `alter table … disable trigger` ───────────────────────
-- Both work. `disable trigger` inside the function takes an ACCESS EXCLUSIVE
-- lock on `ai_provider_logs` and `audit_logs` — tables every other workspace in
-- the product writes to — for the length of the erasure. Worse, it would leave
-- this trigger's source still saying "append-only" while a function elsewhere
-- quietly switched it off. The exception is written where somebody auditing
-- append-only-ness will actually look.

create or replace function app.block_mutations() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  -- The one lawful reason a row leaves an append-only table: a DPDP erasure.
  -- DELETE only, never UPDATE. Never the financial record, whatever is set.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.erasing_workspace', true), '') <> ''
     and tg_table_name not in ('credit_ledger', 'invoices')
  then
    return old;
  end if;

  raise exception 'append-only: % on % is not permitted', tg_op, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · The ledger's personal data — the MECHANISM, with the policy left open
-- ═════════════════════════════════════════════════════════════════════════════
--
-- MEASURED across all 152 `credit_ledger` rows on 2026-08-19: 21 carry a Clerk
-- user id in `actor` and ONE carries a plain email address. `meta` carries no
-- user identifiers at all (`... where meta::text like '%user_%'` returns 0), so
-- `actor` is the whole of the exposure and it is precisely bounded.
--
-- That is a genuine conflict, not an engineering problem: retention under a
-- legal obligation is a lawful ground for keeping the row, and the row still
-- names a person. Whether the name must be suppressed is a question for counsel,
-- and an implementation must not answer it quietly in either direction.
--
-- So the mechanism is built, tested and inert. `app.redact_ledger_actor` writes
-- a marker; `credit_ledger_readable` applies it. NOTHING CALLS IT — in
-- particular `public.erase_workspace` does not, and `erasure.pglite.test.ts`
-- asserts that it does not, so the decision cannot be taken by accident.
--
-- ── WHY A MARKER AND NOT AN UPDATE ──────────────────────────────────────────
-- `credit_ledger` is append-only and trigger-guarded. An UPDATE to blank
-- `actor` would either raise or require disarming that guard, and it would
-- rewrite a financial record to satisfy a deletion request — trading a stated
-- retention for a silent mutation. The bytes of the ledger are never touched.
-- What changes is what is DISCLOSED, which is what the question was actually
-- about.

create table if not exists ledger_actor_redactions (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  requested_at timestamptz not null default now(),
  -- Free text, for the decision that authorised it. Deliberately not a person's
  -- name: a redaction record that names somebody re-creates the exposure.
  authority text not null
);
alter table ledger_actor_redactions enable row level security;
-- No policies. This is a decision record, not customer content, and nothing in
-- apps/web reads or writes it.

comment on table ledger_actor_redactions is
  'One row per workspace whose ledger actor must not be disclosed. INERT until '
  'somebody decides it should not be: no code path writes here. See docs/38.';

create or replace function app.redact_ledger_actor(p_workspace_id uuid, p_authority text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows int;
begin
  if coalesce(btrim(p_authority), '') = '' then
    raise exception 'redact_ledger_actor needs the authority for the decision'
      using errcode = 'check_violation';
  end if;

  insert into ledger_actor_redactions (workspace_id, authority)
  values (p_workspace_id, p_authority)
  on conflict (workspace_id) do nothing;

  select count(*)::int into v_rows
    from credit_ledger
   where workspace_id = p_workspace_id
     and actor is not null;

  -- The COUNT of rows whose actor stops being disclosed. Not the actors.
  return v_rows;
end;
$$;

revoke all on function app.redact_ledger_actor(uuid, text) from public;

-- The ledger as it may be SHOWN. `security_invoker` so the reader's own RLS on
-- `credit_ledger` still decides which rows they see — a view that ran with its
-- owner's rights would hand every workspace's ledger to anyone who selected it,
-- which is the quietest way this product could lose tenant isolation.
create or replace view credit_ledger_readable
with (security_invoker = true) as
  select l.*,
         case when r.workspace_id is null then l.actor else null end as actor_disclosed,
         (r.workspace_id is not null) as actor_redacted
    from credit_ledger l
    left join ledger_actor_redactions r on r.workspace_id = l.workspace_id;


-- ═════════════════════════════════════════════════════════════════════════════
-- 3a · WHAT THE LAW SAYS TO KEEP — in ONE place
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Two functions need this list: the erasure, and the preview the confirmation
-- screen is built from. Written twice it can drift, and a preview promising to
-- remove a table the erasure keeps is a lie told by a screen — which is the
-- exact defect this lane was opened to fix, one layer up (the export manifest
-- said 30 tables when there were 39, and the deletion note said 15 of 30 when it
-- was 20 of 39). So it is written once and both read it.
--
--   credit_ledger           the append-only account of what was paid and charged
--   credit_balances         its reconciled total; ledger entries with no balance
--                           row is an invariant violation, so it cannot go alone
--   invoices                statutory GST documents, retained for years by law
--   ledger_actor_redactions the marker saying this workspace's ledger actor must
--                           not be disclosed — erasing it would RE-DISCLOSE the
--                           identity in the record that had to be kept

create or replace function app.erasure_retained_tables() returns text[]
language sql immutable as $$
  select array['credit_ledger', 'credit_balances', 'invoices', 'ledger_actor_redactions']
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · What erasure would remove — asked before it is done
-- ═════════════════════════════════════════════════════════════════════════════
--
-- The confirmation screen states what goes and what stays. It states it from
-- THESE NUMBERS rather than from a sentence somebody wrote once: a count read
-- out of the catalog cannot drift from the table list the erasure actually uses,
-- because both come from the same query.

create or replace function public.workspace_erasure_preview(p_workspace_id uuid)
returns table (table_name text, describes text, rows_held bigint, disposition text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user text;
  v_table text;
  v_count bigint;
  v_retained constant text[] := app.erasure_retained_tables();
begin
  -- Empty, not merely absent — see the note in erase_workspace.
  v_user := nullif(btrim(coalesce(auth.jwt() ->> 'sub', '')), '');
  if v_user is null then
    raise exception 'ERASURE_NOT_SIGNED_IN' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'ERASURE_NOT_OWNER' using errcode = 'insufficient_privilege';
  end if;

  for v_table in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
       and c.column_name = 'workspace_id'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where workspace_id = $1', v_table)
      into v_count using p_workspace_id;
    table_name := v_table;
    describes := null;
    rows_held := v_count;
    disposition := case when v_table = any (v_retained) then 'kept' else 'removed' end;
    return next;
  end loop;
end;
$$;

revoke all on function public.workspace_erasure_preview(uuid) from public;
grant execute on function public.workspace_erasure_preview(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5 · The erasure
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.erase_workspace(p_workspace_id uuid, p_typed_name text)
returns jsonb
language plpgsql
-- DEFINER on purpose, and it is the whole point: 26 of the 47 workspace-owned
-- tables have no member DELETE policy, so an invoker-rights function could do
-- exactly what a client can do today, which is about half the job. The identity
-- that authorises this is checked below, from the JWT, before anything is read.
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       text;
  v_name       text;
  v_deleted    jsonb := '{}'::jsonb;
  v_table      text;
  v_pending    text[];
  v_next       text[];
  v_removed    bigint;
  v_progress   boolean;
  v_last_error text := '';
  v_total      bigint := 0;
  v_orphans    int := 0;
  v_members    text[];
  -- One list, read from app.erasure_retained_tables(). See the note there.
  v_retained constant text[] := app.erasure_retained_tables();
begin
  -- 1) Identity from the JWT, never from an argument.
  -- `is null` is NOT enough. An anonymous PostgREST request carries a claims
  -- object with an EMPTY `sub`, not a missing one — MEASURED, by asking for this
  -- with no session: the owner check then ran and answered ERASURE_NOT_OWNER,
  -- which sends somebody looking for a permissions problem when the real answer
  -- is "you are not signed in".
  v_user := nullif(btrim(coalesce(auth.jwt() ->> 'sub', '')), '');
  if v_user is null then
    raise exception 'ERASURE_NOT_SIGNED_IN' using errcode = 'insufficient_privilege';
  end if;

  -- 2) OWNER, not merely a member. An editor cannot erase the business.
  if not exists (
    select 1 from workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'ERASURE_NOT_OWNER' using errcode = 'insufficient_privilege';
  end if;

  select name into v_name from workspaces where id = p_workspace_id for update;
  if v_name is null then
    raise exception 'ERASURE_UNKNOWN_WORKSPACE' using errcode = 'no_data_found';
  end if;

  -- 3) The typed confirmation is re-checked HERE as well as in the browser. A
  --    disabled button is a courtesy to somebody paying attention; it is not a
  --    control, because this function is a callable endpoint whatever the screen
  --    does. Whitespace-insensitive and case-insensitive, because the customer
  --    is copying a name back, not entering a password.
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(v_name)) then
    raise exception 'ERASURE_NAME_MISMATCH' using errcode = 'check_violation';
  end if;

  -- 3b) Who is in this workspace, captured BEFORE the deletes remove them.
  --     `users_profile` is keyed by `user_id`, so the only way to know whose
  --     profile this erasure might orphan is to look while the memberships are
  --     still there.
  select coalesce(array_agg(user_id), '{}')
    into v_members
    from workspace_members
   where workspace_id = p_workspace_id;

  -- 4) Announce the erasure to `app.block_mutations`, transaction-locally. The
  --    `true` is what makes it local: a session-level set would be handed to the
  --    next client through the connection pooler, which this repo has already
  --    been bitten by once.
  perform set_config('app.erasing_workspace', p_workspace_id::text, true);

  -- 5) Everything the workspace owns, from the catalog, minus what the law says
  --    to keep.
  select coalesce(array_agg(c.table_name order by c.table_name), '{}')
    into v_pending
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public'
     and c.column_name = 'workspace_id'
     and not (c.table_name = any (v_retained));

  -- 6) Pass after pass until nothing moves. See the header for why the order is
  --    discovered rather than declared.
  loop
    v_progress := false;
    v_next := '{}';

    foreach v_table in array v_pending loop
      begin
        execute format('delete from public.%I where workspace_id = $1', v_table)
          using p_workspace_id;
        get diagnostics v_removed = row_count;
        v_deleted := v_deleted || jsonb_build_object(v_table, v_removed);
        v_total := v_total + v_removed;
        v_progress := true;
      exception
        when others then
          -- DATA, not the end of the transaction. The implicit savepoint this
          -- block opens is rolled back to, and the table is tried again next
          -- pass — by which time whatever was holding it may itself be gone.
          v_last_error := v_table || ': ' || sqlerrm;
          v_next := v_next || v_table;
      end;
    end loop;

    v_pending := v_next;
    exit when array_length(v_pending, 1) is null;

    if not v_progress then
      -- Named, not counted. "3 tables could not be erased" sends somebody
      -- hunting; the names send them to the cause.
      raise exception
        'ERASURE_INCOMPLETE: could not erase % — last refusal was %',
        array_to_string(v_pending, ', '), v_last_error
        using errcode = 'restrict_violation';
    end if;
  end loop;

  -- 7) The sign-in profiles. `users_profile` carries an email, a display name
  --    and an avatar, and it is keyed by `user_id` rather than `workspace_id` —
  --    so NO sweep over workspace-owned tables can ever see it. It is removed
  --    for anybody who, now that this workspace is gone, belongs to no other.
  --
  --    ── EVERY MEMBER, NOT JUST THE CALLER ─────────────────────────────────
  --    The first version deleted only `v_user`. An EDITOR whose only workspace
  --    was this one kept their email address in this database for ever, reachable
  --    by nothing — which is exactly the class of gap this whole lane exists to
  --    close, reintroduced by the code that closes it. It survived a test suite
  --    because the only two profiles in the fixture belonged to the caller and to
  --    a member of the OTHER workspace, so the narrow and the broad version were
  --    indistinguishable. `erasure.pglite.test.ts` now seeds a second member of
  --    this workspace precisely to tell them apart.
  --
  --    ── AND ONLY THIS WORKSPACE'S MEMBERS ─────────────────────────────────
  --    Scoped by `v_members` rather than sweeping every orphaned profile in the
  --    database. An unrelated abandoned account is somebody else's row, and one
  --    person's deletion request is not a licence to tidy it up.
  --
  --    This is also why docs/31's line "your name, email and sign-in belong to
  --    Clerk" needed correcting. A copy lives here.
  delete from users_profile p
   where p.user_id = any (v_members)
     and not exists (select 1 from workspace_members m where m.user_id = p.user_id);
  get diagnostics v_orphans = row_count;

  -- 8) Redact the row that has to survive. `slug` is UNIQUE and NOT NULL, so it
  --    is replaced rather than blanked — and replaced with the id, which is not
  --    personal data and cannot collide.
  update workspaces
     set name       = 'Deleted workspace',
         slug       = 'deleted-' || p_workspace_id::text,
         created_by = 'erased',
         settings   = '{}'::jsonb,
         deleted_at = now()
   where id = p_workspace_id;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'rowsRemoved', v_total,
    'perTable', v_deleted,
    'profileRemoved', v_orphans,
    -- Stated in the RESULT and not only in a document, so the caller can show
    -- the customer what was kept without re-deriving it and getting it wrong.
    'retained', to_jsonb(v_retained),
    'erasedAt', now()
  );
end;
$$;

revoke all on function public.erase_workspace(uuid, text) from public;
grant execute on function public.erase_workspace(uuid, text) to authenticated;

comment on function public.erase_workspace(uuid, text) is
  'DPDP erasure. Removes every row this workspace owns except the financial '
  'record (credit_ledger, credit_balances, invoices), tombstones the workspace '
  'row, and removes the sign-in profile of anybody left with no workspace. One '
  'transaction. Does not touch storage — the caller sweeps the bucket first.';
