-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-A · 06 · billing & the atomic credit ledger
-- ─────────────────────────────────────────────────────────────────────────────

-- plans (⚙ global; seeded from PLAN_CATALOG) ---------------------------------
create table plans (
  id text primary key check (id in ('free', 'starter', 'growth', 'agency')),
  name text not null,
  monthly_credits int not null,
  price_inr int not null,
  price_usd int not null,
  limits jsonb not null,
  stripe_price_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table plans enable row level security;
create policy plans_select on plans for select to authenticated using (true);
create trigger set_updated_at before update on plans
  for each row execute function app.set_updated_at();

-- subscriptions (no row ⇒ Free) ----------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  plan_id text not null references plans (id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'grace', 'suspended', 'canceled')),
  provider text not null default 'stripe' check (provider in ('stripe', 'razorpay')),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (workspace_id);
create unique index subscriptions_one_live on subscriptions (workspace_id)
  where status in ('trialing', 'active', 'past_due', 'grace');
select app.apply_tenant_read_policy('subscriptions');
create trigger set_updated_at before update on subscriptions
  for each row execute function app.set_updated_at();

-- credit_balances (mutated ONLY inside app.apply_ledger_entry) ----------------
create table credit_balances (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  balance_total int not null default 0,
  balance_held int not null default 0,
  updated_at timestamptz not null default now(),
  constraint balance_total_nonneg check (balance_total >= 0),
  constraint balance_held_nonneg check (balance_held >= 0),
  constraint balance_held_le_total check (balance_held <= balance_total)
);
select app.apply_tenant_read_policy('credit_balances');

-- credit_ledger (append-only, double-entry) ----------------------------------
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  seq bigint generated always as identity,
  entry_type text not null check (entry_type in
    ('GRANT', 'DEBIT', 'HOLD', 'RELEASE', 'TOPUP', 'PERF_REWARD', 'EXPIRE', 'ADJUST')),
  amount int not null,
  balance_after int not null,
  action_type text,
  object_ref text,
  model_tier text,
  cogs_usd_est numeric(10, 6),
  idempotency_key text not null unique,
  settles_entry_id uuid unique references credit_ledger (id),
  hold_expires_at timestamptz,
  actor text,
  meta jsonb,
  created_at timestamptz not null default now(),
  constraint amount_sign check (
    (entry_type = 'ADJUST' and amount <> 0) or (entry_type <> 'ADJUST' and amount > 0)
  )
);
create index on credit_ledger (workspace_id, seq);
-- fast lookup of open holds (for the expired-hold reaper)
create index credit_ledger_open_holds on credit_ledger (workspace_id, hold_expires_at)
  where entry_type = 'HOLD';
select app.apply_tenant_read_policy('credit_ledger');
create trigger block_mutations before update or delete on credit_ledger
  for each row execute function app.block_mutations();

-- billing_webhook_events (⚙ service-only; event-id idempotency; status IS updated) ---
create table billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider in ('stripe', 'razorpay')),
  event_id text not null,
  event_type text,
  payload jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);
alter table billing_webhook_events enable row level security;
-- (no policies: service-only)

-- ─────────────────────────────────────────────────────────────────────────────
-- app.apply_ledger_entry — the ONLY write path to credit_balances / credit_ledger.
-- Returns { entry: <ledger row>, replayed: bool }.
-- ─────────────────────────────────────────────────────────────────────────────
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

-- Lock the door: not exposed via PostgREST (app schema), and executable only by service_role.
revoke execute on function app.apply_ledger_entry(
  uuid, text, int, text, text, text, text, numeric, uuid, interval, text, jsonb
) from public, anon, authenticated;
grant execute on function app.apply_ledger_entry(
  uuid, text, int, text, text, text, text, numeric, uuid, interval, text, jsonb
) to service_role;
