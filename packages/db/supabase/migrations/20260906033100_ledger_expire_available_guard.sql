-- ─────────────────────────────────────────────────────────────────────────────
-- app.apply_ledger_entry — EXPIRE gets the available-balance guard HOLD/DEBIT have
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ── THE DEFECT ───────────────────────────────────────────────────────────────
-- The `EXPIRE` branch subtracts `p_amount` from `v_total` with no check that the
-- workspace has that much to lose. HOLD and DEBIT both compute
-- `v_available = v_total - v_held` and raise `CREDIT_INSUFFICIENT` before they
-- move the balance; EXPIRE did not. An over-large expiry therefore drove
-- `balance_total` below `balance_held` (or below zero) and surfaced as a RAW
-- `check_violation` on `balance_held_le_total` / `balance_total_nonneg` — a
-- constraint name leaking out of the money path instead of the function's own
-- named error. This restores the symmetry: EXPIRE refuses the same way, with the
-- same message and the same `available`/`required` detail.
--
-- ── WHY `ADJUST` IS DELIBERATELY NOT TOUCHED HERE ────────────────────────────
-- A negative `ADJUST` is the reversal path, and `packages/billing`'s
-- `applyReversal` DEPENDS on the raw check-constraint surfacing: its
-- `isBalanceFloorViolation` matches `balance_held_le_total` /
-- `balance_total_nonneg` to detect that the balance moved under a concurrent
-- write and to RE-CLAMP and retry. Swapping that for `CREDIT_INSUFFICIENT` would
-- stop the retry loop and turn a recoverable race into a `PROVIDER_ERROR`, and
-- would break the two pinned proofs in `ledger_reversal.pglite.test.ts` plus
-- `applyReversal.test.ts` — code this migration does not own and is not
-- authorised to change. So ADJUST keeps its current, load-bearing behaviour and
-- only EXPIRE is hardened. See the report's "needs a decision".
--
-- ── SIGNATURE ────────────────────────────────────────────────────────────────
-- The body below is `20260718000006_billing_ledger.sql`'s verbatim, with ONLY
-- the EXPIRE branch changed. The 12-argument signature is reproduced exactly so
-- `create or replace` replaces the function rather than overloading it; a test
-- asserts exactly one `app.apply_ledger_entry` exists.
--
-- IF THIS IS WRONG: an over-large EXPIRE raises a constraint name instead of the
-- named error. Nothing else changes; no caller invokes EXPIRE today.
--
-- REVERSIBLE: re-apply the original definition from 20260718000006.

create or replace function app.apply_ledger_entry(
  p_workspace_id uuid,
  p_entry_type text,
  p_amount int,
  p_idempotency_key text,
  p_action_type text default null,
  p_object_ref text default null,
  p_model_tier text default null,
  p_cogs_usd_est numeric default null,
  p_settles_entry_id uuid default null,
  p_hold_ttl interval default null,
  p_actor text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal        credit_balances%rowtype;
  v_total      int;
  v_held       int;
  v_available  int;
  v_existing   credit_ledger%rowtype;
  v_hold       credit_ledger%rowtype;
  v_new        credit_ledger%rowtype;
  v_hold_exp   timestamptz;
begin
  -- 1) serialize on the per-workspace balance row
  insert into credit_balances (workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
  select * into v_bal from credit_balances where workspace_id = p_workspace_id for update;
  v_total := v_bal.balance_total;
  v_held := v_bal.balance_held;

  -- guard: amounts
  if (p_entry_type = 'ADJUST' and p_amount = 0)
     or (p_entry_type <> 'ADJUST' and p_amount <= 0) then
    raise exception 'INVALID_AMOUNT' using errcode = 'raise_exception';
  end if;

  -- 2) idempotent replay (workspace-verified)
  select * into v_existing from credit_ledger where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.workspace_id <> p_workspace_id then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = 'raise_exception';
    end if;
    return jsonb_build_object('entry', to_jsonb(v_existing), 'replayed', true);
  end if;

  -- 3) settlement pre-check (an unsettled HOLD of THIS workspace)
  if p_settles_entry_id is not null then
    select * into v_hold from credit_ledger where id = p_settles_entry_id;
    if not found or v_hold.workspace_id <> p_workspace_id or v_hold.entry_type <> 'HOLD' then
      raise exception 'INVALID_SETTLEMENT_TARGET' using errcode = 'raise_exception';
    end if;
    if exists (select 1 from credit_ledger where settles_entry_id = p_settles_entry_id) then
      raise exception 'HOLD_ALREADY_SETTLED' using errcode = 'raise_exception';
    end if;
  end if;

  -- 4) apply by type (available = total - held)
  if p_entry_type in ('GRANT', 'TOPUP', 'PERF_REWARD') then
    v_total := v_total + p_amount;
  elsif p_entry_type = 'ADJUST' then
    v_total := v_total + p_amount;
  elsif p_entry_type = 'EXPIRE' then
    -- Expiry may take back no more than AVAILABLE credits (total - held), the
    -- same boundary HOLD and DEBIT enforce. Held credits are spoken for and an
    -- expiry cannot reach past them; without this the subtraction fell through
    -- to a raw check_violation on balance_held_le_total / balance_total_nonneg.
    v_available := v_total - v_held;
    if v_available < p_amount then
      raise exception 'CREDIT_INSUFFICIENT'
        using errcode = 'raise_exception',
              detail = json_build_object('available', v_available, 'required', p_amount)::text;
    end if;
    v_total := v_total - p_amount;
  elsif p_entry_type = 'HOLD' then
    v_available := v_total - v_held;
    if v_available < p_amount then
      raise exception 'CREDIT_INSUFFICIENT'
        using errcode = 'raise_exception',
              detail = json_build_object('available', v_available, 'required', p_amount)::text;
    end if;
    v_held := v_held + p_amount;
    v_hold_exp := now() + coalesce(p_hold_ttl, interval '10 minutes');
  elsif p_entry_type = 'DEBIT' then
    if p_settles_entry_id is not null then
      if p_amount > v_hold.amount then
        raise exception 'DEBIT_EXCEEDS_HOLD' using errcode = 'raise_exception';
      end if;
      v_held := v_held - v_hold.amount; -- release the whole hold
      v_total := v_total - p_amount;    -- charge only completed units (partial batch)
    else
      v_available := v_total - v_held;
      if v_available < p_amount then
        raise exception 'CREDIT_INSUFFICIENT'
          using errcode = 'raise_exception',
                detail = json_build_object('available', v_available, 'required', p_amount)::text;
      end if;
      v_total := v_total - p_amount;
    end if;
  elsif p_entry_type = 'RELEASE' then
    if p_settles_entry_id is null then
      raise exception 'RELEASE_REQUIRES_HOLD' using errcode = 'raise_exception';
    end if;
    v_held := v_held - v_hold.amount;
  else
    raise exception 'UNKNOWN_ENTRY_TYPE' using errcode = 'raise_exception';
  end if;

  -- 5) persist balance + append the ledger row (balance_after = available after this entry)
  update credit_balances
    set balance_total = v_total, balance_held = v_held, updated_at = now()
    where workspace_id = p_workspace_id;

  insert into credit_ledger (
    workspace_id, entry_type, amount, balance_after, action_type, object_ref,
    model_tier, cogs_usd_est, idempotency_key, settles_entry_id, hold_expires_at, actor, meta
  ) values (
    p_workspace_id, p_entry_type, p_amount, v_total - v_held, p_action_type, p_object_ref,
    p_model_tier, p_cogs_usd_est, p_idempotency_key, p_settles_entry_id, v_hold_exp, p_actor, p_meta
  ) returning * into v_new;

  return jsonb_build_object('entry', to_jsonb(v_new), 'replayed', false);

exception
  when unique_violation then
    -- idempotency_key ⇒ a concurrent replay (return the winner); settles_entry_id ⇒ the
    -- hold was settled by a racing entry. A generic catch would mask a lost settlement.
    if sqlerrm like '%idempotency_key%' then
      select * into v_existing from credit_ledger where idempotency_key = p_idempotency_key;
      return jsonb_build_object('entry', to_jsonb(v_existing), 'replayed', true);
    elsif sqlerrm like '%settles_entry_id%' then
      raise exception 'HOLD_ALREADY_SETTLED' using errcode = 'raise_exception';
    else
      raise;
    end if;
end;
$$;

-- Privileges are preserved by `create or replace`; re-stated here so this file
-- can be read on its own and so a future signature drift trips the same fence.
revoke execute on function app.apply_ledger_entry(
  uuid, text, int, text, text, text, text, numeric, uuid, interval, text, jsonb
) from public, anon, authenticated;
grant execute on function app.apply_ledger_entry(
  uuid, text, int, text, text, text, text, numeric, uuid, interval, text, jsonb
) to service_role;
