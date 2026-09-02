-- ─────────────────────────────────────────────────────────────────────────────
-- posts / post_variants · a member may not write a publish outcome
--
-- ── THE HOLE ─────────────────────────────────────────────────────────────────
-- `app.apply_tenant_policies` gives every member full UPDATE and INSERT on
-- `posts` and `post_variants`, so `post_variants.publish_status`, `permalink`,
-- `platform_post_id`, `publish_claimed_at` and `posts.status` can be set to a
-- publish outcome through PostgREST with no publish having happened. The status
-- row keys green off `publish_status` (lib/posts/variant-status.ts) and only
-- recognises a fixture by a `fixture://` permalink, the asset delete gate reads
-- `posts.status` (20260820000000 §assert_asset_not_in_use), and Reflect reads a
-- publish that never was. `savePost` refuses `status` for exactly this reason,
-- and the schedule RPCs say "none of them can mark a post published" — but the
-- table itself did not refuse, so going around the actions was enough.
--
-- MEASURED 2026-09-02 in PGlite with the full migration set, as an authenticated
-- member: `update post_variants set publish_status = 'published', permalink =
-- 'https://instagram.com/p/fake', platform_post_id = 'fake123'` affected 1 and
-- `update posts set status = 'published'` affected 1.
--
-- ── THE GUARD ────────────────────────────────────────────────────────────────
-- Two BEFORE INSERT OR UPDATE triggers that refuse, when the statement runs as a
-- PostgREST role (`anon`, `authenticated`):
--   post_variants · publish_status entering ('publishing', 'published'), or any
--                   change to permalink, platform_post_id, publish_claimed_at.
--   posts         · status entering ('publishing', 'published').
-- Every legitimate writer of those columns is either the postgres role over a
-- pool (apps/jobs publish + reconcile stores, apps/web webhook projection) or a
-- SECURITY DEFINER RPC (release_post_for_publish, cancel_scheduled_post, the
-- loop and playbook kill switches), and inside a definer body `current_user` is
-- the owner, not the caller. Members keep every other write: body, title,
-- channels, draft → review → approved, scheduled → draft.
--
-- `failed` and `expired` are deliberately NOT locked: they are not a success
-- state, and a member re-drafting a failed post must be able to move it.
--
-- ── THE PROOF ────────────────────────────────────────────────────────────────
-- packages/db/tests/publish_state_service_only.pglite.test.ts. Mutation: change
-- `current_user in ('anon', 'authenticated')` to `current_user in ('nobody')` in
-- either function; the member's fake publish is accepted again and the suite
-- goes red.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function app.post_variants_publish_state_service_only() returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.publish_status in ('publishing', 'published')
       or new.permalink is not null
       or new.platform_post_id is not null
       or new.publish_claimed_at is not null
    then
      raise exception 'PUBLISH_STATE_SERVICE_ONLY' using errcode = 'raise_exception';
    end if;
    return new;
  end if;

  if (new.publish_status is distinct from old.publish_status
      and new.publish_status in ('publishing', 'published'))
     or new.permalink is distinct from old.permalink
     or new.platform_post_id is distinct from old.platform_post_id
     or new.publish_claimed_at is distinct from old.publish_claimed_at
  then
    raise exception 'PUBLISH_STATE_SERVICE_ONLY' using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

comment on function app.post_variants_publish_state_service_only() is
  'BEFORE INSERT OR UPDATE on post_variants: a PostgREST role (anon, authenticated) '
  'may not move publish_status into publishing/published nor touch permalink, '
  'platform_post_id or publish_claimed_at. Only the publisher (postgres role) and '
  'SECURITY DEFINER RPCs write a publish outcome.';

create or replace function app.posts_publish_state_service_only() returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.status in ('publishing', 'published')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
  then
    raise exception 'PUBLISH_STATE_SERVICE_ONLY' using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

comment on function app.posts_publish_state_service_only() is
  'BEFORE INSERT OR UPDATE on posts: a PostgREST role (anon, authenticated) may '
  'not move status into publishing/published. Only the publisher (postgres role) '
  'and SECURITY DEFINER RPCs record a publish outcome.';

drop trigger if exists post_variants_publish_state_service_only on post_variants;
create trigger post_variants_publish_state_service_only
  before insert or update on post_variants
  for each row execute function app.post_variants_publish_state_service_only();

drop trigger if exists posts_publish_state_service_only on posts;
create trigger posts_publish_state_service_only
  before insert or update on posts
  for each row execute function app.posts_publish_state_service_only();
