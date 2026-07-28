-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 16 · the approver check stops being optional
--
-- SECURITY FIX. `public.ops_credit_request_verify` took `p_allow_self boolean`
-- and, when true, skipped BOTH identity checks — self-approval and
-- `not_the_approver`. The function is granted to `authenticated`, so that
-- parameter was supplied by the caller. The app-layer gate
-- (`OPS_ALLOW_SELF_APPROVE`, read in actions/ops-credits.ts) never entered into
-- it: a direct supabase.rpc() call from any writer-role admin passed `true`
-- itself.
--
-- Proven, not theorised. With `p_allow_self: true` and a valid code, a THIRD
-- active admin — neither the requester nor the named approver — received the
-- grant:
--
--     expected { ok: true, amount: 250, … } to match object { ok: false }
--
-- So "two-admin approval" was one admin plus a boolean they controlled. Every
-- earlier maker-checker test passed because every earlier test sent `false`;
-- they proved the check works when the caller cooperates, which is not a
-- security property.
--
-- The fix removes the parameter from the client-callable signature entirely.
-- The dev escape hatch doc 13 §6 asks for survives as a DATABASE-level setting:
--
--     alter database postgres set sahoda.allow_self_approve = 'true';
--
-- A PostgREST client cannot set a GUC — it has no SQL surface, and the only
-- settings it writes are under the `request.` prefix from verified JWT claims.
-- So the flag now lives where the environment lives, and the caller cannot
-- reach it. It is NOT set on any project by this migration; production and this
-- dev project both leave it absent, which reads as false.
-- ─────────────────────────────────────────────────────────────────────────────

-- The three-argument form must GO, not merely be superseded. Postgres overloads
-- on signature: leaving it in place would keep the exploitable entry point
-- callable beside its own replacement.
drop function if exists public.ops_credit_request_verify(uuid, text, boolean);

create or replace function public.ops_credit_request_verify(
  p_request_id uuid,
  p_otp_hash text
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
  -- Read from the server, never from the call. `true` as the second argument to
  -- current_setting means "return null if unset" rather than raising, so an
  -- unconfigured database is simply false. Compared as text: a cast would let a
  -- malformed value raise instead of denying.
  allow_self boolean :=
    coalesce(current_setting('sahoda.allow_self_approve', true), 'false') = 'true';
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
  -- useless.
  --
  -- `not_the_approver` is now checked UNCONDITIONALLY. The dev escape hatch was
  -- only ever meant to let one person exercise the flow alone; it was never
  -- meant to let a stranger redeem somebody else's code, and folding both
  -- checks behind one flag is what made that possible. Only the self-approval
  -- arm is skippable, and only by the database's own setting.
  if lower(approver) <> lower(coalesce(req.approver_id, '')) then
    return jsonb_build_object('ok', false, 'reason', 'not_the_approver');
  end if;

  if not allow_self and lower(approver) = lower(req.requested_by) then
    return jsonb_build_object('ok', false, 'reason', 'self_approval_blocked');
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
        self_approved = allow_self and lower(approver) = lower(req.requested_by),
        ledger_idempotency_key = 'admin_grant:' || req.id::text,
        decided_at = now(),
        otp_hash = null,
        updated_at = now()
    where id = req.id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (approver, 'credit.approved', 'ops_credit_requests', req.id::text,
          jsonb_build_object('amount', req.amount, 'workspace_id', req.workspace_id,
                             'replayed', ledger -> 'replayed',
                             -- Stamped so a grant made under the dev escape
                             -- hatch is legible in the audit log afterwards.
                             'self_approved',
                             allow_self and lower(approver) = lower(req.requested_by)));

  return jsonb_build_object('ok', true, 'replayed', coalesce((ledger ->> 'replayed')::boolean, false),
                            'amount', req.amount,
                            'balance_after', (ledger -> 'entry' ->> 'balance_after')::int);
end;
$$;

revoke all on function public.ops_credit_request_verify(uuid, text) from public, anon;
grant execute on function public.ops_credit_request_verify(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- And one smaller thing found in the same pass.
--
-- `ops_qa_artifact_add` checked only that the caller was A writer and that the
-- run EXISTS. Every sibling in the QA composer (`ops_qa_draft_save`,
-- `ops_qa_finalize`) additionally requires the run to be the caller's own and
-- still open. So any admin could attach a screenshot to anybody's run, including
-- one already finalised — which is the one moment a QA record is supposed to
-- stop changing.
-- ─────────────────────────────────────────────────────────────────────────────
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
  caller text := app.ops_writer();
  artifact_id uuid;
begin
  -- The bucket enforces size and type too (migration 12). Both, because a limit
  -- that lives only in the application disappears the first time somebody calls
  -- storage directly.
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10485760 then
    raise exception 'OPS_QA_ARTIFACT_SIZE' using errcode = 'raise_exception';
  end if;
  if p_mime not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'OPS_QA_ARTIFACT_MIME' using errcode = 'raise_exception';
  end if;

  -- Same predicate ops_qa_finalize uses: yours, and still running.
  if not exists (
    select 1 from ops_qa_runs
     where id = p_run_id and status = 'running' and ops_qa_runs.actor = caller
  ) then
    raise exception 'OPS_QA_DRAFT_NOT_OPEN' using errcode = 'raise_exception';
  end if;

  insert into ops_qa_artifacts (run_id, storage_path, caption, bytes, mime)
  values (p_run_id, p_storage_path, p_caption, p_bytes, p_mime)
  returning id into artifact_id;

  return artifact_id;
end;
$$;

revoke all on function public.ops_qa_artifact_add(uuid, text, int, text, text) from public, anon;
grant execute on function public.ops_qa_artifact_add(uuid, text, int, text, text) to authenticated;
