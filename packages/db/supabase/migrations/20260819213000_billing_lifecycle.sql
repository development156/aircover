-- ─────────────────────────────────────────────────────────────────────────────
-- Billing lifecycle: dunning state, the tax-invoice document store, and the
-- customer's billing profile.
--
-- ADDITIVE ONLY. Nothing here drops, renames or rewrites an applied object; the
-- only ALTERs add nullable columns or columns with defaults, so no existing row
-- can violate anything. Safe to apply to a live database with traffic on it.
--
-- ── WHAT IS DELIBERATELY *NOT* HERE ─────────────────────────────────────────
--   · No new `credit_ledger.entry_type`. A chargeback is an ADJUST with a
--     negative amount — a COMPENSATING ENTRY. Widening that enum would be
--     changing the ledger's mechanics, which are fixed.
--   · No `dunning_attempts` table. `subscriptions.status` already carries
--     past_due / grace / suspended / canceled; all that was missing was WHEN the
--     grace window ends and HOW MANY retries have run. Two columns, not a table.
--   · No abuse-score column. Free-tier controls count existing rows
--     (`workspaces.created_by`) and store nothing.
--
-- ── OWNERSHIP NOTE ───────────────────────────────────────────────────────────
-- CLAUDE.md reserves this directory for the wt-db lane. This file was written in
-- the billing lane because GST invoicing cannot be derived from anything that
-- exists — an invoice serial has to be allocated and stored. Flagged loudly in
-- the lane report rather than slipped in.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1 · Dunning state on the existing subscription
-- ═════════════════════════════════════════════════════════════════════════════

alter table subscriptions
  -- When the plan's entitlements stop applying. NULL means no dunning window is
  -- open. `advanceStage` in @sahoda/billing refuses to suspend on a NULL rather
  -- than reading it as expired: a missing timestamp is OUR gap, and it must never
  -- cost a paying customer their channels.
  add column if not exists grace_ends_at timestamptz,
  -- Automatic retries already made against the failed payment. Indexes the retry
  -- schedule directly (RETRY_OFFSETS_HOURS), so 3 means "exhausted".
  add column if not exists dunning_attempts int not null default 0,
  add column if not exists last_failure_at timestamptz,
  -- The provider's own failure code, verbatim, for support. Never shown raw.
  add column if not exists last_failure_code text,
  -- A DOWNGRADE scheduled for the period boundary. Downgrades are never immediate
  -- (credits already granted may already be spent, and the ledger cannot go below
  -- zero), so the intent has to be parked somewhere until the period ends.
  add column if not exists pending_plan_id text references plans (id),
  add column if not exists pending_plan_effective_at timestamptz;

alter table subscriptions
  add constraint subscriptions_dunning_attempts_nonneg check (dunning_attempts >= 0),
  -- A pending plan without a date, or a date without a plan, is a half-written
  -- intention that a sweeper would either apply at the wrong time or never.
  add constraint subscriptions_pending_plan_paired check (
    (pending_plan_id is null) = (pending_plan_effective_at is null)
  );

-- Lets the dunning sweeper find work without scanning every subscription.
create index if not exists subscriptions_grace_ends_at
  on subscriptions (grace_ends_at)
  where status in ('past_due', 'grace', 'suspended');

create index if not exists subscriptions_pending_plan
  on subscriptions (pending_plan_effective_at)
  where pending_plan_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2 · Who we are invoicing
-- ═════════════════════════════════════════════════════════════════════════════

-- One row per workspace. Written server-side only (tenant READ policy), because a
-- GSTIN on a tax invoice is a statutory field and must pass a checksum before it
-- is stored — a check that lives in @sahoda/shared's parseGstin, not in a policy.
create table if not exists billing_profiles (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  -- 'registered' (has a GSTIN) · 'unregistered' (India, no GSTIN) · 'overseas'.
  -- Three different tax outcomes, so three variants rather than nullable fields:
  -- "registered with no GSTIN" must not be a representable state.
  tax_kind text not null check (tax_kind in ('registered', 'unregistered', 'overseas')),
  legal_name text not null,
  -- 15 characters, checksum-verified before insert. Present iff registered.
  gstin text,
  -- GST state code (2 digits). Present for both Indian variants; for a registered
  -- customer it MUST agree with the first two characters of the GSTIN.
  state_code text,
  -- ISO 3166-1 alpha-2. Present iff overseas.
  country_code text,
  address text,
  billing_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_profiles_registered_shape check (
    tax_kind <> 'registered'
    or (gstin is not null and state_code is not null and left(gstin, 2) = state_code)
  ),
  constraint billing_profiles_unregistered_shape check (
    tax_kind <> 'unregistered' or (gstin is null and state_code is not null)
  ),
  constraint billing_profiles_overseas_shape check (
    tax_kind <> 'overseas'
    or (gstin is null and state_code is null and country_code is not null)
  ),
  constraint billing_profiles_gstin_length check (gstin is null or length(gstin) = 15)
);
select app.apply_tenant_read_policy('billing_profiles');
create trigger set_updated_at before update on billing_profiles
  for each row execute function app.set_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3 · The invoice serial counter
-- ═════════════════════════════════════════════════════════════════════════════

-- India requires invoice numbers to be CONSECUTIVE within a financial year. A
-- Postgres sequence cannot provide that: `nextval` is deliberately non-transactional,
-- so a rolled-back insert burns a number and leaves a gap that a return will be
-- queried about.
--
-- A counter row locked with `for update` inside the SAME transaction as the insert
-- is gapless by construction — roll the insert back and the increment goes with it.
-- The cost is that invoice issuance for one (year, type) serialises, which for this
-- volume is free and is in any case what "consecutive" means.
create table if not exists invoice_serials (
  -- Indian financial year, April to March, as 'YY-YY' — e.g. '26-27'.
  financial_year text not null,
  document_type text not null check (document_type in ('tax_invoice', 'credit_note')),
  next_seq int not null default 1,
  primary key (financial_year, document_type),
  constraint invoice_serials_next_seq_positive check (next_seq >= 1)
);
alter table invoice_serials enable row level security;
-- (no policies: service-only — nothing outside app.issue_invoice may read or move it)

-- ═════════════════════════════════════════════════════════════════════════════
-- 4 · The documents
-- ═════════════════════════════════════════════════════════════════════════════

-- Append-only, exactly like credit_ledger, and for the same reason: a tax invoice
-- cannot be amended. A correction is a CREDIT NOTE — a new document that references
-- the one it compensates. This is the ledger's compensating-entry discipline applied
-- to the statutory record, and the two stay consistent because neither can be edited.
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,

  document_type text not null check (document_type in ('tax_invoice', 'credit_note')),
  -- The printed number, e.g. 'SL/26-27/000123'. GST caps this at 16 characters.
  serial text not null unique,
  financial_year text not null,
  serial_seq int not null,
  issued_at timestamptz not null default now(),

  -- What was supplied.
  period text,
  plan_id text references plans (id),
  sac_code text not null,

  -- SNAPSHOT of the supplier, not a join. A tax invoice states who issued it AT THE
  -- TIME. Reading today's config to render a document from two years ago would
  -- silently restate history the moment the registration changes.
  supplier_legal_name text not null,
  supplier_gstin text not null,
  supplier_state_code text not null,

  -- Snapshot of the recipient, for the same reason.
  recipient_legal_name text not null,
  recipient_gstin text,
  recipient_state_code text,
  recipient_country_code text,

  -- Where the supply landed: a GST state code, or '96' for an export.
  place_of_supply text not null,
  treatment text not null check (
    treatment in ('intra_state', 'inter_state', 'zero_rated_export')
  ),
  rate_percent int not null check (rate_percent between 0 and 100),

  -- Money, in PAISE. Integers throughout — a statutory document may not carry a
  -- floating-point rounding error.
  currency text not null default 'INR',
  gross_paise bigint not null check (gross_paise >= 0),
  taxable_paise bigint not null check (taxable_paise >= 0),
  cgst_paise bigint not null default 0 check (cgst_paise >= 0),
  sgst_paise bigint not null default 0 check (sgst_paise >= 0),
  igst_paise bigint not null default 0 check (igst_paise >= 0),
  zero_rated boolean not null default false,
  under_lut boolean not null default false,

  -- A credit note names the invoice it compensates and why.
  references_invoice_id uuid references invoices (id),
  reason text check (reason in ('refund', 'chargeback')),
  -- Credits that could NOT be taken back because they were already spent. This is
  -- the receivable: it is money owed, deliberately recorded HERE rather than as a
  -- negative credit balance, which the ledger forbids and which would misdescribe
  -- the debt anyway (credits are a delivered good; what is outstanding is money).
  shortfall_credits int not null default 0 check (shortfall_credits >= 0),

  -- Provenance.
  provider text check (provider in ('stripe', 'razorpay', 'cashfree', 'fixture')),
  provider_order_id text,
  provider_payment_id text,
  -- The ledger entry this document accounts for. A tax invoice points at the GRANT
  -- the payment produced; a credit note at the compensating ADJUST (null when the
  -- balance was already spent and no entry could be written).
  ledger_entry_id uuid references credit_ledger (id),

  meta jsonb,
  created_at timestamptz not null default now(),

  -- THE ARITHMETIC IS A CONSTRAINT, not a convention. If the lines do not add up to
  -- what the card was charged, the row does not exist.
  constraint invoices_totals_add_up check (
    taxable_paise + cgst_paise + sgst_paise + igst_paise = gross_paise
  ),
  -- CGST and SGST must be equal halves; an invoice whose halves differ is malformed.
  constraint invoices_equal_halves check (cgst_paise = sgst_paise),
  -- One treatment, one set of heads. Never both.
  constraint invoices_heads_match_treatment check (
    (treatment = 'intra_state' and igst_paise = 0)
    or (treatment <> 'intra_state' and cgst_paise = 0 and sgst_paise = 0)
  ),
  -- A credit note must say what it compensates; a tax invoice must not.
  constraint invoices_credit_note_shape check (
    (document_type = 'credit_note' and references_invoice_id is not null and reason is not null)
    or (document_type = 'tax_invoice' and references_invoice_id is null and reason is null)
  ),
  -- Only a credit note can carry a shortfall.
  constraint invoices_shortfall_only_on_credit_note check (
    document_type = 'credit_note' or shortfall_credits = 0
  ),
  constraint invoices_serial_length check (length(serial) <= 16),
  unique (financial_year, document_type, serial_seq)
);
create index if not exists invoices_workspace_issued
  on invoices (workspace_id, issued_at desc);
create index if not exists invoices_references
  on invoices (references_invoice_id)
  where references_invoice_id is not null;
select app.apply_tenant_read_policy('invoices');
create trigger block_mutations before update or delete on invoices
  for each row execute function app.block_mutations();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5 · app.issue_invoice — the ONLY write path to `invoices`
-- ═════════════════════════════════════════════════════════════════════════════

-- Mirrors app.apply_ledger_entry: security definer, service_role only, not exposed
-- through PostgREST, and the single place a row can be created. The serial is
-- allocated under a row lock inside this transaction, so the number sequence and
-- the document commit or roll back together.
--
-- Idempotent on (provider, provider_payment_id, document_type) via a partial unique
-- index: a webhook redelivery must not mint a second invoice number for one payment,
-- which would leave a real gap in a statutory sequence.
create unique index if not exists invoices_provider_payment_once
  on invoices (provider, provider_payment_id, document_type)
  where provider_payment_id is not null;

create or replace function app.issue_invoice(
  p_workspace_id uuid,
  p_document_type text,
  p_financial_year text,
  p_serial_prefix text,
  p_sac_code text,
  p_supplier_legal_name text,
  p_supplier_gstin text,
  p_supplier_state_code text,
  p_recipient_legal_name text,
  p_recipient_gstin text,
  p_recipient_state_code text,
  p_recipient_country_code text,
  p_place_of_supply text,
  p_treatment text,
  p_rate_percent int,
  p_gross_paise bigint,
  p_taxable_paise bigint,
  p_cgst_paise bigint,
  p_sgst_paise bigint,
  p_igst_paise bigint,
  p_zero_rated boolean,
  p_under_lut boolean,
  p_period text default null,
  p_plan_id text default null,
  p_references_invoice_id uuid default null,
  p_reason text default null,
  p_shortfall_credits int default 0,
  p_provider text default null,
  p_provider_order_id text default null,
  p_provider_payment_id text default null,
  p_ledger_entry_id uuid default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq      int;
  v_serial   text;
  v_existing invoices%rowtype;
  v_new      invoices%rowtype;
begin
  -- Idempotent replay: one payment, one document. Checked BEFORE the serial is
  -- allocated, so a redelivery does not consume a number it will not use.
  if p_provider_payment_id is not null then
    select * into v_existing from invoices
      where provider = p_provider
        and provider_payment_id = p_provider_payment_id
        and document_type = p_document_type;
    if found then
      if v_existing.workspace_id <> p_workspace_id then
        raise exception 'INVOICE_WORKSPACE_CONFLICT' using errcode = 'raise_exception';
      end if;
      return jsonb_build_object('invoice', to_jsonb(v_existing), 'replayed', true);
    end if;
  end if;

  -- Allocate the serial under a row lock. Gapless because the increment lives in
  -- the same transaction as the insert below.
  insert into invoice_serials (financial_year, document_type)
    values (p_financial_year, p_document_type)
    on conflict (financial_year, document_type) do nothing;

  select next_seq into v_seq from invoice_serials
    where financial_year = p_financial_year and document_type = p_document_type
    for update;

  update invoice_serials set next_seq = next_seq + 1
    where financial_year = p_financial_year and document_type = p_document_type;

  -- e.g. 'SL/26-27/000123' — 15 characters, inside the 16-character statutory cap.
  v_serial := p_serial_prefix || '/' || p_financial_year || '/' || lpad(v_seq::text, 6, '0');

  insert into invoices (
    workspace_id, document_type, serial, financial_year, serial_seq,
    period, plan_id, sac_code,
    supplier_legal_name, supplier_gstin, supplier_state_code,
    recipient_legal_name, recipient_gstin, recipient_state_code, recipient_country_code,
    place_of_supply, treatment, rate_percent,
    gross_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise,
    zero_rated, under_lut,
    references_invoice_id, reason, shortfall_credits,
    provider, provider_order_id, provider_payment_id, ledger_entry_id, meta
  ) values (
    p_workspace_id, p_document_type, v_serial, p_financial_year, v_seq,
    p_period, p_plan_id, p_sac_code,
    p_supplier_legal_name, p_supplier_gstin, p_supplier_state_code,
    p_recipient_legal_name, p_recipient_gstin, p_recipient_state_code, p_recipient_country_code,
    p_place_of_supply, p_treatment, p_rate_percent,
    p_gross_paise, p_taxable_paise, p_cgst_paise, p_sgst_paise, p_igst_paise,
    p_zero_rated, p_under_lut,
    p_references_invoice_id, p_reason, p_shortfall_credits,
    p_provider, p_provider_order_id, p_provider_payment_id, p_ledger_entry_id, p_meta
  ) returning * into v_new;

  return jsonb_build_object('invoice', to_jsonb(v_new), 'replayed', false);

exception
  -- A concurrent delivery for the same payment won the race. Return ITS document
  -- rather than raising: both callers asked for one invoice and there is one.
  when unique_violation then
    if sqlerrm like '%invoices_provider_payment_once%' then
      select * into v_existing from invoices
        where provider = p_provider
          and provider_payment_id = p_provider_payment_id
          and document_type = p_document_type;
      return jsonb_build_object('invoice', to_jsonb(v_existing), 'replayed', true);
    else
      raise;
    end if;
end;
$$;

revoke execute on function app.issue_invoice(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text,
  int, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, uuid, text,
  int, text, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function app.issue_invoice(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text,
  int, bigint, bigint, bigint, bigint, bigint, boolean, boolean, text, text, uuid, text,
  int, text, text, text, uuid, jsonb
) to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6 · The client-reachable writes
-- ═════════════════════════════════════════════════════════════════════════════
--
-- apps/web has NO service-role client by design — `lib/supabase/server.ts` states
-- it plainly and `lib/ops/service-rpc.ts` is the one bounded exception, with a
-- tested allowlist. So the two writes this feature needs from a signed-in user
-- follow `public.upsert_connection`'s model instead: SECURITY DEFINER, in `public`
-- so PostgREST exposes them, identity from `auth.jwt()` and never from an argument,
-- EXECUTE revoked from anon.
--
-- ── WHY `subscriptions` DOES NOT SIMPLY GET A WRITE POLICY ───────────────────
-- It is the obvious move and it is a privilege escalation. A tenant UPDATE policy
-- on `subscriptions` lets any member run
--     update subscriptions set plan_id = 'agency' where workspace_id = <mine>
-- and hand themselves Agency entitlements for nothing. The columns a customer may
-- move are ONLY the pending ones, so a function that can write nothing else is the
-- only safe shape.

-- The GSTIN check character, by the published mod-36 algorithm.
--
-- Duplicated from `parseGstin` in @sahoda/shared ON PURPOSE. That copy runs in the
-- server action, but any signed-in user can call the function below directly with
-- arbitrary arguments, so a check that lives only in TypeScript is not a guard —
-- it is a suggestion. A GSTIN with a wrong check digit is shaped exactly like a
-- real one, and storing it puts a wrong tax number on a statutory document and
-- denies the customer their input credit.
create or replace function app.gstin_is_valid(p_gstin text) returns boolean
language plpgsql
immutable
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_sum      int := 0;
  v_value    int;
  v_product  int;
  i          int;
begin
  if p_gstin is null or length(p_gstin) <> 15 then return false; end if;
  if p_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$' then return false; end if;

  for i in 1..14 loop
    -- position() is 1-based; the alphabet index is that minus one.
    v_value := position(substr(p_gstin, i, 1) in v_alphabet) - 1;
    if v_value < 0 then return false; end if;
    -- Factors alternate 1,2,1,2… starting at 1 for the first character.
    v_product := v_value * (case when i % 2 = 1 then 1 else 2 end);
    v_sum := v_sum + (v_product / 36) + (v_product % 36);
  end loop;

  return substr(v_alphabet, ((36 - (v_sum % 36)) % 36) + 1, 1) = substr(p_gstin, 15, 1);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.set_pending_plan_change — schedule a DOWNGRADE for the period boundary
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Error vocabulary (all SQLSTATE P0001; consumers substring-match the message):
--   AUTH_REQUIRED · INVALID_WORKSPACE · NOT_A_MEMBER · FORBIDDEN_ROLE
--   NO_SUBSCRIPTION · UNKNOWN_PLAN · NOT_A_DOWNGRADE · NO_PERIOD_END
create or replace function public.set_pending_plan_change(
  p_workspace_id uuid,
  p_plan_id      text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user      text;
  v_ws_id     uuid;
  v_role      text;
  v_sub       subscriptions%rowtype;
  v_now_price int;
  v_new_price int;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  -- Membership resolves the argument into v_ws_id and nothing below reads the
  -- argument again, so a cross-tenant write is structurally impossible.
  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  -- Owner only. Changing what the business pays is not an editor's decision.
  if v_role <> 'owner' then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  select * into v_sub from subscriptions
  where workspace_id = v_ws_id
    and status in ('trialing', 'active', 'past_due', 'grace')
  limit 1;
  if not found then
    -- No live subscription means the workspace is on Free, and there is nothing
    -- below Free to schedule.
    raise exception 'NO_SUBSCRIPTION' using errcode = 'raise_exception';
  end if;

  select price_inr into v_new_price from plans where id = p_plan_id and active;
  if not found then
    raise exception 'UNKNOWN_PLAN' using errcode = 'raise_exception';
  end if;
  select price_inr into v_now_price from plans where id = v_sub.plan_id;

  -- THE ESCALATION GUARD. Only a strictly cheaper plan may be scheduled. An UPGRADE
  -- has to go through payment, and a "pending upgrade" applied by the period-end
  -- sweeper would be a free one.
  if v_new_price >= v_now_price then
    raise exception 'NOT_A_DOWNGRADE' using errcode = 'raise_exception';
  end if;

  -- The change lands at the boundary of the period already paid for. With no period
  -- end recorded there is no boundary to land on, and inventing one would move a
  -- customer's plan on a date nothing else agrees with.
  if v_sub.current_period_end is null then
    raise exception 'NO_PERIOD_END' using errcode = 'raise_exception';
  end if;

  update subscriptions
    set pending_plan_id = p_plan_id,
        pending_plan_effective_at = v_sub.current_period_end
    where id = v_sub.id;

  return jsonb_build_object(
    'pending_plan_id', p_plan_id,
    'effective_at', v_sub.current_period_end
  );
end;
$$;

revoke all on function public.set_pending_plan_change(uuid, text) from public, anon;
grant execute on function public.set_pending_plan_change(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.clear_pending_plan_change — change your mind before it takes effect
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clear_pending_plan_change(p_workspace_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user  text;
  v_ws_id uuid;
  v_role  text;
  v_count int;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role <> 'owner' then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  -- Both columns together, because the CHECK requires them to be null or set as a
  -- pair — clearing one alone would be refused by the constraint.
  update subscriptions
    set pending_plan_id = null, pending_plan_effective_at = null
    where workspace_id = v_ws_id and pending_plan_id is not null;
  get diagnostics v_count = row_count;

  -- Idempotent: cancelling a cancellation is not an error, it is a no-op.
  return jsonb_build_object('cleared', v_count > 0);
end;
$$;

revoke all on function public.clear_pending_plan_change(uuid) from public, anon;
grant execute on function public.clear_pending_plan_change(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- public.upsert_billing_profile — who the invoice is made out to
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Error vocabulary: AUTH_REQUIRED · INVALID_WORKSPACE · NOT_A_MEMBER ·
--   FORBIDDEN_ROLE · INVALID_TAX_KIND · INVALID_GSTIN · INVALID_STATE ·
--   INVALID_COUNTRY · INVALID_NAME
create or replace function public.upsert_billing_profile(
  p_workspace_id  uuid,
  p_tax_kind      text,
  p_legal_name    text,
  p_gstin         text default null,
  p_state_code    text default null,
  p_country_code  text default null,
  p_address       text default null,
  p_billing_email text default null
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
  v_gstin  text;
  v_state  text;
  v_name   text;
begin
  v_user := auth.jwt() ->> 'sub';
  if v_user is null or v_user = '' then
    raise exception 'AUTH_REQUIRED' using errcode = 'raise_exception';
  end if;
  if p_workspace_id is null then
    raise exception 'INVALID_WORKSPACE' using errcode = 'raise_exception';
  end if;

  select m.workspace_id, m.role into v_ws_id, v_role
  from workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = v_user;
  if not found then
    raise exception 'NOT_A_MEMBER' using errcode = 'raise_exception';
  end if;
  if v_role <> 'owner' then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'raise_exception';
  end if;

  if p_tax_kind is null or p_tax_kind not in ('registered', 'unregistered', 'overseas') then
    raise exception 'INVALID_TAX_KIND' using errcode = 'raise_exception';
  end if;

  v_name := nullif(btrim(coalesce(p_legal_name, '')), '');
  if v_name is null then
    raise exception 'INVALID_NAME' using errcode = 'raise_exception';
  end if;

  v_gstin := nullif(btrim(upper(coalesce(p_gstin, ''))), '');
  v_state := nullif(btrim(coalesce(p_state_code, '')), '');

  if p_tax_kind = 'registered' then
    -- The checksum is checked HERE and not only in the application. See the note on
    -- app.gstin_is_valid: a guard that lives only in TypeScript is not a guard.
    if not app.gstin_is_valid(v_gstin) then
      raise exception 'INVALID_GSTIN' using errcode = 'raise_exception';
    end if;
    -- The state is DERIVED from the number the return is filed under. Accepting a
    -- separately-supplied state would let the two disagree.
    v_state := left(v_gstin, 2);
  elsif p_tax_kind = 'unregistered' then
    v_gstin := null;
    if v_state is null or v_state !~ '^[0-9]{2}$' then
      raise exception 'INVALID_STATE' using errcode = 'raise_exception';
    end if;
  else
    v_gstin := null;
    v_state := null;
    if p_country_code is null or p_country_code !~ '^[A-Za-z]{2}$' then
      raise exception 'INVALID_COUNTRY' using errcode = 'raise_exception';
    end if;
  end if;

  insert into billing_profiles (
    workspace_id, tax_kind, legal_name, gstin, state_code, country_code, address, billing_email
  ) values (
    v_ws_id, p_tax_kind, v_name, v_gstin, v_state,
    case when p_tax_kind = 'overseas' then upper(p_country_code) else 'IN' end,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_billing_email, '')), '')
  )
  on conflict (workspace_id) do update set
    tax_kind      = excluded.tax_kind,
    legal_name    = excluded.legal_name,
    gstin         = excluded.gstin,
    state_code    = excluded.state_code,
    country_code  = excluded.country_code,
    address       = excluded.address,
    billing_email = excluded.billing_email;

  return jsonb_build_object('workspace_id', v_ws_id, 'tax_kind', p_tax_kind);
end;
$$;

revoke all on function public.upsert_billing_profile(
  uuid, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.upsert_billing_profile(
  uuid, text, text, text, text, text, text, text
) to authenticated, service_role;
