-- L3 · AUTOPILOT — the level that acts with nobody in the room -----------------
--
-- ── WHY THE PRECONDITIONS ARE A TRIGGER AND NOT A SCREEN ─────────────────────
-- Every other guardrail in this product that actually held was a stored fact.
-- The Loop's cost preview is the worked example: a peer forced
-- `status = 'creating'` with no approval and watched the balance not move,
-- because the refusal lives in `loop_approve_cost` rather than in the button.
-- A guard in the application layer disappears the first time the path is called
-- from somewhere else, and "somewhere else" here would be a background job
-- publishing to a customer's real account.
--
-- So the two preconditions that gate L3 are enforced HERE, on the write. They
-- are forceable — anybody can try the UPDATE — and therefore testable, which is
-- the only kind of guard this codebase counts.
--
-- ── L3 WAS UNSTORABLE BY CHECK CONSTRAINT, AND THAT WAS RIGHT ────────────────
-- `20260820000200_loop_autonomy.sql` wrote `check (level >= 0 and level <= 2)`
-- with a header saying THREE IS ABSENT ON PURPOSE. It was: nothing had been
-- built to make it safe. This migration is what makes it safe, and it widens the
-- ceiling by exactly one in the same file that adds the conditions.

-- ── 1 · The dial may now hold 3, and only under the conditions below ─────────
alter table loop_channel_autonomy drop constraint if exists loop_channel_autonomy_level_check;
alter table loop_channel_autonomy
  add constraint loop_channel_autonomy_level_check check (level >= 0 and level <= 3);

-- ── 2 · A SUPERVISED CYCLE, AND A BRAIN SOMEBODY AGREED TO ───────────────────
--
-- PRECONDITION ONE: at least one cycle this workspace ran was approved by a
-- HUMAN and reached the end. `cost_approved_by` is the person's id and is
-- written only by `loop_approve_cost`, which requires a signed-in member — so
-- its presence is proof a person looked at a price and said yes. `reported`
-- means the cycle finished rather than being abandoned halfway. Autopilot on a
-- product nobody has watched work is not autonomy, it is a guess.
--
-- PRECONDITION TWO: the four Brand Brain fields that decide what an unattended
-- post SAYS are confirmed by a person. Not a fraction of fifteen — a named set,
-- because which fields are confirmed matters more than how many:
--
--   hook.core_promise                     what the business offers
--   customer_persona.primary_pain_point   who it is for
--   voice.descriptor                      how it sounds
--   taboo.red_lines                       WHAT SAHODA MUST NEVER SAY
--
-- They are the first four of `BRAIN_FIELDS`, which is written in priority
-- order, and the last is the one that matters most when nobody is reading the
-- draft. `apps/web/src/lib/brand/autopilot-floor.ts` holds the same four and
-- `packages/db/tests/loop_autopilot_l3.pglite.test.ts` adjudicates this list
-- against that one, so the two cannot drift apart silently.
--
-- `confirmed` is a boolean inside `payload -> 'field_meta' -> <path>`, and it is
-- TRUE only when a human agreed to that exact value (see
-- packages/shared/src/brand/audiences.ts). An inferred value is not agreement.
create or replace function app.assert_autopilot_preconditions()
returns trigger
language plpgsql
as $$
declare
  v_payload jsonb;
  v_missing text[];
  v_path    text;
begin
  -- Only level 3 is gated. Every other write to this table is untouched, so a
  -- customer moving between L0, L1 and L2 pays nothing for this trigger.
  if new.level is distinct from 3 then
    return new;
  end if;

  if not exists (
    select 1 from loop_cycles c
     where c.workspace_id = new.workspace_id
       and c.cost_approved_by is not null
       and c.status = 'reported'
  ) then
    raise exception 'AUTOPILOT_NEEDS_SUPERVISED_CYCLE' using errcode = 'raise_exception';
  end if;

  select b.payload into v_payload
    from brand_memory b
   where b.workspace_id = new.workspace_id and b.status = 'active'
   limit 1;

  if v_payload is null then
    raise exception 'AUTOPILOT_NEEDS_BRAIN' using errcode = 'raise_exception';
  end if;

  v_missing := array[]::text[];
  foreach v_path in array array[
    'hook.core_promise',
    'customer_persona.primary_pain_point',
    'voice.descriptor',
    'taboo.red_lines'
  ] loop
    if coalesce(v_payload -> 'field_meta' -> v_path ->> 'confirmed', 'false') <> 'true' then
      v_missing := v_missing || v_path;
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    -- The unconfirmed paths ride in the message. "Your brain is not ready" sends
    -- somebody to a screen with fifteen fields on it and no idea which one.
    raise exception 'AUTOPILOT_BRAIN_UNCONFIRMED: %', array_to_string(v_missing, ', ')
      using errcode = 'raise_exception';
  end if;

  return new;
end;
$$;

drop trigger if exists loop_channel_autonomy_autopilot_guard on loop_channel_autonomy;
create trigger loop_channel_autonomy_autopilot_guard
  before insert or update on loop_channel_autonomy
  for each row execute function app.assert_autopilot_preconditions();

-- ── 3 · A DAILY CEILING ON TOP OF THE WEEKLY BUDGET ──────────────────────────
-- The budget stops overspending across a week. It cannot stop a bad cycle
-- emptying that week overnight, because it is a single number with no clock in
-- it. This is the clock.
--
-- Default 3. Not zero: a default of zero would mean every workspace that
-- switches on autopilot finds it publishes nothing and no screen explains why,
-- which is the class of defect this product spent Phase 1 removing. Three is a
-- day's posting for a small business and is below every per-channel rate limit
-- the adapters carry.
alter table loop_settings
  add column if not exists autopilot_daily_cap int not null default 3;
alter table loop_settings drop constraint if exists loop_settings_autopilot_daily_cap_check;
alter table loop_settings
  add constraint loop_settings_autopilot_daily_cap_check
  check (autopilot_daily_cap >= 0 and autopilot_daily_cap <= 20);

-- ── 4 · THE WINDOW IN WHICH ONE TAP STOPS IT ─────────────────────────────────
-- Every autopilot post is announced before it goes out and may be cancelled
-- inside this many minutes. This is the difference between automation and
-- something happening to you.
--
-- The floor is 5 rather than 0, and the floor is the point: a zero window is
-- not autopilot with a fast cancel, it is autopilot with no cancel, and the
-- column would then be a setting that lets somebody switch off the one guard
-- that makes the feature humane. A person who wants no delay is asking for a
-- different product.
alter table loop_settings
  add column if not exists autopilot_cancel_minutes int not null default 30;
alter table loop_settings drop constraint if exists loop_settings_autopilot_cancel_minutes_check;
alter table loop_settings
  add constraint loop_settings_autopilot_cancel_minutes_check
  check (autopilot_cancel_minutes >= 5 and autopilot_cancel_minutes <= 1440);

comment on column loop_settings.autopilot_daily_cap is
  'Most posts autopilot may publish in one day, on top of the weekly credit budget. 0 pauses autopilot without clearing the per-channel dial.';
comment on column loop_settings.autopilot_cancel_minutes is
  'Minutes between announcing an autopilot post and dispatching it. Floor of 5: a zero window is autopilot with no cancel.';
