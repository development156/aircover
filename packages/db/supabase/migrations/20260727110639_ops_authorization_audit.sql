-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 18 · the rest of the p_allow_self sweep
--
-- After the maker-checker bypass, every remaining ops_* function granted to
-- `authenticated` was read against one question: can a parameter change WHO MAY
-- DO WHAT, rather than what data is written?
--
-- Seventeen functions are reachable by a signed-in caller. All seventeen derive
-- identity from app.ops_writer()/app.ops_owner() — the JWT — and none takes it
-- from an argument. Three did not survive the second question.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ 1 · ops_credit_request_deny — the mirror of the bug we just fixed ═════════
--
-- verify() requires you to be the named approver. deny() required only
-- app.ops_writer(). So a third admin — neither requester nor approver — could
-- kill any pending request, and the update set `approver_id = caller`, writing
-- them into the record as the person who decided.
--
-- No credits move, so this is not the same severity. But it is the same SHAPE:
-- one half of a two-person decision enforcing the pair, the other half not. It
-- burns the OTP (otp_hash = null), so the requester must start over and a fresh
-- code must be emailed — a colleague can be kept in that loop indefinitely, and
-- the audit trail names the wrong person each time.
--
-- The requester keeps the right to deny: cancelling your own request is not
-- somebody else's decision to take.
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
  req ops_credit_requests%rowtype;
begin
  select * into req from ops_credit_requests where id = p_request_id for update;
  if not found or req.status <> 'pending' then
    raise exception 'OPS_CREDIT_NOT_PENDING' using errcode = 'raise_exception';
  end if;

  -- The named approver decides, or the requester withdraws. Nobody else.
  if lower(caller) <> lower(coalesce(req.approver_id, ''))
     and lower(caller) <> lower(req.requested_by) then
    raise exception 'OPS_CREDIT_NOT_YOURS' using errcode = 'raise_exception';
  end if;

  update ops_credit_requests
    set status = 'denied',
        denied_reason = p_reason,
        -- Only the approver's denial makes them the approver of record. A
        -- requester withdrawing their own request must not be written in as
        -- the person who reviewed it.
        approver_id = case
          when lower(caller) = lower(req.requested_by) then req.approver_id
          else caller
        end,
        decided_at = now(),
        otp_hash = null,
        updated_at = now()
    where id = p_request_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (caller, 'credit.denied', 'ops_credit_requests', p_request_id::text,
          jsonb_build_object('reason', p_reason,
                             'withdrawn', lower(caller) = lower(req.requested_by)));
end;
$$;

revoke all on function public.ops_credit_request_deny(uuid, text) from public, anon;
grant execute on function public.ops_credit_request_deny(uuid, text) to authenticated;


-- ══ 2 · ops_qa_import — the QA record could be written in someone else's name ═
--
-- `coalesce(rec.actor, caller)` took the actor from the imported JSON, so a
-- writer could insert QA runs attributed to a colleague — including `pass` rows
-- for suites that never ran. The audit log recorded the true importer, but the
-- QA console reads ops_qa_runs, and that is what a person looks at to decide
-- whether the build is healthy. It is also the data source for gate-health over
-- time.
--
-- DESIGN DECISION, flagged because it constrains SL-020 (JSON round-trip):
-- round-trip fidelity of `actor` and non-repudiation of the QA record are in
-- direct conflict, and non-repudiation wins. An imported run is attributed to
-- whoever imported it. The original actor is preserved in `details` so nothing
-- is lost, but the column that answers "who put this in the record" now always
-- answers truthfully.
--
-- `kind` is forced to 'manual' for the same reason: 'auto' means the hook
-- produced it, and a hand-imported row claiming that is a lie about provenance.
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
  provenance text;
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

    -- Nothing is lost: the claimed author is kept, as a claim, in the text.
    provenance := case
      when rec.actor is not null and lower(rec.actor) <> lower(caller)
        then coalesce(rec.details || E'\n\n', '') || 'Imported by ' || caller ||
             '; the file attributed this run to ' || rec.actor || '.'
      else rec.details
    end;

    insert into ops_qa_runs (
      id, task_code, kind, suite, status, summary_plain, details, actor,
      duration_ms, started_at, finished_at
    )
    values (
      rec.id, rec.task_code, 'manual', rec.suite, rec.status,
      rec.summary_plain, provenance, caller,
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

revoke all on function public.ops_qa_import(jsonb) from public, anon;
grant execute on function public.ops_qa_import(jsonb) to authenticated;


-- ══ 3 · ops_credit_request_create — the caller set the code's lifetime ════════
--
-- `p_ttl_seconds` was uncapped. The app passes OTP_TTL_SECONDS, but the app is
-- not the only caller: a direct RPC could set ten years and turn a
-- time-boxed code into a permanent one. Expiry is a security control, and its
-- bound was the caller's to choose — the small version of the same mistake.
--
-- Capped at one hour, floored at one minute. The app's own value sits inside
-- that range, so nothing legitimate changes.
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
  ttl int := least(greatest(coalesce(p_ttl_seconds, 600), 60), 3600);
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
    approver.email, p_otp_hash, now() + make_interval(secs => ttl), 'pending'
  )
  returning id into request_id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (requester, 'credit.request', 'ops_credit_requests', request_id::text,
          jsonb_build_object('amount', p_amount, 'workspace', label,
                             'approver', approver.email));

  return jsonb_build_object('id', request_id, 'approver_email', approver.email);
end;
$$;

revoke all on function public.ops_credit_request_create(uuid, int, text, text, text, int)
  from public, anon;
grant execute on function public.ops_credit_request_create(uuid, int, text, text, text, int)
  to authenticated;
