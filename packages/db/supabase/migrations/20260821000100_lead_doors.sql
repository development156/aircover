-- ─────────────────────────────────────────────────────────────────────────────
-- M8 · Leads — the two doors, opened
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `leads` has existed since 20260718000007 with row-level security, a five-value
-- status CHECK and NO WRITER. The screen at /leads has said so in as many words:
-- two doors, neither open. This file opens them, and it opens them as functions
-- rather than as policies — which is the whole design, not a detail.
--
-- ── WHY NOT SIMPLY ADD AN INSERT POLICY ──────────────────────────────────────
-- Because the two doors have two different callers and NEITHER of them is "a
-- member inserting a row".
--
--   the site form   — a stranger. There is no member to be. An INSERT policy for
--                     `authenticated` would not help them, and one for `anon`
--                     WOULD be the open public insert this repo has already
--                     ruled out by name: 20260727072107 §"Beta applications" —
--                     "Doc 13 §5 is explicit that there is no anon-insert RLS
--                     path, and granting this to `anon` would BE that path — an
--                     open public insert rate-limited by nothing but our own
--                     route." NEXT_PUBLIC_SUPABASE_ANON_KEY ships to every
--                     browser, so an anon grant is a lead-forgery endpoint for
--                     anyone who opens dev tools.
--
--   the inbox       — a member, but one who must not be able to write ANY lead
--                     row they like. Promoting a conversation to a lead is a
--                     copy of a thread the workspace already holds; a bare
--                     INSERT policy would additionally let them fabricate an
--                     enquiry that never happened.
--
-- So the tenant boundary stays exactly where it is. `leads` keeps its select and
-- update policies and gains no others, and the two assertions in
-- `packages/db/tests/rls.test.ts` — that a member cannot INSERT and cannot
-- DELETE a lead even in their own tenant — remain TRUE after this migration.
-- If either of them starts failing, this file picked the wrong shape.
--
-- ── THE SIGNATURE IS THE SECURITY ────────────────────────────────────────────
-- `lead_submit` takes NO workspace id. A service-role function that accepted one
-- would be cross-tenant lead injection from a public endpoint: post any
-- workspace's uuid and the row lands there. It takes the site's SLUG — which is
-- globally unique and is the thing the visitor's browser was actually on — and
-- resolves the tenant from `sites` inside the function. There is no value a
-- caller can send that steers which workspace the row lands in, other than by
-- naming a site that really belongs to it.
--
-- ── WHAT `lead_submit` DELIBERATELY DOES NOT CHECK ───────────────────────────
-- It does not require `sites.status = 'published'`. Sites v0 generates and
-- previews and does not deploy yet, so every real site is a draft — requiring
-- `published` would open the door onto a wall and reproduce the exact dead state
-- this migration exists to end. The site's status AT SUBMISSION TIME is recorded
-- in `source` instead, so a lead that arrived from an undeployed site is
-- distinguishable later rather than indistinguishable now.
--
-- It does not rate-limit and it does not check a captcha. Those are the route's
-- job (`api/public/site-lead`), in that order, before this is ever called —
-- the same order `api/public/beta-apply` uses.
--
-- IF THIS IS WRONG: /leads has no writer, which is exactly where it is today.
-- Nothing existing breaks: no table, column, policy or existing function is
-- altered by this file.
--
-- REVERSIBLE:
--   drop function if exists public.lead_submit(text, text, text, text, text, jsonb, text);
--   drop function if exists public.lead_from_inbox(uuid);
--
-- APPLY ORDER: after 20260718000007_sites.sql (leads, sites) and
-- 20260804020000_inbox_foundations.sql (inbox_threads).


-- ══ Door 1 · a form on a Sahoda site ═════════════════════════════════════════

create or replace function public.lead_submit(
  p_site_slug text,
  p_name text,
  p_email text,
  p_phone text,
  p_message text,
  p_payload jsonb default '{}'::jsonb,
  p_source_url text default null
) returns jsonb
language plpgsql
volatile
-- DEFINER, and the reason is narrow: `leads` has no INSERT policy for anyone,
-- and the caller is a stranger with no role at all. Everything the elevated
-- rights are used for is on the next twenty lines and nothing else.
security definer
set search_path = public
as $$
declare
  target sites%rowtype;
  fresh_id uuid;
  clean_email text := nullif(btrim(coalesce(p_email, '')), '');
  clean_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  -- The tenant, RESOLVED — never supplied. See the header.
  select * into target from sites where slug = p_site_slug;
  if not found then
    -- Deliberately the same shape as every other refusal, and deliberately not
    -- an exception: the route turns this into one sentence for a visitor who
    -- cannot act on it either way, and a raised error would put a Postgres
    -- message on somebody's landing page.
    return jsonb_build_object('ok', false, 'reason', 'no_such_site');
  end if;

  -- A lead with no way to reply to it is not a lead. This is the ONE piece of
  -- validation that lives here rather than in the route's zod schema, because it
  -- is a rule about the ROW: every other caller this function ever gains has to
  -- obey it too, and a schema in one route cannot make that true.
  if clean_email is null and clean_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_contact');
  end if;

  insert into leads (
    workspace_id, site_id, name, email, phone, message, payload, source, status
  )
  values (
    target.workspace_id,
    target.id,
    nullif(btrim(coalesce(p_name, '')), ''),
    clean_email,
    clean_phone,
    nullif(btrim(coalesce(p_message, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    jsonb_build_object(
      'kind', 'site_form',
      'site_slug', p_site_slug,
      -- What the site WAS when this arrived, not what it is when someone reads
      -- the lead. See the header.
      'site_status', target.status,
      'url', p_source_url
    ),
    'new'
  )
  returning id into fresh_id;

  -- The id IS returned here, unlike `ops_application_submit`, because the caller
  -- is our own route rather than the visitor — the route logs it and does not
  -- put it in the response.
  return jsonb_build_object('ok', true, 'id', fresh_id);
end;
$$;

-- service_role ONLY. `authenticated` is revoked as well as `anon`: a signed-in
-- customer must not be able to post an enquiry as if a stranger had left it.
revoke all on function public.lead_submit(text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.lead_submit(text, text, text, text, text, jsonb, text)
  to service_role;

comment on function public.lead_submit(text, text, text, text, text, jsonb, text) is
  'The public site form''s only write. Takes the site SLUG and resolves the '
  'workspace from it — there is no caller-supplied tenant. service_role only.';


-- ══ Door 2 · an enquiry that arrived in the inbox ═════════════════════════════

create or replace function public.lead_from_inbox(p_thread_id uuid)
returns jsonb
language plpgsql
volatile
-- DEFINER again, and for the same single reason: `leads` has no INSERT policy.
-- The membership check below is therefore doing the work RLS would have done,
-- and it is written as `exists` rather than `not in` on purpose — `x not in
-- (subquery)` evaluates to NULL if the subquery ever yields a NULL, `if NULL`
-- takes the else branch, and the guard would wave the row through. `exists` has
-- no such shape.
security definer
set search_path = public
as $$
declare
  thread inbox_threads%rowtype;
  existing uuid;
  fresh_id uuid;
begin
  select * into thread from inbox_threads where id = p_thread_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_such_thread');
  end if;

  if not exists (
    select 1 from app.member_workspace_ids() as ws where ws = thread.workspace_id
  ) then
    -- The same answer a stranger gets for a thread that does not exist would be
    -- better still, but these two are already indistinguishable to the caller:
    -- both are a refusal with no row and no detail about what else is in there.
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- IDEMPOTENT. Pressing the button twice, or two people pressing it at once,
  -- must not produce two leads for one conversation — a duplicated person in a
  -- pipeline is worse than a missing one, because both get chased.
  select id into existing
  from leads
  where workspace_id = thread.workspace_id
    and source ->> 'kind' = 'inbox'
    and source ->> 'thread_id' = p_thread_id::text
  limit 1;
  if existing is not null then
    return jsonb_build_object('ok', true, 'id', existing, 'existing', true);
  end if;

  insert into leads (
    workspace_id, site_id, name, email, phone, message, payload, source, status
  )
  values (
    thread.workspace_id,
    -- No site. This enquiry did not come from one, and pointing it at an
    -- arbitrary site would be an invented provenance.
    null,
    thread.author_name,
    -- A platform conversation carries a handle, never an address or a number.
    -- Both stay NULL rather than being filled with the handle: an email column
    -- holding "@cornerbakery" is a column that lies to every reader of it.
    null,
    null,
    thread.body,
    jsonb_build_object('author_handle', thread.author_handle),
    jsonb_build_object(
      'kind', 'inbox',
      'thread_id', p_thread_id::text,
      'channel', thread.channel,
      'thread_kind', thread.kind,
      'permalink', thread.permalink
    ),
    'new'
  )
  returning id into fresh_id;

  return jsonb_build_object('ok', true, 'id', fresh_id, 'existing', false);
end;
$$;

revoke all on function public.lead_from_inbox(uuid) from public, anon;
grant execute on function public.lead_from_inbox(uuid) to authenticated;

comment on function public.lead_from_inbox(uuid) is
  'Promote an inbox conversation to a lead. Checks membership INSIDE, because '
  'security definer has already bypassed the policy that would have checked it.';


-- ══ Door 2b · the inbox a person is actually looking at ══════════════════════
--
-- `lead_from_inbox` above is the right function for a stored thread and it has
-- no traffic, because NOTHING WRITES `inbox_threads`. The table shipped on
-- 2026-08-04 deliberately empty — "it does not invent a source", says its own
-- header — and the inbox a customer opens reads Zernio live instead. So a door
-- keyed on a row that does not exist is a door onto a wall.
--
-- This is the same door, for the surface the enquiries are actually on. The
-- difference between the two is not convenience and it is written into the row:
--
--   lead_from_inbox         derives EVERY field from a row this database owns.
--                           The caller supplies an id and nothing else.
--   lead_from_conversation  cannot. The conversation lives at Zernio and this
--                           database has never seen it, so the details come from
--                           the member's own screen — and `source.details` records
--                           `from_client`, so nobody later reads a lead as if
--                           Sahoda had observed it.
--
-- ── WHY A CALLER-SUPPLIED WORKSPACE ID IS SAFE HERE AND NOT ON DOOR 1 ────────
-- Door 1's caller is a stranger, so any tenant they could name would be a tenant
-- they could write into. This caller is an authenticated member, and the
-- membership check below means the only workspaces they can name are ones they
-- already belong to. A member recording an enquiry in their own shop is the
-- feature; the thing that must be impossible is reaching somebody else's.
create or replace function public.lead_from_conversation(
  p_workspace_id uuid,
  p_conversation_ref text,
  p_channel text,
  p_author_name text default null,
  p_author_handle text default null,
  p_message text default null,
  p_permalink text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  existing uuid;
  fresh_id uuid;
begin
  if p_conversation_ref is null or btrim(p_conversation_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_conversation');
  end if;

  -- `exists`, never `not in`: a subquery yielding NULL makes `not in` evaluate to
  -- NULL, `if NULL` takes the else branch, and the guard waves the row through.
  if not exists (
    select 1 from app.member_workspace_ids() as ws where ws = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- IDEMPOTENT on the conversation, per workspace. Two people pressing at once
  -- must not chase one person twice.
  select id into existing
  from leads
  where workspace_id = p_workspace_id
    and source ->> 'kind' = 'inbox'
    and source ->> 'conversation_ref' = p_conversation_ref
  limit 1;
  if existing is not null then
    return jsonb_build_object('ok', true, 'id', existing, 'existing', true);
  end if;

  insert into leads (
    workspace_id, site_id, name, email, phone, message, payload, source, status
  )
  values (
    p_workspace_id,
    null,
    nullif(btrim(coalesce(p_author_name, '')), ''),
    -- A platform conversation carries a handle, never an address or a number.
    -- Both stay NULL rather than being filled with the handle: an email column
    -- holding "@cornerbakery" is a column that lies to every reader of it.
    null,
    null,
    nullif(btrim(coalesce(p_message, '')), ''),
    jsonb_build_object('author_handle', p_author_handle),
    jsonb_build_object(
      'kind', 'inbox',
      'conversation_ref', p_conversation_ref,
      'channel', p_channel,
      'permalink', p_permalink,
      -- THE HONEST PART. These fields came from the caller, not from a row this
      -- database holds, and a reader six months from now needs to know which.
      'details', 'from_client'
    ),
    'new'
  )
  returning id into fresh_id;

  return jsonb_build_object('ok', true, 'id', fresh_id, 'existing', false);
end;
$$;

revoke all on function public.lead_from_conversation(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.lead_from_conversation(uuid, text, text, text, text, text, text)
  to authenticated;

comment on function public.lead_from_conversation(uuid, text, text, text, text, text, text) is
  'Promote a LIVE inbox conversation to a lead. Membership is checked inside; '
  'the details come from the caller and source.details records that.';
