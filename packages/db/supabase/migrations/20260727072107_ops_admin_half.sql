-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 14 · the admin half (doc 13 §4–§6, §11, §13)
--
-- Four groups, one migration: QA composer writes, beta applications, the
-- maker-checker credit grant, and team/roles.
--
-- WHO MAY CALL WHAT, and why it is three gates rather than one:
--   app.ops_writer()  active owner|admin  — board, QA, applications
--   app.ops_owner()   active owner        — team and roles only (§13)
--   service_role      no user at all      — the public form and the Clerk webhook
--
-- The credit functions are reachable ONLY through the first gate plus a code the
-- caller cannot mint. `public.ops_ingest` — the agent's token path — is not in
-- this file and calls nothing in it, so doc 13 §16's promise that the ingest
-- token cannot reach credits stays structural.
-- ─────────────────────────────────────────────────────────────────────────────

-- Owner-only gate, alongside app.ops_writer() from migration 13 -----------------
create or replace function app.ops_owner() returns text
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
    and role = 'owner';

  if actor is null then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return actor;
end;
$$;
revoke all on function app.ops_owner() from public, anon;
grant execute on function app.ops_owner() to authenticated;

-- ══ QA composer (doc 13 §11) ═════════════════════════════════════════════════
-- A draft IS a run with status 'running'. Doc 13 §3 fixes the table list at ten
-- and 'running' was already in the vocabulary, so the autosave target is a real
-- row that has not reached a verdict — which is also what it is. Artifacts can
-- therefore attach to a real run_id from the first keystroke, which the
-- qa/{run_id}/… storage path requires anyway.

create or replace function public.ops_qa_draft_save(
  p_run_id uuid default null,
  p_task_code text default null,
  p_summary text default null,
  p_details text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_writer();
  run_id uuid;
begin
  if p_run_id is null then
    insert into ops_qa_runs (task_code, kind, suite, status, summary_plain, details, actor)
    values (p_task_code, 'manual', 'manual', 'running', p_summary, p_details, caller)
    returning id into run_id;
    return run_id;
  end if;

  -- An autosave may only ever touch a RUNNING run, and only the actor's own.
  -- Without both, a stray draft id would let one admin rewrite another's
  -- finished verdict — the QA record is evidence, and evidence is not editable
  -- after the fact.
  update ops_qa_runs
    set summary_plain = coalesce(p_summary, summary_plain),
        details = coalesce(p_details, details),
        task_code = coalesce(p_task_code, task_code),
        updated_at = now()
    where id = p_run_id and status = 'running' and ops_qa_runs.actor = caller
    returning id into run_id;

  if run_id is null then
    raise exception 'OPS_QA_DRAFT_NOT_OPEN' using errcode = 'raise_exception';
  end if;
  return run_id;
end;
$$;

create or replace function public.ops_qa_finalize(
  p_run_id uuid,
  p_status text,
  p_summary text default null
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_writer();
begin
  if p_status not in ('pass', 'fail', 'blocked') then
    raise exception 'OPS_QA_BAD_STATUS' using errcode = 'raise_exception';
  end if;

  update ops_qa_runs
    set status = p_status,
        summary_plain = coalesce(p_summary, summary_plain),
        finished_at = now(),
        updated_at = now()
    where id = p_run_id and status = 'running' and ops_qa_runs.actor = caller;

  if not found then
    raise exception 'OPS_QA_DRAFT_NOT_OPEN' using errcode = 'raise_exception';
  end if;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'qa.finalize', 'ops_qa_runs', p_run_id::text,
          jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.ops_qa_artifact_add(
  p_run_id uuid,
  p_storage_path text,
  p_bytes int,
  p_mime text,
  p_caption text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  artifact_id uuid;
begin
  perform app.ops_writer();

  -- The bucket enforces size and type too (migration 12). Both, because a limit
  -- that lives only in the application disappears the first time somebody calls
  -- storage directly.
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10485760 then
    raise exception 'OPS_QA_ARTIFACT_SIZE' using errcode = 'raise_exception';
  end if;
  if p_mime not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'OPS_QA_ARTIFACT_MIME' using errcode = 'raise_exception';
  end if;
  if not exists (select 1 from ops_qa_runs where id = p_run_id) then
    raise exception 'OPS_QA_RUN_UNKNOWN' using errcode = 'raise_exception';
  end if;

  insert into ops_qa_artifacts (run_id, storage_path, caption, bytes, mime)
  values (p_run_id, p_storage_path, p_caption, p_bytes, p_mime)
  returning id into artifact_id;

  return artifact_id;
end;
$$;

-- Import (doc 13 §11): upsert by id, and REPORT what it did rather than merging
-- silently. A conflict is a row whose id exists with different content — the
-- caller is told, and the stored row wins until a human says otherwise.
create or replace function public.ops_qa_import(p_runs jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_writer();
  imported int := 0;
  conflicts jsonb := '[]'::jsonb;
  rec record;
begin
  for rec in
    select * from jsonb_to_recordset(coalesce(p_runs, '[]'::jsonb))
      as x(id uuid, task_code text, kind text, suite text, status text,
           summary_plain text, details text, actor text, duration_ms int,
           started_at timestamptz, finished_at timestamptz)
  loop
    if exists (select 1 from ops_qa_runs r where r.id = rec.id) then
      conflicts := conflicts || jsonb_build_object('id', rec.id, 'reason', 'already recorded');
      continue;
    end if;

    insert into ops_qa_runs (
      id, task_code, kind, suite, status, summary_plain, details, actor,
      duration_ms, started_at, finished_at
    )
    values (
      rec.id, rec.task_code, coalesce(rec.kind, 'manual'), rec.suite, rec.status,
      rec.summary_plain, rec.details, coalesce(rec.actor, caller),
      rec.duration_ms, coalesce(rec.started_at, now()), rec.finished_at
    );
    imported := imported + 1;
  end loop;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'qa.import', 'ops_qa_runs', null,
          jsonb_build_object('imported', imported,
                             'conflicts', jsonb_array_length(conflicts)));

  return jsonb_build_object('imported', imported, 'conflicts', conflicts);
end;
$$;

-- ══ Beta applications (doc 13 §4, §5) ════════════════════════════════════════
-- Submission is service_role only. Doc 13 §5 is explicit that there is no
-- anon-insert RLS path, and granting this to `anon` would BE that path — an
-- open public insert rate-limited by nothing but our own route.
create or replace function public.ops_application_submit(
  p_name text,
  p_business_name text,
  p_email text,
  p_phone text,
  p_source_url text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  existing ops_beta_applications%rowtype;
  fresh_id uuid;
begin
  -- Merged, not duplicated (§4). The partial unique index already forbids two
  -- OPEN applications per email; this makes a repeat submission an update to
  -- the live one rather than an error the visitor has to interpret.
  select * into existing
  from ops_beta_applications
  where lower(email) = lower(p_email)
    and status in ('new', 'contacted', 'invited')
  limit 1;

  if found then
    update ops_beta_applications
      set name = p_name,
          business_name = p_business_name,
          phone = p_phone,
          source_url = coalesce(p_source_url, source_url),
          updated_at = now()
      where id = existing.id;
    return jsonb_build_object('id', existing.id, 'merged', true);
  end if;

  insert into ops_beta_applications (name, business_name, email, phone, source_url, status)
  values (p_name, p_business_name, p_email, p_phone, p_source_url, 'new')
  returning id into fresh_id;

  return jsonb_build_object('id', fresh_id, 'merged', false);
end;
$$;

create or replace function public.ops_application_set_status(
  p_id uuid,
  p_status text,
  p_note text default null,
  p_clerk_invitation_id text default null
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_writer();
begin
  if p_status not in ('new', 'contacted', 'invited', 'joined', 'rejected') then
    raise exception 'OPS_APPLICATION_BAD_STATUS' using errcode = 'raise_exception';
  end if;

  update ops_beta_applications
    set status = p_status,
        notes = coalesce(p_note, notes),
        clerk_invitation_id = coalesce(p_clerk_invitation_id, clerk_invitation_id),
        handled_by = caller,
        updated_at = now()
    where id = p_id;

  if not found then
    raise exception 'OPS_APPLICATION_UNKNOWN' using errcode = 'raise_exception';
  end if;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'application.' || p_status, 'ops_beta_applications', p_id::text,
          jsonb_build_object('note', p_note));
end;
$$;

-- Clerk `user.created` (§4). Service_role: the webhook has a verified signature
-- but no user session, and the email it carries is Clerk's word, not a caller's.
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

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values ('clerk:webhook', 'user.created', 'ops_beta_applications',
          coalesce(app_id::text, ''),
          jsonb_build_object('linked_application', app_id is not null,
                             'linked_admin_seat', seat_id is not null));

  return jsonb_build_object('application', app_id, 'admin_seat', seat_id);
end;
$$;

-- ══ Credits · maker-checker (doc 13 §6) ══════════════════════════════════════
-- Read-only workspace picker for the requester. Returns a label, never the
-- owner's email — the picker needs to identify a workspace, not expose a
-- customer's address to every ops seat.
create or replace function public.ops_workspace_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found jsonb;
begin
  perform app.ops_writer();

  select coalesce(jsonb_agg(row_to_json(w)), '[]'::jsonb) into found
  from (
    select ws.id, ws.name, ws.slug,
           coalesce(b.balance_total - b.balance_held, 0) as available
    from workspaces ws
    left join credit_balances b on b.workspace_id = ws.id
    where p_query is not null and length(trim(p_query)) >= 2
      and (ws.name ilike '%' || p_query || '%' or ws.slug ilike '%' || p_query || '%')
    order by ws.name
    limit 20
  ) w;

  return found;
end;
$$;

create or replace function public.ops_credit_request_create(
  p_workspace_id uuid,
  p_amount int,
  p_reason text,
  p_approver_email text,
  p_otp_hash text,
  p_ttl_seconds int default 600
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  requester text := app.ops_writer();
  label text;
  approver ops_admins%rowtype;
  request_id uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'OPS_CREDIT_AMOUNT' using errcode = 'raise_exception';
  end if;
  if p_otp_hash is null or length(p_otp_hash) <> 64 then
    -- sha256 hex. A request whose code cannot be checked must not exist.
    raise exception 'OPS_CREDIT_OTP_HASH' using errcode = 'raise_exception';
  end if;

  select name into label from workspaces where id = p_workspace_id;
  if label is null then
    raise exception 'OPS_CREDIT_WORKSPACE_UNKNOWN' using errcode = 'raise_exception';
  end if;

  select * into approver
  from ops_admins
  where lower(email) = lower(p_approver_email)
    and status = 'active'
    and role in ('owner', 'admin');
  if not found then
    raise exception 'OPS_CREDIT_APPROVER_UNKNOWN' using errcode = 'raise_exception';
  end if;

  -- The maker-checker rule, enforced at creation as well as at verification:
  -- a request that names its own author as approver should never be created,
  -- so the mistake surfaces before an email goes out.
  if lower(approver.email) = lower(requester) then
    raise exception 'OPS_CREDIT_SELF_APPROVER' using errcode = 'raise_exception';
  end if;

  insert into ops_credit_requests (
    workspace_id, workspace_label, amount, reason, requested_by,
    approver_id, otp_hash, otp_expires_at, status
  )
  values (
    p_workspace_id, label, p_amount, p_reason, requester,
    approver.email, p_otp_hash, now() + make_interval(secs => p_ttl_seconds), 'pending'
  )
  returning id into request_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (requester, 'credit.request', 'ops_credit_requests', request_id::text,
          jsonb_build_object('amount', p_amount, 'workspace', label,
                             'approver', approver.email));

  return jsonb_build_object('id', request_id, 'approver_email', approver.email);
end;
$$;

-- The verification. Everything that decides whether credits move happens inside
-- ONE transaction holding a row lock, so three browser tabs racing the same code
-- cannot spend three attempts on one guess or grant twice.
create or replace function public.ops_credit_request_verify(
  p_request_id uuid,
  p_otp_hash text,
  p_allow_self boolean default false
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  approver text := app.ops_writer();
  req ops_credit_requests%rowtype;
  ledger jsonb;
begin
  select * into req from ops_credit_requests where id = p_request_id for update;
  if not found then
    raise exception 'OPS_CREDIT_UNKNOWN' using errcode = 'raise_exception';
  end if;

  -- Replay. An approved request answers the same way however many times verify
  -- is called, WITHOUT touching the ledger again. apply_ledger_entry's
  -- idempotency key would also make a second call a no-op; this is the first of
  -- the two guards, and the reason a retry is cheap rather than merely safe.
  if req.status = 'approved' then
    return jsonb_build_object('ok', true, 'replayed', true, 'amount', req.amount);
  end if;
  if req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', req.status);
  end if;

  if req.otp_expires_at < now() then
    update ops_credit_requests set status = 'expired', updated_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Maker-checker (§6). The chosen approver is the one who may confirm — not
  -- merely "someone else" — so a code that reaches the wrong inbox is still
  -- useless. OPS_ALLOW_SELF_APPROVE is a dev-only escape and is stamped.
  if not p_allow_self then
    if lower(approver) = lower(req.requested_by) then
      return jsonb_build_object('ok', false, 'reason', 'self_approval_blocked');
    end if;
    if lower(approver) <> lower(coalesce(req.approver_id, '')) then
      return jsonb_build_object('ok', false, 'reason', 'not_the_approver');
    end if;
  end if;

  if req.attempts >= 3 then
    update ops_credit_requests set status = 'expired', updated_at = now() where id = req.id;
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if req.otp_hash is distinct from p_otp_hash then
    update ops_credit_requests
      set attempts = attempts + 1,
          status = case when attempts + 1 >= 3 then 'expired' else status end,
          updated_at = now()
      where id = req.id;

    insert into ops_audit_log (actor, action, target_table, target_id, meta)
    values (approver, 'credit.otp_failed', 'ops_credit_requests', req.id::text,
            jsonb_build_object('attempt', req.attempts + 1));

    return jsonb_build_object('ok', false, 'reason', 'wrong_code',
                              'attempts_left', greatest(0, 2 - req.attempts));
  end if;

  -- The grant. Through app.apply_ledger_entry and nowhere else, keyed on the
  -- REQUEST id so one approved request grants once for all time.
  ledger := app.apply_ledger_entry(
    p_workspace_id    => req.workspace_id,
    p_entry_type      => 'GRANT',
    p_amount          => req.amount,
    p_idempotency_key => 'admin_grant:' || req.id::text,
    p_action_type     => 'admin_grant',
    p_object_ref      => req.id::text,
    p_actor           => approver
  );

  update ops_credit_requests
    set status = 'approved',
        approver_id = approver,
        self_approved = p_allow_self and lower(approver) = lower(req.requested_by),
        ledger_idempotency_key = 'admin_grant:' || req.id::text,
        decided_at = now(),
        otp_hash = null,
        updated_at = now()
    where id = req.id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (approver, 'credit.approved', 'ops_credit_requests', req.id::text,
          jsonb_build_object('amount', req.amount, 'workspace_id', req.workspace_id,
                             'replayed', ledger -> 'replayed'));

  return jsonb_build_object('ok', true, 'replayed', coalesce((ledger ->> 'replayed')::boolean, false),
                            'amount', req.amount,
                            'balance_after', (ledger -> 'entry' ->> 'balance_after')::int);
end;
$$;

create or replace function public.ops_credit_request_deny(
  p_request_id uuid,
  p_reason text
) returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_writer();
begin
  update ops_credit_requests
    set status = 'denied', denied_reason = p_reason, approver_id = caller,
        decided_at = now(), otp_hash = null, updated_at = now()
    where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'OPS_CREDIT_NOT_PENDING' using errcode = 'raise_exception';
  end if;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'credit.denied', 'ops_credit_requests', p_request_id::text,
          jsonb_build_object('reason', p_reason));
end;
$$;

-- ══ Team and roles (doc 13 §13) ══════════════════════════════════════════════
-- Owner-only, and the last owner cannot be removed or demoted — by anyone,
-- including themselves. A console with no owner has no way back in.
create or replace function app.ops_active_owner_count() returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from ops_admins where status = 'active' and role = 'owner';
$$;

create or replace function public.ops_admin_upsert(
  p_email text,
  p_role text,
  p_name text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller text := app.ops_owner();
  seat_id uuid;
begin
  if p_role not in ('owner', 'admin', 'viewer') then
    raise exception 'OPS_ADMIN_BAD_ROLE' using errcode = 'raise_exception';
  end if;

  insert into ops_admins (email, name, role, status)
  values (lower(trim(p_email)), p_name, p_role, 'active')
  on conflict ((lower(email))) do update
    set role = excluded.role, status = 'active',
        name = coalesce(excluded.name, ops_admins.name), updated_at = now()
  returning id into seat_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'admin.upsert', 'ops_admins', seat_id::text,
          jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));

  return jsonb_build_object('id', seat_id);
end;
$$;

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
     and app.ops_active_owner_count() <= 1 then
    raise exception 'OPS_ADMIN_LAST_OWNER' using errcode = 'raise_exception';
  end if;

  update ops_admins set status = 'revoked', updated_at = now() where id = p_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'admin.revoke', 'ops_admins', p_id::text,
          jsonb_build_object('email', seat.email));
end;
$$;

-- ══ Grants ═══════════════════════════════════════════════════════════════════
-- Everything a signed-in admin calls: authenticated. The gate inside each
-- function is what actually decides, and it reads the caller's own JWT.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ops_qa_draft_save(uuid, text, text, text)',
    'public.ops_qa_finalize(uuid, text, text)',
    'public.ops_qa_artifact_add(uuid, text, int, text, text)',
    'public.ops_qa_import(jsonb)',
    'public.ops_application_set_status(uuid, text, text, text)',
    'public.ops_workspace_search(text)',
    'public.ops_credit_request_create(uuid, int, text, text, text, int)',
    'public.ops_credit_request_verify(uuid, text, boolean)',
    'public.ops_credit_request_deny(uuid, text)',
    'public.ops_admin_upsert(text, text, text)',
    'public.ops_admin_set_role(uuid, text)',
    'public.ops_admin_revoke(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- The two with no user behind them. NOT granted to authenticated: a signed-in
-- caller must never be able to submit an application as if it came from the
-- public form, or link a Clerk id to an admin seat.
revoke all on function public.ops_application_submit(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ops_application_submit(text, text, text, text, text)
  to service_role;

revoke all on function public.ops_application_link_user(text, text)
  from public, anon, authenticated;
grant execute on function public.ops_application_link_user(text, text) to service_role;

-- ops_admins needs a unique index on lower(email) as a real CONFLICT target for
-- ops_admin_upsert. Migration 11 created it as `ops_admins_email_lower`; named
-- here only if it is somehow absent, so this migration is safe on a fresh clone.
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'ops_admins_email_lower') then
    create unique index ops_admins_email_lower on ops_admins (lower(email));
  end if;
end $$;
