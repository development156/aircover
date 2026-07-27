-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Ops · 17 · put the dev escape hatch back within reach
--
-- Migration 16 closed a real hole: `p_allow_self` was a client-supplied boolean
-- that skipped both identity checks. That fix stands and is not touched here.
--
-- But 16 also made `not_the_approver` UNCONDITIONAL, which sounded like extra
-- hardening and was actually a regression. `ops_credit_request_create` already
-- raises OPS_CREDIT_SELF_APPROVER when a request names its own author as
-- approver, so requester and approver are never the same person. Check
-- `not_the_approver` first and unconditionally, and the self-approval branch
-- behind it can never be reached — which means the escape hatch doc 13 §6 asks
-- for silently did nothing at all. Every failing call still failed, so nothing
-- was unsafe; it was a control that had stopped being a control.
--
-- Caught by an existing test, not by re-reading the diff:
--
--     the requester cannot approve their own request even with the code
--     - "reason": "self_approval_blocked"
--     + "reason": "not_the_approver"
--
-- The hatch's whole purpose is to let ONE person run the flow alone on a dev
-- database, and that necessarily means relaxing `not_the_approver` too — being
-- the wrong approver is exactly the state a lone developer is in. That is what
-- made the original parameter dangerous, and it is not dangerous coming from
-- `sahoda.allow_self_approve`, because a PostgREST caller has no way to set a
-- GUC. The dangerous part was never which checks it relaxed. It was who got to
-- decide.
--
-- So: 16's structure, 15's semantics. Both checks sit behind the flag again,
-- and the flag is the server's.
-- ─────────────────────────────────────────────────────────────────────────────

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
  --
  --     alter database postgres set sahoda.allow_self_approve = 'true';
  --
  -- Set on a dev project only. Unset here, unset in production.
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
  -- Self first, so a requester who tries to approve their own request is told
  -- what they actually did wrong rather than the technically-true-but-unhelpful
  -- `not_the_approver`.
  if not allow_self then
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
        -- True only when the hatch actually carried this grant past a check it
        -- would otherwise have failed, so the audit trail distinguishes a dev
        -- shortcut from a genuine two-person approval.
        self_approved = allow_self
          and (lower(approver) = lower(req.requested_by)
               or lower(approver) <> lower(coalesce(req.approver_id, ''))),
        ledger_idempotency_key = 'admin_grant:' || req.id::text,
        decided_at = now(),
        otp_hash = null,
        updated_at = now()
    where id = req.id;

  insert into ops_audit_log (actor, action, target_table, target_id, meta)
  values (approver, 'credit.approved', 'ops_credit_requests', req.id::text,
          jsonb_build_object('amount', req.amount, 'workspace_id', req.workspace_id,
                             'replayed', ledger -> 'replayed',
                             'self_approved', allow_self
                               and (lower(approver) = lower(req.requested_by)
                                    or lower(approver) <> lower(coalesce(req.approver_id, '')))));

  return jsonb_build_object('ok', true, 'replayed', coalesce((ledger ->> 'replayed')::boolean, false),
                            'amount', req.amount,
                            'balance_after', (ledger -> 'entry' ->> 'balance_after')::int);
end;
$$;

revoke all on function public.ops_credit_request_verify(uuid, text) from public, anon;
grant execute on function public.ops_credit_request_verify(uuid, text) to authenticated;
