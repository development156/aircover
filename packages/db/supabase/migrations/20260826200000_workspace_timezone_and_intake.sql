-- ─────────────────────────────────────────────────────────────────────────────
-- Where the business is, and what kind of business it is
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHAT THIS IS FOR. `docs/55` step 4. Two facts the product has never held and
-- has been guessing instead:
--
--   · TIMEZONE. No claim about WHEN to post can be honest without it, and the
--     guessing is already visible. MEASURED 2026-08-26: `Asia/Kolkata` is
--     hardcoded 38 times across 29 non-test files, while the scheduling INPUT
--     runs on the browser's own zone (`schedule-choices.ts` calls `setHours`,
--     which is host-local). So a customer in Dubai picks "tomorrow morning",
--     gets 9:00 Gulf time as the stored instant, and the list reads it back to
--     them as "11:30 am IST". `loop_settings.plan_at_minute` has stored a
--     workspace-local wall-clock minute since 20260820000200 with no zone to
--     interpret it in, and has zero runtime readers for exactly that reason.
--
--   · WHAT KIND OF BUSINESS. Needed for a cohort — "how do other food
--     businesses do" — which is `docs/55` step 11, and for the `regime x locale`
--     rule packs the refusal gate already resolves.
--
-- WHY THREE COLUMNS AND NOT ONE `category`. `docs/55` asks for
-- `workspaces.category`. This ships `business_model`, `regime` and `locale`
-- instead, because that vocabulary ALREADY EXISTS, is already asked for at
-- onboarding, and is already persisted inside `brand_memory.payload.intake`.
-- `apps/web/src/lib/onboarding/intake.ts` is the source and states the
-- distinction it is built on: model is the SHAPE of the encounter, regime is
-- the LAW over what may be claimed, locale is the jurisdiction. A bakery and a
-- caterer share a regime and differ in model. Collapsing that to one `category`
-- would either lose an axis or invent a second taxonomy for the same fact, and
-- the non-negotiable in CLAUDE.md exists to stop the second one.
--
-- NULL IS A REAL ANSWER ON ALL FOUR, AND THE MOST COMMON ONE TODAY. MEASURED
-- against `rloztdhzfliyvpvxsgjl` on 2026-08-26: of 33 workspaces, ONE carries a
-- timezone anywhere (a demo seed, in `settings`), and TWO have an intake in
-- their brand memory. NULL here means "nobody has told us", which is a
-- different sentence from any default, and the product must be able to say it.
-- `to-stored-intake.ts` already refuses to persist a classification it merely
-- assumed; these columns inherit that rule rather than weaken it.
--
-- NOTHING IS DEFAULTED TO 'UTC' OR TO 'Asia/Kolkata'. A default would convert
-- "we never asked" into a confident claim about where somebody lives, and the
-- first thing built on top of it would report a best posting hour computed in a
-- country the customer has never been to.
--
-- THE EXISTING UTC COLUMNS ARE NOT CHANGED AND MUST NOT BE. The generated
-- `measured_on` on `post_metric_snapshots`, `captured_on`/`fetched_on` on the
-- radar tables and the audience `measured_on` are all UTC on purpose: they back
-- uniqueness rules, and a per-workspace zone would make the same measurement
-- land on different days for different readers. This column is for INTERPRETING
-- those instants for one customer, never for storing them.
--
-- IF THIS IS WRONG: nothing that runs today changes. Every column is new,
-- nullable, has no default, and no shipped code reads any of them yet. The one
-- new behaviour is the trigger, which refuses a timezone that is not a real
-- zone; a workspace update that does not touch `timezone` never reaches it.
--
-- REVERSIBLE: yes.
--   drop trigger if exists workspaces_timezone_is_real on public.workspaces;
--   drop function if exists public.refuse_unknown_timezone();
--   -- and reverse 20260826210000 first, which adds a second trigger to this
--   -- table and is the erasure half of this change.
--   alter table public.workspaces
--     drop column timezone, drop column business_model,
--     drop column regime,   drop column locale;
--
-- RLS: no new table, so no new policy. `workspaces` already carries row-level
-- security and these columns inherit it, because a policy grants access to a
-- ROW and never to a subset of its columns. `ws_update` lets a member update
-- their own workspace, which is what the settings screen needs.

-- ── 1 of 4 · the columns ─────────────────────────────────────────────────────

alter table public.workspaces
  -- An IANA zone name, e.g. `Asia/Kolkata`. NULL means nobody has told us where
  -- this business is, which is true of 32 of the 33 workspaces that exist.
  add column if not exists timezone text,
  -- The three onboarding picks, promoted out of `brand_memory.payload.intake`
  -- so a cohort query is an index scan rather than a jsonb sweep. The value
  -- lists mirror BUSINESS_MODELS, REGIMES and LOCALES in
  -- `apps/web/src/lib/onboarding/intake.ts`; `workspaces-contract.pglite.test.ts`
  -- fails if the two ever separate.
  add column if not exists business_model text,
  add column if not exists regime text,
  add column if not exists locale text;

comment on column public.workspaces.timezone is
  'IANA zone name for this business, e.g. Asia/Kolkata. NULL means nobody has told us - it is not a missing value to be defaulted to UTC. Used to interpret stored instants for one customer; the UTC day boundaries on the snapshot tables are deliberate and unaffected.';
comment on column public.workspaces.business_model is
  'How the business reaches a person - the shape of the encounter. One of BUSINESS_MODELS. NULL means onboarding never classified it, or classified it only by assumption, which is never stored.';
comment on column public.workspaces.regime is
  'The rulebook over what this business may claim - the law of the encounter. One of REGIMES, and the axis a cohort comparison groups by. NULL means unasked.';
comment on column public.workspaces.locale is
  'Jurisdiction: whose regulator applies and which counterparty reads as real. One of LOCALES. NULL means unasked. This is not a timezone and must never be used as one - AE alone spans one zone but IN, US and other do not agree.';

-- ── 2 of 4 · closed value lists ──────────────────────────────────────────────
-- Named constraints so `check-constraints.test.ts` can read them and adjudicate
-- every `.eq('regime', …)` in the app against this list.

alter table public.workspaces
  drop constraint if exists workspaces_business_model_check;
alter table public.workspaces
  add constraint workspaces_business_model_check
  check (business_model is null or business_model in
    ('local_presence', 'service', 'institution', 'product', 'platform'));

alter table public.workspaces
  drop constraint if exists workspaces_regime_check;
alter table public.workspaces
  add constraint workspaces_regime_check
  check (regime is null or regime in
    ('food', 'healthcare', 'finance', 'education', 'beauty', 'consumer'));

alter table public.workspaces
  drop constraint if exists workspaces_locale_check;
alter table public.workspaces
  add constraint workspaces_locale_check
  check (locale is null or locale in ('IN', 'US', 'GB', 'AE', 'SG', 'other'));

-- ── 3 of 4 · the timezone must be a zone Postgres knows ──────────────────────
--
-- A CHECK cannot do this: validating against `pg_timezone_names` is a catalog
-- lookup, which is STABLE and not IMMUTABLE, and a CHECK may only call the
-- latter. A trigger is the only place the real test can live.
--
-- It is worth the trigger. `Asia/Kolkatta` is a plausible typo, passes any
-- shape test, and would silently shift every hour this product ever reports
-- for that customer. The failure mode of a wrong zone is not an error, it is a
-- confidently wrong number, which is the class of defect this codebase spends
-- most of its guards on.

create or replace function public.refuse_unknown_timezone()
returns trigger
language plpgsql
-- Pinned, so this function does not join the 15 `function_search_path_mutable`
-- advisories the linter already reports.
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone)
  then
    raise exception
      'timezone % is not a zone this database knows; use an IANA name such as Asia/Kolkata',
      new.timezone
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_timezone_is_real on public.workspaces;
create trigger workspaces_timezone_is_real
  before insert or update of timezone on public.workspaces
  for each row
  -- `update of timezone` fires when the column is in the UPDATE's target list
  -- even if the value is unchanged, so an ordinary rename never reaches this.
  execute function public.refuse_unknown_timezone();

-- ── 4 of 4 · backfill only what was actually recorded ────────────────────────
--
-- Two sources, both of them things a person already told us. Nothing is
-- inferred, and no row without a stored answer is given one.
--
-- MEASURED before writing this: 1 workspace has `settings->>'timezone'` (the
-- Chai & Chapters demo seed, Asia/Kolkata) and 2 have an intake in their latest
-- brand memory. So this touches 3 rows at most and leaves 30 NULL, which is the
-- honest state.

update public.workspaces w
   set timezone = w.settings->>'timezone'
 where w.timezone is null
   and w.settings ? 'timezone'
   and exists (
     select 1 from pg_catalog.pg_timezone_names z
      where z.name = w.settings->>'timezone'
   );

with latest as (
  select distinct on (workspace_id)
         workspace_id,
         payload->'intake' as intake
    from public.brand_memory
   where payload ? 'intake'
   order by workspace_id, version desc
)
-- Each axis is filtered against its own list rather than trusted. `payload` is
-- a jsonb bag that `resolve_brand_memory` does not validate beyond six named
-- sections, so a value outside the enum is possible in principle. Filtered
-- here, one stray string would abort the whole migration on the CHECK.
update public.workspaces w
   set business_model = coalesce(
         w.business_model,
         (select l.intake->>'model'
           where l.intake->>'model' in
             ('local_presence', 'service', 'institution', 'product', 'platform'))
       ),
       regime = coalesce(
         w.regime,
         (select l.intake->>'regime'
           where l.intake->>'regime' in
             ('food', 'healthcare', 'finance', 'education', 'beauty', 'consumer'))
       ),
       locale = coalesce(
         w.locale,
         (select l.intake->>'locale'
           where l.intake->>'locale' in ('IN', 'US', 'GB', 'AE', 'SG', 'other'))
       )
  from latest l
 where l.workspace_id = w.id;

-- THE ERASURE HALF IS A SEPARATE FILE, AND THE REASON MATTERS.
-- These columns must be cleared when a workspace is erased, and that trigger
-- lives in 20260826210000 rather than here because it needs
-- `workspaces.deleted_at`, which `20260823000000_dpdp_erasure` adds. MEASURED
-- 2026-08-26: that migration is in this repository and is NOT applied to
-- production, so a trigger on `deleted_at` cannot be created there today.
-- Splitting keeps each file applicable on its own, and keeps what production
-- ran identical to what this repository says it ran.

-- ── indexes ──────────────────────────────────────────────────────────────────
-- Partial, because the majority of rows are NULL on both and a cohort query
-- only ever asks about the ones that are not.

create index if not exists workspaces_regime_idx
  on public.workspaces (regime) where regime is not null;
create index if not exists workspaces_timezone_idx
  on public.workspaces (timezone) where timezone is not null;
